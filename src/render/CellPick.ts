import { GridBounds } from "../core/GridBounds";
import { IVec3 } from "../core/IVec3";
import { CellPresence } from "./CellPresence";
import { IsoProjection } from "./IsoProjection";

/**
 * The frontmost visible voxel under a screen point (isometric renderer spec 5.2).
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
 * Ties -- a ray through an exact lattice corner, which integer pixels make likely rather
 * than exotic -- step one axis at a time in a fixed order. That can only visit *more* cells
 * than the geometry demands, never fewer, so a pick never falls through a solid block.
 */
export class CellPick {
  /** Nothing under the pointer. */
  public static readonly NONE: IVec3 | null = null;

  public static pick(
    projection: IsoProjection,
    cells: CellPresence,
    bounds: GridBounds,
    screenX: number,
    screenY: number
  ): IVec3 | null {
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
    let enter = 0;
    let exit = highY - lowY;
    if (stepX > 0) {
      enter = CellPick.later(enter, lowX - entry.x);
      exit = CellPick.sooner(exit, highX - entry.x);
    } else {
      enter = CellPick.later(enter, entry.x - highX);
      exit = CellPick.sooner(exit, entry.x - lowX);
    }
    if (stepZ > 0) {
      enter = CellPick.later(enter, lowZ - entry.z);
      exit = CellPick.sooner(exit, highZ - entry.z);
    } else {
      enter = CellPick.later(enter, entry.z - highZ);
      exit = CellPick.sooner(exit, entry.z - lowZ);
    }
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
        return new IVec3(cellX, cellY, cellZ);
      }
      // The nearest cell boundary ahead. y first, then x, then z, so an exact corner
      // resolves the same way twice.
      if (nextY <= nextX && nextY <= nextZ) {
        cellY -= 1;
        nextY += 1;
      } else if (nextX <= nextZ) {
        cellX += stepX;
        nextX += 1;
      } else {
        cellZ += stepZ;
        nextZ += 1;
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

  private static later(current: number, candidate: number): number {
    return candidate > current ? candidate : current;
  }

  private static sooner(current: number, candidate: number): number {
    return candidate < current ? candidate : current;
  }
}
