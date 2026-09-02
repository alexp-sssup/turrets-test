import { LinearProgram, LpObjectiveSense } from "../../../src/math/lp/LinearProgram";

/**
 * Independent reference solver used only by tests: it enumerates every candidate vertex of
 * the feasible polytope by brute force. Exponential, so it is only usable on tiny problems,
 * but it shares no code with the simplex implementation -- which is the point. If both
 * agree on a few hundred random programs, the simplex is not merely self-consistent.
 *
 * Requires a bounded feasible region (give every variable finite bounds).
 */

export class ReferenceResult {
  public readonly feasible: boolean;
  public readonly objectiveValue: number;
  public readonly values: number[];

  public constructor(feasible: boolean, objectiveValue: number, values: number[]) {
    this.feasible = feasible;
    this.objectiveValue = objectiveValue;
    this.values = values;
  }
}

class Inequality {
  public readonly coefficients: number[];
  public readonly bound: number;

  public constructor(coefficients: number[], bound: number) {
    this.coefficients = coefficients;
    this.bound = bound;
  }
}

export function solveByVertexEnumeration(program: LinearProgram, tolerance: number): ReferenceResult {
  const n = program.variableCount;
  const inequalities: Inequality[] = [];

  const dense: number[][] = [];
  for (let row = 0; row < program.rowCount; row++) {
    dense.push(new Array<number>(n).fill(0));
  }
  for (let e = 0; e < program.entryCount; e++) {
    const entry = program.entryAt(e);
    dense[entry.row][entry.variable] += entry.value;
  }
  for (let row = 0; row < program.rowCount; row++) {
    const upper = program.rowUpperBound(row);
    if (Number.isFinite(upper)) {
      inequalities.push(new Inequality(dense[row].slice(), upper));
    }
    const lower = program.rowLowerBound(row);
    if (Number.isFinite(lower)) {
      inequalities.push(new Inequality(dense[row].map((v) => -v), -lower));
    }
  }
  for (let j = 0; j < n; j++) {
    const upper = program.variableUpperBound(j);
    if (Number.isFinite(upper)) {
      const coefficients = new Array<number>(n).fill(0);
      coefficients[j] = 1;
      inequalities.push(new Inequality(coefficients, upper));
    }
    const lower = program.variableLowerBound(j);
    if (Number.isFinite(lower)) {
      const coefficients = new Array<number>(n).fill(0);
      coefficients[j] = -1;
      inequalities.push(new Inequality(coefficients, -lower));
    }
  }

  const maximize = program.objectiveSense === LpObjectiveSense.Maximize;
  let best = maximize ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  let bestValues: number[] = new Array<number>(n).fill(0);
  let feasible = false;

  const subset = new Array<number>(n).fill(0);
  const total = inequalities.length;

  const visit = (start: number, depth: number): void => {
    if (depth === n) {
      const point = solveSquareSystem(inequalities, subset, n, tolerance);
      if (point === null) {
        return;
      }
      for (let k = 0; k < total; k++) {
        const ineq = inequalities[k];
        let activity = 0;
        for (let j = 0; j < n; j++) {
          activity += ineq.coefficients[j] * point[j];
        }
        if (activity > ineq.bound + tolerance) {
          return;
        }
      }
      feasible = true;
      let objective = 0;
      for (let j = 0; j < n; j++) {
        objective += program.objectiveCoefficient(j) * point[j];
      }
      if (maximize ? objective > best : objective < best) {
        best = objective;
        bestValues = point;
      }
      return;
    }
    for (let k = start; k < total; k++) {
      subset[depth] = k;
      visit(k + 1, depth + 1);
    }
  };
  visit(0, 0);

  return new ReferenceResult(feasible, feasible ? best : Number.NaN, bestValues);
}

/** Gaussian elimination with partial pivoting; `null` when the chosen rows are singular. */
function solveSquareSystem(
  inequalities: readonly Inequality[],
  subset: readonly number[],
  n: number,
  tolerance: number
): number[] | null {
  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const source = inequalities[subset[i]];
    const row = source.coefficients.slice();
    row.push(source.bound);
    matrix.push(row);
  }
  for (let column = 0; column < n; column++) {
    let pivotRow = -1;
    let pivotMagnitude = tolerance;
    for (let i = column; i < n; i++) {
      const magnitude = Math.abs(matrix[i][column]);
      if (magnitude > pivotMagnitude) {
        pivotMagnitude = magnitude;
        pivotRow = i;
      }
    }
    if (pivotRow < 0) {
      return null;
    }
    const temp = matrix[column];
    matrix[column] = matrix[pivotRow];
    matrix[pivotRow] = temp;
    const pivot = matrix[column][column];
    for (let j = column; j <= n; j++) {
      matrix[column][j] /= pivot;
    }
    for (let i = 0; i < n; i++) {
      if (i === column) {
        continue;
      }
      const factor = matrix[i][column];
      if (factor === 0) {
        continue;
      }
      for (let j = column; j <= n; j++) {
        matrix[i][j] -= factor * matrix[column][j];
      }
    }
  }
  const solution = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    solution[i] = matrix[i][n];
  }
  return solution;
}
