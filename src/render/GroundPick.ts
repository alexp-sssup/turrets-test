import { IVec3 } from "../core/IVec3";
import { PadSurface } from "../structure/SupportSurface";
import { IsoProjection } from "./IsoProjection";

/**
 * The pad cell under a screen point (face-placement spec 2.2).
 *
 * > A ray that meets no block meets the pad. **The pad's surface is a placeable face: a
 * > click on it puts a block in the cell resting on it.**
 *
 * That is one call to the horizontal inverse of isometric renderer spec 5.1 at the pad's own
 * level -- two divisions, no search, exact -- and then a floor. The pad's surface is the
 * plane `y = pad.level`, which is the bottom of the cells that rest on it, so the cell the
 * ray crosses that plane in *is* the cell a block would occupy.
 *
 * Only the pad, never the apron: standable-ground spec 2.2 widened where crew may stand by a
 * cell and left where a block may rest alone, and a placement this document cannot attach is
 * a placement it refuses (spec 2.2).
 */
export class GroundPick {
  /** Nothing buildable under the pointer. */
  public static readonly NONE: IVec3 | null = null;

  public static at(
    projection: IsoProjection,
    pad: PadSurface,
    screenX: number,
    screenY: number
  ): IVec3 | null {
    const world = projection.onLevel(screenX, screenY, pad.level);
    const cell = new IVec3(Math.floor(world.x), pad.level, Math.floor(world.z));
    if (!pad.supportsBlockAt(cell)) {
      return GroundPick.NONE;
    }
    return cell;
  }
}
