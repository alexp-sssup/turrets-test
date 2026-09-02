/**
 * A linear program in the form the simplex solver consumes:
 *
 *   minimise (or maximise)  c . x
 *   subject to              rowLower_i <= A_i . x <= rowUpper_i
 *                           varLower_j <=   x_j   <= varUpper_j
 *
 * Ranged rows are the only row type. An equality is a row whose bounds are equal, and a
 * one-sided inequality is a row with an infinite bound, so the solver has exactly one case
 * to handle. Infinities are `Number.POSITIVE_INFINITY` / `NEGATIVE_INFINITY`.
 *
 * This class is pure bookkeeping: it holds no game concepts and does no arithmetic beyond
 * accumulating entries.
 */

export enum LpObjectiveSense {
  Minimize = 0,
  Maximize = 1,
}

/** Sparse entry: `value` at (row, variable). */
export class LpEntry {
  public readonly row: number;
  public readonly variable: number;
  public readonly value: number;

  public constructor(row: number, variable: number, value: number) {
    this.row = row;
    this.variable = variable;
    this.value = value;
  }
}

export class LinearProgram {
  private readonly sense: LpObjectiveSense;
  private readonly varLower: number[];
  private readonly varUpper: number[];
  private readonly objective: number[];
  private readonly varNames: string[];
  private readonly rowLower: number[];
  private readonly rowUpper: number[];
  private readonly rowNames: string[];
  private readonly entries: LpEntry[];

  public constructor(sense: LpObjectiveSense) {
    this.sense = sense;
    this.varLower = [];
    this.varUpper = [];
    this.objective = [];
    this.varNames = [];
    this.rowLower = [];
    this.rowUpper = [];
    this.rowNames = [];
    this.entries = [];
  }

  public get objectiveSense(): LpObjectiveSense {
    return this.sense;
  }

  public get variableCount(): number {
    return this.varLower.length;
  }

  public get rowCount(): number {
    return this.rowLower.length;
  }

  public get entryCount(): number {
    return this.entries.length;
  }

  /** Returns the new variable's index. */
  public addVariable(lower: number, upper: number, objectiveCoefficient: number, name: string): number {
    if (lower > upper) {
      throw new Error("LinearProgram.addVariable: crossed bounds on " + name);
    }
    this.varLower.push(lower);
    this.varUpper.push(upper);
    this.objective.push(objectiveCoefficient);
    this.varNames.push(name);
    return this.varLower.length - 1;
  }

  /** Returns the new row's index. */
  public addRow(lower: number, upper: number, name: string): number {
    if (lower > upper) {
      throw new Error("LinearProgram.addRow: crossed bounds on " + name);
    }
    this.rowLower.push(lower);
    this.rowUpper.push(upper);
    this.rowNames.push(name);
    return this.rowLower.length - 1;
  }

  public addEqualityRow(value: number, name: string): number {
    return this.addRow(value, value, name);
  }

  /**
   * Accumulates `value` at (row, variable). Repeated entries for the same cell add up,
   * which is what lets the structural model contribute joint terms one joint at a time.
   */
  public addEntry(row: number, variable: number, value: number): void {
    if (row < 0 || row >= this.rowCount) {
      throw new Error("LinearProgram.addEntry: bad row " + row.toString());
    }
    if (variable < 0 || variable >= this.variableCount) {
      throw new Error("LinearProgram.addEntry: bad variable " + variable.toString());
    }
    if (value === 0) {
      return;
    }
    this.entries.push(new LpEntry(row, variable, value));
  }

  public variableLowerBound(variable: number): number {
    return this.varLower[variable];
  }

  public variableUpperBound(variable: number): number {
    return this.varUpper[variable];
  }

  public objectiveCoefficient(variable: number): number {
    return this.objective[variable];
  }

  public variableName(variable: number): string {
    return this.varNames[variable];
  }

  public rowLowerBound(row: number): number {
    return this.rowLower[row];
  }

  public rowUpperBound(row: number): number {
    return this.rowUpper[row];
  }

  public rowName(row: number): string {
    return this.rowNames[row];
  }

  public entryAt(index: number): LpEntry {
    return this.entries[index];
  }

  /** Row activity `A_i . x` for a candidate solution. Used by verification and tests. */
  public rowActivity(row: number, values: readonly number[] | Float64Array): number {
    let sum = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.row === row) {
        sum += entry.value * values[entry.variable];
      }
    }
    return sum;
  }

  public evaluateObjective(values: readonly number[] | Float64Array): number {
    let sum = 0;
    for (let j = 0; j < this.objective.length; j++) {
      sum += this.objective[j] * values[j];
    }
    return sum;
  }
}
