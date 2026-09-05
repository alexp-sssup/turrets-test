import { GridBounds } from "../core/GridBounds";
import { IVec3 } from "../core/IVec3";
import { CellPresence } from "./CellPresence";
import { FaceHit } from "./FaceHit";
import { IsoProjection } from "./IsoProjection";

/**
 * The frontmost visible voxel under a screen point, and the face the ray entered it through
 * (isometric renderer spec 5.2, face-placement spec 2.1).
 *
 * The projection is many-to-one, so this replaces the exact screen-to-cell inverse the flat
 * view enjoyed -- and replaces it without a colour-buffer read-back, without a search over
 * the drawn cells and without allocating.
 *
 * The view ray is entered at the top of the world box with the horizontal inverse of spec
 * 5.1, then walked away from the camera with a three-axis DDA. The ray's direction is a unit
 * step on each axis at every yaw, so the crossing spacing on each axis is exactly one and
 * the traversal is integer-driven: no division inside the loop, no epsilon, and at most
 * `spanX + spanY + spanZ` cells visited. Nearest-first, so the first live cell it meets is
 * the one a tester is looking at.
 *
 * The face costs nothing on top of that. A DDA crosses exactly one lattice plane per step,
 * so the face a ray entered a block through is the axis it just stepped on, with the sign it
 * came from -- one integer triple carried out of a loop that already runs on every hover,
 * which is what face-placement spec 1 means by "the pick already computes it".
 *
 * Ties -- a ray through an exact lattice corner, which integer pixels make likely rather
 * than exotic -- step one axis at a time in a fixed order. That can only visit *more* cells
 * than the geometry demands, never fewer, so a pick never falls through a solid block.
 */
export class CellPick {
  /** Nothing under the pointer. */
  public static readonly NONE: FaceHit | null = null;

  public static pick(
    projection: IsoProjection,
    cells: CellPresence,
    bounds: GridBounds,
    screenX: number,
    screenY: number
  ): FaceHit | null {
    const yaw = projection.yaw;
    const stepX = -yaw.rayStepX;
    const stepZ = -yaw.rayStepZ;
    const lowX = bounds.min.x;
    const highX = bounds.min.x + bounds.size.x;
    const lowY = bounds.min.y;
    const highY = bounds.min.y + bounds.size.y;
    const lowZ = bounds.min.z;
    const highZ = bounds.min.z + bounds.size.z;

    // Where the ray crosses the top of the world box, and therefore the ray itself: from
    // here on, one unit of `t` is one unit on every axis.
    const entry = projection.onLevel(screenX, screenY, highY);

    // Clip to the box before walking it. The ray enters a tall thin world through its side
    // far more often than through its lid, and starting at the lid would spend the visit
    // budget crossing empty space -- or miss the design entirely.
    //
    // Whichever clip binds is also the face the box is entered through, and so the face of
    // the first cell tested. At `enter = 0` that is the lid, which is the top face.
    let enter = 0;
    let exit = highY - lowY;
    let normalX = 0;
    let normalY = 1;
    let normalZ = 0;
    const onX = stepX > 0 ? lowX - entry.x : entry.x - highX;
    if (onX > enter) {
      enter = onX;
      normalX = 0 - stepX;
      normalY = 0;
      normalZ = 0;
    }
    exit = CellPick.sooner(exit, stepX > 0 ? highX - entry.x : entry.x - lowX);
    const onZ = stepZ > 0 ? lowZ - entry.z : entry.z - highZ;
    if (onZ > enter) {
      enter = onZ;
      normalX = 0;
      normalY = 0;
      normalZ = 0 - stepZ;
    }
    exit = CellPick.sooner(exit, stepZ > 0 ? highZ - entry.z : entry.z - lowZ);
    if (enter > exit) {
      return CellPick.NONE;
    }

    const startX = entry.x + stepX * enter;
    const startY = highY - enter;
    const startZ = entry.z + stepZ * enter;
    let cellX = CellPick.cellOf(startX, stepX);
    let cellY = CellPick.cellOf(startY, -1);
    let cellZ = CellPick.cellOf(startZ, stepZ);
    let nextX = stepX > 0 ? cellX + 1 - startX : startX - cellX;
    let nextZ = stepZ > 0 ? cellZ + 1 - startZ : startZ - cellZ;
    let nextY = startY - cellY;

    const budget = bounds.size.x + bounds.size.y + bounds.size.z + 3;
    for (let visited = 0; visited < budget; visited++) {
      if (cellY < lowY || cellX < lowX || cellX >= highX || cellZ < lowZ || cellZ >= highZ) {
        return CellPick.NONE;
      }
      if (cells.isSolid(cellX, cellY, cellZ)) {
        return new FaceHit(
          new IVec3(cellX, cellY, cellZ),
          new IVec3(normalX, normalY, normalZ)
        );
      }
      // The nearest cell boundary ahead. y first, then x, then z, so an exact corner
      // resolves the same way twice. The face of the cell being entered is the one facing
      // back along the step, which is the camera-facing face on that axis.
      if (nextY <= nextX && nextY <= nextZ) {
        cellY -= 1;
        nextY += 1;
        normalX = 0;
        normalY = 1;
        normalZ = 0;
      } else if (nextX <= nextZ) {
        cellX += stepX;
        nextX += 1;
        normalX = 0 - stepX;
        normalY = 0;
        normalZ = 0;
      } else {
        cellZ += stepZ;
        nextZ += 1;
        normalX = 0;
        normalY = 0;
        normalZ = 0 - stepZ;
      }
    }
    return CellPick.NONE;
  }

  /**
   * The cell a boundary-crossing point belongs to.
   *
   * A ray entering exactly on a lattice plane while moving in the negative direction is
   * entering the cell *below* the plane, not the one above it. Integer pixels make that case
   * ordinary rather than exotic, so it is a rule here and not an epsilon.
   */
  private static cellOf(coordinate: number, step: number): number {
    const floored = Math.floor(coordinate);
    if (step < 0 && floored === coordinate) {
      return floored - 1;
    }
    return floored;
  }

  private static sooner(current: number, candidate: number): number {
    return candidate < current ? candidate : current;
  }
}
