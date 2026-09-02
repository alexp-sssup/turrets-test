import { LinearProgram } from "./LinearProgram";

export enum LpStatus {
  /** An optimal vertex was found. */
  Optimal = 0,
  /** The constraint set is empty. */
  Infeasible = 1,
  /** The objective can be improved without bound. */
  Unbounded = 2,
  /** The iteration budget ran out; `values` holds the last feasible point. */
  IterationLimit = 3,
}

export function lpStatusName(status: LpStatus): string {
  if (status === LpStatus.Optimal) {
    return "Optimal";
  }
  if (status === LpStatus.Infeasible) {
    return "Infeasible";
  }
  if (status === LpStatus.Unbounded) {
    return "Unbounded";
  }
  return "IterationLimit";
}

export class LpSolution {
  public readonly status: LpStatus;
  public readonly objectiveValue: number;
  public readonly values: Float64Array;
  public readonly iterations: number;
  /** Largest row-bound violation of `values`; a solver self-check, not a diagnostic. */
  public readonly maxRowViolation: number;
  /** Largest variable-bound violation of `values`. */
  public readonly maxBoundViolation: number;

  public constructor(
    status: LpStatus,
    objectiveValue: number,
    values: Float64Array,
    iterations: number,
    maxRowViolation: number,
    maxBoundViolation: number
  ) {
    this.status = status;
    this.objectiveValue = objectiveValue;
    this.values = values;
    this.iterations = iterations;
    this.maxRowViolation = maxRowViolation;
    this.maxBoundViolation = maxBoundViolation;
  }

  public value(variable: number): number {
    return this.values[variable];
  }

  /**
   * Recomputes constraint violations from scratch. Called by the solver before returning
   * so that accumulated round-off in the basis inverse cannot be mistaken for a feasible
   * answer, and usable by callers that want to audit a result.
   */
  public static measureViolations(program: LinearProgram, values: Float64Array): Float64Array {
    let maxRow = 0;
    for (let row = 0; row < program.rowCount; row++) {
      const activity = program.rowActivity(row, values);
      const lower = program.rowLowerBound(row);
      const upper = program.rowUpperBound(row);
      if (activity < lower) {
        const violation = lower - activity;
        if (violation > maxRow) {
          maxRow = violation;
        }
      } else if (activity > upper) {
        const violation = activity - upper;
        if (violation > maxRow) {
          maxRow = violation;
        }
      }
    }
    let maxBound = 0;
    for (let j = 0; j < program.variableCount; j++) {
      const value = values[j];
      const lower = program.variableLowerBound(j);
      const upper = program.variableUpperBound(j);
      if (value < lower) {
        const violation = lower - value;
        if (violation > maxBound) {
          maxBound = violation;
        }
      } else if (value > upper) {
        const violation = value - upper;
        if (violation > maxBound) {
          maxBound = violation;
        }
      }
    }
    const result = new Float64Array(2);
    result[0] = maxRow;
    result[1] = maxBound;
    return result;
  }
}
