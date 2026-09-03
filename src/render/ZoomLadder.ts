/**
 * The zoom rungs (isometric renderer spec 2.3).
 *
 * Every rung is an **even integer**, and that is a correctness rule rather than a taste:
 * the projection's vertical term is `s / 2`, so an even `s` with an integer origin puts
 * every voxel vertex in the scene on an exact pixel. Adjacent top faces then share an exact
 * edge instead of a hairline seam, a pan is an integer translation of an integer lattice
 * rather than a resample, and the C++ port computes screen positions in integers.
 *
 * A continuous zoom would give all three away for the sake of a gesture, so pinch snaps
 * here too (mobile UI spec 6.2).
 */
export class ZoomLadder {
  /** Pixels per voxel edge, ascending. */
  public static readonly RUNGS: readonly number[] = [8, 10, 12, 16, 20, 24, 32, 40, 48];

  public static get floor(): number {
    return ZoomLadder.RUNGS[0];
  }

  public static get ceiling(): number {
    return ZoomLadder.RUNGS[ZoomLadder.RUNGS.length - 1];
  }

  public static get initial(): number {
    return 16;
  }

  /** The rung index of a value already on the ladder, or the nearest one to it. */
  public static rungOf(value: number): number {
    let best = 0;
    let bestDistance = -1;
    for (let i = 0; i < ZoomLadder.RUNGS.length; i++) {
      const rung = ZoomLadder.RUNGS[i];
      const distance = rung > value ? rung - value : value - rung;
      if (bestDistance < 0 || distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** The nearest rung to an arbitrary value: what a pinch resolves to. */
  public static snap(value: number): number {
    return ZoomLadder.RUNGS[ZoomLadder.rungOf(value)];
  }

  /** One rung in or out, clamped at both ends. */
  public static stepped(value: number, rungs: number): number {
    let index = ZoomLadder.rungOf(value) + rungs;
    if (index < 0) {
      index = 0;
    }
    if (index >= ZoomLadder.RUNGS.length) {
      index = ZoomLadder.RUNGS.length - 1;
    }
    return ZoomLadder.RUNGS[index];
  }

  /**
   * A zoom factor applied to a rung, resolved back onto the ladder.
   *
   * A factor is what a pinch and the zoom keys both produce, and rounding it to the nearest
   * rung would let a small pinch resolve to the rung it started on. So a factor above one
   * moves at least one rung up and a factor below one at least one rung down.
   */
  public static scaled(value: number, factor: number): number {
    if (factor === 1) {
      return ZoomLadder.snap(value);
    }
    const target = ZoomLadder.snap(value * factor);
    const current = ZoomLadder.snap(value);
    if (target !== current) {
      return target;
    }
    return ZoomLadder.stepped(current, factor > 1 ? 1 : -1);
  }

  /** The largest rung whose scaled span fits `available` pixels, never below the floor. */
  public static largestFitting(span: number, available: number): number {
    if (span <= 0) {
      return ZoomLadder.ceiling;
    }
    let chosen = ZoomLadder.floor;
    for (let i = 0; i < ZoomLadder.RUNGS.length; i++) {
      if (ZoomLadder.RUNGS[i] * span <= available) {
        chosen = ZoomLadder.RUNGS[i];
      }
    }
    return chosen;
  }
}
