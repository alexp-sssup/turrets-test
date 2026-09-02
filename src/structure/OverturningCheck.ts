import { Vec3 } from "../core/Vec3";
import { BlockStructure } from "./BlockStructure";
import { JointGraph } from "./JointGraph";
import { LoadSet } from "./LoadSet";

/**
 * Rigid-body tipping margin about the edges of the support footprint.
 *
 * This is a separate check, not part of the linear program, and the reason is worth
 * stating. The program maximises a single factor on *all* applied loads, so it answers
 * "how much more of this same loading can the joints take". Overturning is invariant under
 * that factor -- scale weight and recoil together and a block tips at exactly the same
 * ratio -- so the load factor cannot express it. It collapses to a hard boundary instead:
 * inside the limit the joints govern, outside it there is no admissible force field at all.
 *
 * Reporting the ratio separately keeps that boundary legible: `tippingMargin` moves
 * continuously (2.0, 1.1, 0.9) as recoil grows, and it is the number that explains an
 * otherwise abrupt `Unsupportable`.
 *
 * Spec 3 defers tipping and centre of mass to P1. This is the cheap version that falls out
 * of what the solver already computes (spec 6), and it is deliberately not load-bearing on
 * anything else.
 */
export class OverturningCheck {
  /**
   * Ratio of restoring to overturning moment, minimised over the four footprint edges.
   * `Infinity` when nothing is trying to tip the structure, `0` when nothing resists.
   */
  public static margin(
    structure: BlockStructure,
    joints: JointGraph,
    loads: LoadSet,
    voxelSize: number
  ): number {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let padY = 0;
    let supportCount = 0;
    for (let j = 0; j < joints.jointCount; j++) {
      const joint = joints.jointAt(j);
      if (!joint.isSupport) {
        continue;
      }
      const position = structure.positionOf(joint.blockHigh);
      const low = position.x * voxelSize;
      const high = (position.x + 1) * voxelSize;
      const lowZ = position.z * voxelSize;
      const highZ = (position.z + 1) * voxelSize;
      if (low < minX) {
        minX = low;
      }
      if (high > maxX) {
        maxX = high;
      }
      if (lowZ < minZ) {
        minZ = lowZ;
      }
      if (highZ > maxZ) {
        maxZ = highZ;
      }
      padY = position.y * voxelSize;
      supportCount++;
    }
    if (supportCount === 0) {
      return 0;
    }

    // Four edges of the footprint, each described by the axis the body would rotate about
    // and the sign of the moment that tips it outward.
    let worst = Number.POSITIVE_INFINITY;
    worst = OverturningCheck.smaller(
      worst,
      OverturningCheck.marginAboutEdge(structure, loads, voxelSize, maxX, padY, 0, -1)
    );
    worst = OverturningCheck.smaller(
      worst,
      OverturningCheck.marginAboutEdge(structure, loads, voxelSize, minX, padY, 0, 1)
    );
    worst = OverturningCheck.smaller(
      worst,
      OverturningCheck.marginAboutEdge(structure, loads, voxelSize, maxZ, padY, 2, -1)
    );
    worst = OverturningCheck.smaller(
      worst,
      OverturningCheck.marginAboutEdge(structure, loads, voxelSize, minZ, padY, 2, 1)
    );
    return worst;
  }

  /**
   * `horizontalAxis` is 0 for the x edges and 2 for the z edges; `tippingSign` orients the
   * computed moment so that a positive value means "over this edge".
   *
   * Each load is split into its vertical and horizontal contribution and the two are
   * classified separately. Netting them per block first would let a block's own weight
   * cancel the recoil pushing it over, and the ratio -- which is the whole point -- would
   * come out as "nothing is trying to tip this" exactly at the limit.
   */
  private static marginAboutEdge(
    structure: BlockStructure,
    loads: LoadSet,
    voxelSize: number,
    edgeCoordinate: number,
    padY: number,
    horizontalAxis: number,
    tippingSign: number
  ): number {
    let restoring = 0;
    let overturning = 0;
    for (let block = 0; block < structure.blockCount; block++) {
      if (!structure.isAlive(block)) {
        continue;
      }
      const force = loads.forceOf(block);
      if (force.x === 0 && force.y === 0 && force.z === 0) {
        continue;
      }
      const position = structure.positionOf(block);
      const centre = new Vec3(
        (position.x + 0.5) * voxelSize,
        (position.y + 0.5) * voxelSize,
        (position.z + 0.5) * voxelSize
      );
      const horizontalOffset = centre.component(horizontalAxis) - edgeCoordinate;
      const verticalOffset = centre.y - padY;
      const horizontalForce = force.component(horizontalAxis);
      // Moment about the edge axis: horizontal lever times vertical force, minus vertical
      // lever times horizontal force.
      const fromWeight = horizontalOffset * force.y * tippingSign;
      const fromThrust = -verticalOffset * horizontalForce * tippingSign;
      if (fromWeight > 0) {
        overturning += fromWeight;
      } else {
        restoring += -fromWeight;
      }
      if (fromThrust > 0) {
        overturning += fromThrust;
      } else {
        restoring += -fromThrust;
      }
    }
    if (overturning <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return restoring / overturning;
  }

  private static smaller(a: number, b: number): number {
    return a < b ? a : b;
  }
}
