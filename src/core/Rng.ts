/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * Spec 4.5 makes determinism a requirement, not a nice-to-have: the fix-and-rerun loop
 * only works if the blueprint is the single variable between two attempts. So this is the
 * *only* entropy source in the project -- `Math.random` and wall-clock time are banned
 * from `src/`.
 *
 * 32-bit state and `Math.imul` are deliberate: the arithmetic is exactly what a
 * `uint32_t` implementation in C++ does, so a port reproduces the same stream.
 */
export class Rng {
  private state: number;

  public constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Derives an independent stream from this one without consuming a draw. */
  public fork(streamId: number): Rng {
    return new Rng((this.state ^ Math.imul(streamId | 0, 0x9e3779b1)) | 0);
  }

  public nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform in [0, 1). */
  public nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform integer in [0, bound). Returns 0 for a non-positive bound. */
  public nextInt(bound: number): number {
    if (bound <= 0) {
      return 0;
    }
    return Math.floor(this.nextFloat() * bound);
  }

  /** Uniform in [low, high). */
  public nextRange(low: number, high: number): number {
    return low + this.nextFloat() * (high - low);
  }

  public snapshot(): number {
    return this.state;
  }

  public restore(state: number): void {
    this.state = state | 0;
  }
}
