import { IVec3 } from "../core/IVec3";
import { CellPresence } from "./CellPresence";
import { FaceHit } from "./FaceHit";

/**
 * Where a placement lands (face-placement spec 2).
 *
 * Three inputs and one answer, which is why it is a value function rather than a method on
 * the renderer: `node:test` can pin every branch of spec 2 without a canvas, and the C++
 * translation is the same six lines.
 *
 * * **A face was hit** -- the block under the pointer, and the face the view ray entered it
 *   through. The placement lands across that face (2.1).
 * * **Nothing was hit but the pad was** -- the cell resting on the pad (2.2).
 * * **Neither** -- the pointer is on the apron, the lane or the sky, and a placement there
 *   would rest on nothing (2.2).
 *
 * `occupied` is the presence of *every* live block, peeled or not, and it has to be: the
 * pick skips peeled cells (pointing spec 2.5) while the blocks are still there, so the cell
 * across a reach-plane block's camera-facing face can already hold one. Overwriting a block
 * the tester cannot see is the uncommanded edit spec 2.4 refuses.
 */
export class PlacementRule {
  /** Nowhere to place: the pointer is over nothing buildable, or over an occupied cell. */
  public static readonly NONE: IVec3 | null = null;

  public static target(
    hit: FaceHit | null,
    ground: IVec3 | null,
    occupied: CellPresence
  ): IVec3 | null {
    const cell = hit === null ? ground : hit.adjacent();
    if (cell === null) {
      return PlacementRule.NONE;
    }
    // 2.4: a placement into an occupied cell changes nothing -- no block, no bill, and
    // nothing on the undo stack.
    if (occupied.isSolid(cell.x, cell.y, cell.z)) {
      return PlacementRule.NONE;
    }
    return cell;
  }
}
