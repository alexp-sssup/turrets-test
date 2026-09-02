import { LinearProgram, LpObjectiveSense } from "./LinearProgram";
import { LpSolution, LpStatus } from "./LpSolution";

/**
 * Two-phase bounded-variable primal simplex.
 *
 * Chosen over an interior-point method because the structural solver wants a *vertex*: the
 * per-joint utilization field only reads as a heatmap if the forces sit at capacity limits
 * rather than being smeared across every joint by a barrier term (spec 1.1, 7).
 *
 * Representation: the basis inverse is held dense (`m x m`) and updated in product form,
 * while the constraint matrix is sparse column-major. Per iteration that is
 * `O(m^2 + nnz(A))`, which is honest for P0-sized turrets. The class has no game
 * knowledge; swapping it for a sparse revised simplex later changes nothing above it.
 *
 * Internal column layout: `[structural | slacks | artificials]`. Every row is turned into
 * the equality `A_i . x - s_i = 0` with the slack carrying the row's bounds, so the solver
 * has one row type and an all-zero right-hand side.
 */

enum VarState {
  Basic = 0,
  AtLower = 1,
  AtUpper = 2,
  FreeAtZero = 3,
}

export class SimplexOptions {
  /** 0 selects a size-derived budget. */
  public maxIterations: number = 0;
  /** Phase-1 residual below this counts as feasible. */
  public feasibilityTolerance: number = 1e-7;
  /** Reduced costs inside this band count as optimal. */
  public optimalityTolerance: number = 1e-9;
  /** Pivots smaller than this are refused as numerically unsafe. */
  public pivotTolerance: number = 1e-8;
  /**
   * Pivots smaller than this fraction of the entering column's largest entry are also
   * refused. Without a *relative* guard, a column that is numerically a multiple of a
   * basis column offers a near-zero pivot that looks acceptable in absolute terms, and
   * taking it leaves the basis singular -- which then shows up as a confidently wrong
   * answer several thousand iterations later.
   */
  public relativePivotTolerance: number = 1e-7;
  /** Ratio-test ties inside this band are broken on pivot magnitude, or by Bland's rule. */
  public ratioTolerance: number = 1e-9;
  /**
   * Iterations without objective progress before switching to Bland's anti-cycling rule.
   *
   * Deliberately large. Bland's rule guarantees termination but prices badly, and a
   * degenerate program makes long runs of zero-improvement pivots that are real progress
   * towards the optimum rather than a cycle. Switching after 60 of them tripled the
   * iteration count on structural models; this is a safety net, not a pricing strategy.
   */
  public stallLimit: number = 1000;
  /** Basic values are recomputed from the basis this often, to bound round-off drift. */
  public refreshInterval: number = 100;
  /**
   * How many times the basis inverse may be rebuilt from scratch when the answer fails its
   * own feasibility check. Product-form updates accumulate error over thousands of
   * iterations; refactorising and re-optimising recovers, and is far cheaper than doing it
   * on a schedule.
   */
  public refactorizationAttempts: number = 3;
}

class EnteringChoice {
  public variable: number = -1;
  /** +1 to increase the entering variable, -1 to decrease it. */
  public direction: number = 0;
}

class RatioResult {
  public theta: number = 0;
  /** Basis position that leaves, or -1 for a bound flip. */
  public leavingPosition: number = -1;
  public leavingToUpper: boolean = false;
  public unbounded: boolean = false;
}

export class SimplexSolver {
  private readonly options: SimplexOptions;

  public constructor(options: SimplexOptions) {
    this.options = options;
  }

  public static withDefaults(): SimplexSolver {
    return new SimplexSolver(new SimplexOptions());
  }

  public solve(program: LinearProgram): LpSolution {
    const state = new SimplexState(program, this.options);
    return state.run();
  }
}

class SimplexState {
  private readonly program: LinearProgram;
  private readonly options: SimplexOptions;

  private readonly rowCount: number;
  private readonly structuralCount: number;
  private readonly columnCount: number;
  private readonly artificialStart: number;

  private readonly colStart: Int32Array;
  private readonly colRow: Int32Array;
  private readonly colValue: Float64Array;

  private readonly lower: Float64Array;
  private readonly upper: Float64Array;
  private readonly cost: Float64Array;
  private readonly phaseOneCost: Float64Array;

  private readonly xValues: Float64Array;
  private readonly state: Int8Array;
  private readonly basisVar: Int32Array;
  private readonly basisPos: Int32Array;
  private readonly basisInverse: Float64Array;

  private readonly duals: Float64Array;
  private readonly column: Float64Array;
  private readonly scratch: Float64Array;
  /** Nonzeros of the entering column, gathered so the FTRAN loop is O(m * nnz). */
  private readonly entryRows: Int32Array;
  private readonly entryValues: Float64Array;
  private entryCount: number = 0;
  /** Nonzeros of the pivot row of the basis inverse, gathered for the same reason. */
  private readonly pivotRowIndex: Int32Array;
  private pivotRowCount: number = 0;

  private iterations: number = 0;
  private readonly maxIterations: number;

  public constructor(program: LinearProgram, options: SimplexOptions) {
    this.program = program;
    this.options = options;

    const m = program.rowCount;
    const nStruct = program.variableCount;
    this.rowCount = m;
    this.structuralCount = nStruct;
    this.artificialStart = nStruct + m;
    this.columnCount = nStruct + 2 * m;

    this.lower = new Float64Array(this.columnCount);
    this.upper = new Float64Array(this.columnCount);
    this.cost = new Float64Array(this.columnCount);
    this.phaseOneCost = new Float64Array(this.columnCount);
    this.xValues = new Float64Array(this.columnCount);
    this.state = new Int8Array(this.columnCount);
    this.basisVar = new Int32Array(m);
    this.basisPos = new Int32Array(this.columnCount);
    this.basisInverse = new Float64Array(m * m);
    this.duals = new Float64Array(m);
    this.column = new Float64Array(m);
    this.scratch = new Float64Array(m);
    this.entryRows = new Int32Array(m > 0 ? m : 1);
    this.entryValues = new Float64Array(m > 0 ? m : 1);
    this.pivotRowIndex = new Int32Array(m);

    const objectiveSign = program.objectiveSense === LpObjectiveSense.Maximize ? -1 : 1;

    // Structural variables.
    for (let j = 0; j < nStruct; j++) {
      this.lower[j] = program.variableLowerBound(j);
      this.upper[j] = program.variableUpperBound(j);
      this.cost[j] = objectiveSign * program.objectiveCoefficient(j);
    }
    // Slacks: one per row, bounds are the row's bounds, zero cost.
    for (let i = 0; i < m; i++) {
      const slack = nStruct + i;
      this.lower[slack] = program.rowLowerBound(i);
      this.upper[slack] = program.rowUpperBound(i);
      this.cost[slack] = 0;
    }
    // Artificials: non-negative, penalised in phase one only.
    for (let i = 0; i < m; i++) {
      const artificial = this.artificialStart + i;
      this.lower[artificial] = 0;
      this.upper[artificial] = Number.POSITIVE_INFINITY;
      this.cost[artificial] = 0;
      this.phaseOneCost[artificial] = 1;
    }

    // Place every non-artificial column at a finite bound, or at zero when free.
    for (let j = 0; j < this.artificialStart; j++) {
      this.basisPos[j] = -1;
      if (Number.isFinite(this.lower[j])) {
        this.state[j] = VarState.AtLower;
        this.xValues[j] = this.lower[j];
      } else if (Number.isFinite(this.upper[j])) {
        this.state[j] = VarState.AtUpper;
        this.xValues[j] = this.upper[j];
      } else {
        this.state[j] = VarState.FreeAtZero;
        this.xValues[j] = 0;
      }
    }

    // Sparse column-major matrix, with the artificial signs chosen so the artificial basis
    // starts primal feasible.
    const residual = new Float64Array(m);
    const counts = new Int32Array(this.columnCount);
    for (let e = 0; e < program.entryCount; e++) {
      const entry = program.entryAt(e);
      counts[entry.variable]++;
      residual[entry.row] += entry.value * this.xValues[entry.variable];
    }
    for (let i = 0; i < m; i++) {
      counts[nStruct + i]++; // slack column
      counts[this.artificialStart + i]++; // artificial column
      residual[i] -= this.xValues[nStruct + i];
    }
    this.colStart = new Int32Array(this.columnCount + 1);
    for (let j = 0; j < this.columnCount; j++) {
      this.colStart[j + 1] = this.colStart[j] + counts[j];
    }
    const nnz = this.colStart[this.columnCount];
    this.colRow = new Int32Array(nnz);
    this.colValue = new Float64Array(nnz);
    const cursor = new Int32Array(this.columnCount);
    for (let j = 0; j < this.columnCount; j++) {
      cursor[j] = this.colStart[j];
    }
    for (let e = 0; e < program.entryCount; e++) {
      const entry = program.entryAt(e);
      const at = cursor[entry.variable]++;
      this.colRow[at] = entry.row;
      this.colValue[at] = entry.value;
    }
    for (let i = 0; i < m; i++) {
      const slackAt = cursor[nStruct + i]++;
      this.colRow[slackAt] = i;
      this.colValue[slackAt] = -1;

      const sign = residual[i] > 0 ? -1 : 1;
      const artificial = this.artificialStart + i;
      const artificialAt = cursor[artificial]++;
      this.colRow[artificialAt] = i;
      this.colValue[artificialAt] = sign;

      this.xValues[artificial] = -residual[i] * sign;
      this.state[artificial] = VarState.Basic;
      this.basisVar[i] = artificial;
      this.basisPos[artificial] = i;
      // B = diag(sign), so its inverse is diag(sign) as well.
      this.basisInverse[i * m + i] = sign;
    }

    this.maxIterations =
      options.maxIterations > 0 ? options.maxIterations : 30 * (m + this.columnCount) + 2000;
  }

  public run(): LpSolution {
    // A program whose variables all have a finite bound at zero and whose rows are all
    // homogeneous starts feasible, so there is nothing for phase one to do. The structural
    // model is exactly that shape, and skipping the phase saves the bulk of the work.
    let initialResidual = 0;
    for (let i = 0; i < this.rowCount; i++) {
      const value = this.xValues[this.artificialStart + i];
      if (value > initialResidual) {
        initialResidual = value;
      }
    }
    if (initialResidual > this.options.feasibilityTolerance) {
      const phaseOne = this.runPhase(this.phaseOneCost);
      if (phaseOne === LpStatus.IterationLimit) {
        return this.buildSolution(LpStatus.IterationLimit);
      }
      // Phase one minimises the artificial sum and can never be unbounded (it is bounded
      // below by zero), so anything but Optimal here is a solver bug.
      let artificialSum = 0;
      for (let i = 0; i < this.rowCount; i++) {
        artificialSum += this.xValues[this.artificialStart + i];
      }
      if (artificialSum > this.options.feasibilityTolerance) {
        return this.buildSolution(LpStatus.Infeasible);
      }
    }

    // Pin the artificials at zero instead of driving them out of the basis: a degenerate
    // basic artificial is then harmless, and no separate cleanup pass is needed.
    for (let i = 0; i < this.rowCount; i++) {
      const artificial = this.artificialStart + i;
      this.upper[artificial] = 0;
      if (this.state[artificial] !== VarState.Basic) {
        this.state[artificial] = VarState.AtLower;
        this.xValues[artificial] = 0;
      }
    }
    this.refreshBasicValues();

    let phaseTwo = this.runPhase(this.cost);

    // The product-form basis inverse drifts, and a drifted inverse produces drifted duals,
    // which can make a suboptimal vertex look optimal -- a wrong answer that passes a
    // primal feasibility check. So an "optimal" verdict is confirmed against a freshly
    // factorised basis: refactorise, re-optimise, and only believe it when the re-run has
    // nothing left to do. One O(m^3) factorisation per solve buys that, which is far
    // cheaper than refactorising on a schedule.
    for (let attempt = 0; attempt < this.options.refactorizationAttempts; attempt++) {
      if (phaseTwo !== LpStatus.Optimal) {
        break;
      }
      const before = this.iterations;
      if (!this.refactorize()) {
        return this.buildSolution(LpStatus.IterationLimit);
      }
      this.refreshBasicValues();
      phaseTwo = this.runPhase(this.cost);
      if (this.iterations === before && this.residualNorm() <= this.options.feasibilityTolerance) {
        break;
      }
    }
    return this.buildSolution(phaseTwo);
  }

  /** Largest row residual of the current point, measured against the raw matrix. */
  private residualNorm(): number {
    const m = this.rowCount;
    for (let i = 0; i < m; i++) {
      this.scratch[i] = 0;
    }
    for (let j = 0; j < this.columnCount; j++) {
      const value = this.xValues[j];
      if (value === 0) {
        continue;
      }
      const end = this.colStart[j + 1];
      for (let p = this.colStart[j]; p < end; p++) {
        this.scratch[this.colRow[p]] += this.colValue[p] * value;
      }
    }
    let worst = 0;
    for (let i = 0; i < m; i++) {
      const magnitude = this.scratch[i] < 0 ? -this.scratch[i] : this.scratch[i];
      if (magnitude > worst) {
        worst = magnitude;
      }
    }
    return worst;
  }

  /**
   * Rebuilds `B^-1` from the current basis by Gauss-Jordan elimination with partial
   * pivoting. `O(m^3)`, so it is a repair step and not part of the iteration loop. Returns
   * false when the basis has become singular, which the caller must treat as a failure
   * rather than as an answer.
   */
  private refactorize(): boolean {
    const m = this.rowCount;
    if (m === 0) {
      return true;
    }
    const width = 2 * m;
    const work = new Float64Array(m * width);
    for (let k = 0; k < m; k++) {
      const variable = this.basisVar[k];
      const end = this.colStart[variable + 1];
      for (let p = this.colStart[variable]; p < end; p++) {
        work[this.colRow[p] * width + k] = this.colValue[p];
      }
    }
    for (let i = 0; i < m; i++) {
      work[i * width + m + i] = 1;
    }
    for (let column = 0; column < m; column++) {
      let pivotRow = -1;
      let pivotMagnitude = this.options.pivotTolerance;
      for (let i = column; i < m; i++) {
        const value = work[i * width + column];
        const magnitude = value < 0 ? -value : value;
        if (magnitude > pivotMagnitude) {
          pivotMagnitude = magnitude;
          pivotRow = i;
        }
      }
      if (pivotRow < 0) {
        return false;
      }
      if (pivotRow !== column) {
        const a = column * width;
        const b = pivotRow * width;
        for (let j = 0; j < width; j++) {
          const swap = work[a + j];
          work[a + j] = work[b + j];
          work[b + j] = swap;
        }
      }
      const base = column * width;
      const inversePivot = 1 / work[base + column];
      for (let j = column; j < width; j++) {
        work[base + j] *= inversePivot;
      }
      for (let i = 0; i < m; i++) {
        if (i === column) {
          continue;
        }
        const rowBase = i * width;
        const factor = work[rowBase + column];
        if (factor === 0) {
          continue;
        }
        for (let j = column; j < width; j++) {
          work[rowBase + j] -= factor * work[base + j];
        }
      }
    }
    for (let i = 0; i < m; i++) {
      const source = i * width + m;
      const target = i * m;
      for (let j = 0; j < m; j++) {
        this.basisInverse[target + j] = work[source + j];
      }
    }
    return true;
  }

  private runPhase(costs: Float64Array): LpStatus {
    const choice = new EnteringChoice();
    const ratio = new RatioResult();
    let useBland = false;
    let stalled = 0;
    let lastObjective = this.evaluateCost(costs);
    let sinceRefresh = 0;
    this.computeDuals(costs);

    for (;;) {
      if (this.iterations >= this.maxIterations) {
        return LpStatus.IterationLimit;
      }
      this.chooseEntering(costs, useBland, choice);
      if (choice.variable < 0) {
        // Confirm optimality against freshly computed duals: an incremental dual vector
        // that has drifted must not be allowed to declare victory early.
        this.computeDuals(costs);
        this.chooseEntering(costs, useBland, choice);
        if (choice.variable < 0) {
          return LpStatus.Optimal;
        }
      }
      const enteringReducedCost = this.reducedCost(choice.variable, costs);
      this.computeColumn(choice.variable);
      this.ratioTest(choice.variable, choice.direction, useBland, ratio);
      if (ratio.unbounded) {
        return LpStatus.Unbounded;
      }
      const leavingPosition = ratio.leavingPosition;
      this.applyStep(choice.variable, choice.direction, ratio);
      if (leavingPosition >= 0) {
        this.updateDuals(enteringReducedCost, leavingPosition);
      }
      this.iterations++;
      sinceRefresh++;
      if (sinceRefresh >= this.options.refreshInterval) {
        this.refreshBasicValues();
        this.computeDuals(costs);
        sinceRefresh = 0;
      }

      const objective = this.evaluateCost(costs);
      if (objective < lastObjective - this.options.optimalityTolerance) {
        stalled = 0;
        useBland = false;
      } else {
        stalled++;
        if (stalled > this.options.stallLimit) {
          useBland = true;
        }
      }
      lastObjective = objective;
    }
  }

  private evaluateCost(costs: Float64Array): number {
    let sum = 0;
    for (let j = 0; j < this.columnCount; j++) {
      if (costs[j] !== 0) {
        sum += costs[j] * this.xValues[j];
      }
    }
    return sum;
  }

  /**
   * Rank-one update of the duals after a pivot: `y' = y + (d_q / alpha_k) * rho`, where
   * `rho` is the pivot row of the basis inverse *after* scaling. Derived from
   * Sherman-Morrison on the basis; it replaces an `O(m^2)` recomputation with `O(m)`.
   *
   * A full recomputation still runs at every refresh point, so the incremental path cannot
   * drift away unnoticed.
   */
  private updateDuals(reducedCost: number, position: number): void {
    const m = this.rowCount;
    const pivotBase = position * m;
    // The pivot row has already been scaled by 1/alpha_k in updateBasisInverse, so the
    // reduced cost is applied directly rather than divided again.
    const step = reducedCost;
    if (step === 0) {
      return;
    }
    for (let t = 0; t < this.pivotRowCount; t++) {
      const j = this.pivotRowIndex[t];
      this.duals[j] += step * this.basisInverse[pivotBase + j];
    }
  }

  /** `y = c_B . B^-1`. */
  private computeDuals(costs: Float64Array): void {
    const m = this.rowCount;
    for (let i = 0; i < m; i++) {
      this.duals[i] = 0;
    }
    for (let k = 0; k < m; k++) {
      const c = costs[this.basisVar[k]];
      if (c === 0) {
        continue;
      }
      const rowBase = k * m;
      for (let i = 0; i < m; i++) {
        this.duals[i] += c * this.basisInverse[rowBase + i];
      }
    }
  }

  private reducedCost(variable: number, costs: Float64Array): number {
    let d = costs[variable];
    const end = this.colStart[variable + 1];
    for (let p = this.colStart[variable]; p < end; p++) {
      d -= this.duals[this.colRow[p]] * this.colValue[p];
    }
    return d;
  }

  private chooseEntering(costs: Float64Array, useBland: boolean, out: EnteringChoice): void {
    const tolerance = this.options.optimalityTolerance;
    out.variable = -1;
    out.direction = 0;
    let bestScore = tolerance;
    for (let j = 0; j < this.columnCount; j++) {
      const status = this.state[j];
      if (status === VarState.Basic) {
        continue;
      }
      if (this.lower[j] === this.upper[j]) {
        continue; // fixed: it can never move
      }
      const d = this.reducedCost(j, costs);
      let direction = 0;
      let score = 0;
      if (status === VarState.AtLower) {
        if (d < -tolerance) {
          direction = 1;
          score = -d;
        }
      } else if (status === VarState.AtUpper) {
        if (d > tolerance) {
          direction = -1;
          score = d;
        }
      } else {
        if (d < -tolerance) {
          direction = 1;
          score = -d;
        } else if (d > tolerance) {
          direction = -1;
          score = d;
        }
      }
      if (direction === 0) {
        continue;
      }
      if (useBland) {
        // Bland's rule: lowest eligible index. Guarantees termination under degeneracy.
        out.variable = j;
        out.direction = direction;
        return;
      }
      if (score > bestScore) {
        bestScore = score;
        out.variable = j;
        out.direction = direction;
      }
    }
  }

  /**
   * `alpha = B^-1 A_q`, gathered over the entering column's nonzeros only.
   *
   * A structural column here has a dozen or so entries against thousands of rows, so
   * touching the whole basis inverse per iteration -- as a textbook dense tableau does --
   * is where an honest-looking solver quietly becomes unusable.
   */
  private computeColumn(variable: number): void {
    const m = this.rowCount;
    const start = this.colStart[variable];
    const end = this.colStart[variable + 1];
    let count = 0;
    for (let p = start; p < end; p++) {
      this.entryRows[count] = this.colRow[p];
      this.entryValues[count] = this.colValue[p];
      count++;
    }
    this.entryCount = count;
    if (count === 0) {
      for (let i = 0; i < m; i++) {
        this.column[i] = 0;
      }
      return;
    }
    for (let i = 0; i < m; i++) {
      const rowBase = i * m;
      let sum = 0;
      for (let t = 0; t < count; t++) {
        sum += this.basisInverse[rowBase + this.entryRows[t]] * this.entryValues[t];
      }
      this.column[i] = sum;
    }
  }

  private ratioTest(variable: number, direction: number, useBland: boolean, out: RatioResult): void {
    const ratioTolerance = this.options.ratioTolerance;
    let largest = 0;
    for (let k = 0; k < this.rowCount; k++) {
      const magnitude = this.column[k] < 0 ? -this.column[k] : this.column[k];
      if (magnitude > largest) {
        largest = magnitude;
      }
    }
    const relativeFloor = largest * this.options.relativePivotTolerance;
    const pivotTolerance =
      this.options.pivotTolerance > relativeFloor ? this.options.pivotTolerance : relativeFloor;
    out.leavingPosition = -1;
    out.leavingToUpper = false;
    out.unbounded = false;

    // The entering variable's own opposite bound: hitting it first is a bound flip.
    let theta = Number.POSITIVE_INFINITY;
    if (direction > 0) {
      if (Number.isFinite(this.upper[variable])) {
        theta = this.upper[variable] - this.xValues[variable];
      }
    } else {
      if (Number.isFinite(this.lower[variable])) {
        theta = this.xValues[variable] - this.lower[variable];
      }
    }
    if (theta < 0) {
      theta = 0;
    }

    let bestPivot = 0;
    for (let k = 0; k < this.rowCount; k++) {
      const alpha = this.column[k];
      const magnitude = alpha < 0 ? -alpha : alpha;
      if (magnitude <= pivotTolerance) {
        continue;
      }
      const rate = -alpha * direction; // d(x_basic)/d(theta)
      const basicVar = this.basisVar[k];
      let limit = 0;
      let towardUpper = false;
      if (rate > 0) {
        if (!Number.isFinite(this.upper[basicVar])) {
          continue;
        }
        limit = (this.upper[basicVar] - this.xValues[basicVar]) / rate;
        towardUpper = true;
      } else {
        if (!Number.isFinite(this.lower[basicVar])) {
          continue;
        }
        limit = (this.xValues[basicVar] - this.lower[basicVar]) / -rate;
        towardUpper = false;
      }
      if (limit < 0) {
        limit = 0;
      }
      let accept = false;
      if (limit < theta - ratioTolerance) {
        accept = true;
      } else if (out.leavingPosition >= 0 && limit <= theta + ratioTolerance) {
        // Tie: prefer the larger pivot for stability, or the lower index under Bland.
        if (useBland) {
          accept = basicVar < this.basisVar[out.leavingPosition];
        } else {
          accept = magnitude > bestPivot;
        }
      }
      if (accept) {
        if (limit < theta) {
          theta = limit;
        }
        out.leavingPosition = k;
        out.leavingToUpper = towardUpper;
        bestPivot = magnitude;
      }
    }

    if (!Number.isFinite(theta)) {
      out.unbounded = true;
      out.theta = Number.POSITIVE_INFINITY;
      return;
    }
    out.theta = theta;
  }

  private applyStep(variable: number, direction: number, ratio: RatioResult): void {
    const theta = ratio.theta;
    const step = direction * theta;
    if (step !== 0) {
      for (let k = 0; k < this.rowCount; k++) {
        const alpha = this.column[k];
        if (alpha !== 0) {
          this.xValues[this.basisVar[k]] -= alpha * step;
        }
      }
    }
    const enteringValue = this.xValues[variable] + step;

    if (ratio.leavingPosition < 0) {
      // Bound flip: snap to the exact bound so repeated flips cannot drift.
      if (direction > 0) {
        this.xValues[variable] = this.upper[variable];
        this.state[variable] = VarState.AtUpper;
      } else {
        this.xValues[variable] = this.lower[variable];
        this.state[variable] = VarState.AtLower;
      }
      return;
    }

    const leavingVar = this.basisVar[ratio.leavingPosition];
    this.xValues[leavingVar] = ratio.leavingToUpper ? this.upper[leavingVar] : this.lower[leavingVar];
    this.state[leavingVar] = ratio.leavingToUpper ? VarState.AtUpper : VarState.AtLower;
    this.basisPos[leavingVar] = -1;

    this.xValues[variable] = enteringValue;
    this.state[variable] = VarState.Basic;
    this.basisVar[ratio.leavingPosition] = variable;
    this.basisPos[variable] = ratio.leavingPosition;
    this.updateBasisInverse(ratio.leavingPosition);
  }

  /**
   * Product-form update of `B^-1` after the column at `position` is replaced.
   *
   * The pivot row's nonzeros are gathered first and only those columns are touched. The
   * basis inverse starts diagonal and fills in gradually, so early iterations cost a
   * fraction of the dense `O(m^2)` they would otherwise.
   */
  private updateBasisInverse(position: number): void {
    const m = this.rowCount;
    const pivot = this.column[position];
    const inversePivot = 1 / pivot;
    const pivotBase = position * m;
    let nonzeros = 0;
    for (let j = 0; j < m; j++) {
      const value = this.basisInverse[pivotBase + j];
      if (value !== 0) {
        const scaled = value * inversePivot;
        this.basisInverse[pivotBase + j] = scaled;
        this.pivotRowIndex[nonzeros] = j;
        nonzeros++;
      }
    }
    this.pivotRowCount = nonzeros;
    for (let i = 0; i < m; i++) {
      if (i === position) {
        continue;
      }
      const factor = this.column[i];
      if (factor === 0) {
        continue;
      }
      const rowBase = i * m;
      for (let t = 0; t < nonzeros; t++) {
        const j = this.pivotRowIndex[t];
        this.basisInverse[rowBase + j] -= factor * this.basisInverse[pivotBase + j];
      }
    }
  }

  /** `x_B = -B^-1 N x_N`, recomputed from the nonbasic values to bound round-off drift. */
  private refreshBasicValues(): void {
    const m = this.rowCount;
    for (let i = 0; i < m; i++) {
      this.scratch[i] = 0;
    }
    for (let j = 0; j < this.columnCount; j++) {
      if (this.state[j] === VarState.Basic) {
        continue;
      }
      const value = this.xValues[j];
      if (value === 0) {
        continue;
      }
      const end = this.colStart[j + 1];
      for (let p = this.colStart[j]; p < end; p++) {
        this.scratch[this.colRow[p]] -= this.colValue[p] * value;
      }
    }
    for (let i = 0; i < m; i++) {
      let sum = 0;
      const rowBase = i * m;
      for (let k = 0; k < m; k++) {
        const rhs = this.scratch[k];
        if (rhs !== 0) {
          sum += this.basisInverse[rowBase + k] * rhs;
        }
      }
      this.xValues[this.basisVar[i]] = sum;
    }
  }

  private buildSolution(status: LpStatus): LpSolution {
    const values = new Float64Array(this.structuralCount);
    for (let j = 0; j < this.structuralCount; j++) {
      values[j] = this.xValues[j];
    }
    let objective: number;
    if (status === LpStatus.Infeasible) {
      objective = Number.NaN;
    } else if (status === LpStatus.Unbounded) {
      objective =
        this.program.objectiveSense === LpObjectiveSense.Maximize
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY;
    } else {
      objective = this.program.evaluateObjective(values);
    }
    const violations = LpSolution.measureViolations(this.program, values);
    return new LpSolution(status, objective, values, this.iterations, violations[0], violations[1]);
  }
}
