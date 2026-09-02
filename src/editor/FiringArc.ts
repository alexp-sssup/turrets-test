import { Direction, Directions } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { BlockStructure } from "../structure/BlockStructure";

/**
 * Whether a station can actually see out.
 *
 * Spec 1.3 wants firing arcs to be one of the pressures that make a solid block lose on its
 * own, so this has to be a real geometric test against the player's own structure rather
 * than a flag on the block. A gun buried in the middle of a blob has no arc, and no rule
 * had to say so.
 *
 * Sampling is a fan of rays in the horizontal plane, since P0's lane is horizontal. Rays
 * are walked one voxel at a time and rounded to the nearest cell, which is cheap enough to
 * re-run on every edit but deliberately coarse: an angled ray leaving a wall port steps
 * clear of the wall's own line on its first move, so a station set into an outer wall
 * reports its full arc rather than being docked for its neighbours. That is the right answer
 * for the case P0 cares about -- a gun with nothing in front of it versus a gun buried
 * behind another one, which reports 0% -- and a grazing obstruction two voxels out would
 * need a proper voxel traversal instead.
 */
export class FiringArc {
  /** Rays cast across the arc, odd so that one of them is the centre line. */
  public static readonly SAMPLE_COUNT: number = 9;

  /**
   * Fraction of sampled rays that leave the structure without hitting a live block. The
   * station's own block does not count as an obstruction.
   */
  public static clearFraction(
    structure: BlockStructure,
    station: number,
    facing: Direction,
    halfAngle: number,
    range: number
  ): number {
    let clear = 0;
    for (let sample = 0; sample < FiringArc.SAMPLE_COUNT; sample++) {
      if (FiringArc.isSampleClear(structure, station, facing, halfAngle, range, sample)) {
        clear++;
      }
    }
    return clear / FiringArc.SAMPLE_COUNT;
  }

  /** True when the centre line of the arc is clear. A gun with no centre line has no arc. */
  public static isCentreClear(
    structure: BlockStructure,
    station: number,
    facing: Direction,
    range: number
  ): boolean {
    return FiringArc.isSampleClear(structure, station, facing, 0, range, (FiringArc.SAMPLE_COUNT - 1) / 2);
  }

  private static isSampleClear(
    structure: BlockStructure,
    station: number,
    facing: Direction,
    halfAngle: number,
    range: number,
    sample: number
  ): boolean {
    const middle = (FiringArc.SAMPLE_COUNT - 1) / 2;
    const offset = FiringArc.SAMPLE_COUNT === 1 ? 0 : (sample - middle) / middle;
    const angle = offset * halfAngle;
    const forward = Directions.offset(facing);
    // Rotate the facing direction about the vertical axis by `angle`.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dirX = forward.x * cos - forward.z * sin;
    const dirZ = forward.x * sin + forward.z * cos;
    const dirY = forward.y;

    const origin = structure.positionOf(station);
    for (let step = 1; step <= range; step++) {
      const cell = new IVec3(
        Math.round(origin.x + dirX * step),
        Math.round(origin.y + dirY * step),
        Math.round(origin.z + dirZ * step)
      );
      if (!structure.bounds.contains(cell)) {
        return true; // the ray left the structure: nothing left to hit
      }
      const block = structure.indexAt(cell);
      if (block >= 0 && block !== station) {
        return false;
      }
    }
    return true;
  }

  /** Whether a world direction lies inside a station's arc. Used at runtime by targeting. */
  public static containsDirection(
    facing: Direction,
    halfAngle: number,
    deltaX: number,
    deltaZ: number
  ): boolean {
    const forward = Directions.offset(facing);
    const forwardLength = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
    const targetLength = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    if (forwardLength <= 0 || targetLength <= 0) {
      return false;
    }
    const cosine = (forward.x * deltaX + forward.z * deltaZ) / (forwardLength * targetLength);
    const clamped = cosine > 1 ? 1 : cosine < -1 ? -1 : cosine;
    return Math.acos(clamped) <= halfAngle;
  }
}
