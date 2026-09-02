/**
 * Scalar helpers. Kept in one place so the epsilon policy is auditable: the solver's
 * readability claim (spec 1.1) depends on two runs of the same input agreeing, and
 * scattered ad-hoc tolerances are the usual way that stops being true.
 */

/** Tolerance for geometry and force comparisons. Forces are O(1..1e3) in P0 units. */
export const EPSILON = 1e-9;

/** Tolerance used when deciding whether a joint counts as failed. */
export const UTILIZATION_EPSILON = 1e-6;

export const POSITIVE_INFINITY = Number.POSITIVE_INFINITY;
export const NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY;

export function isFinite(value: number): boolean {
  return Number.isFinite(value);
}

export function approxEqual(a: number, b: number, tolerance: number = EPSILON): boolean {
  const diff = a > b ? a - b : b - a;
  return diff <= tolerance;
}

export function approxZero(value: number, tolerance: number = EPSILON): boolean {
  return (value < 0 ? -value : value) <= tolerance;
}

export function clamp(value: number, low: number, high: number): number {
  if (value < low) {
    return low;
  }
  if (value > high) {
    return high;
  }
  return value;
}

export function absOf(value: number): number {
  return value < 0 ? -value : value;
}

export function maxOf(a: number, b: number): number {
  return a > b ? a : b;
}

export function minOf(a: number, b: number): number {
  return a < b ? a : b;
}

/**
 * Total order on numbers, NaN-free by contract. Used as a sort comparator so that every
 * ordering decision in the simulation is reproducible.
 */
export function compareNumbers(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
