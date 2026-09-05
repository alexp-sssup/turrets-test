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
 * `occupied` can no longer refuse anything, and the guard stays anyway (no-sections spec
 * 2.3). The cell across the face a ray entered by is the cell it visited immediately before,
 * and the traversal only got there by finding that cell empty -- so a collision is now a
 * theorem's negation rather than a case. It is kept because it is this function's contract
 * rather than its caller's, because it costs one lookup, and because §5 of that document
 * asks for the theorem to be tested instead of assumed.
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
    // face-placement 2.4: a placement into an occupied cell changes nothing -- no block, no
    // bill, and nothing on the undo stack. Unreachable through a ray (no-sections spec 2.3).
    if (occupied.isSolid(cell.x, cell.y, cell.z)) {
      return PlacementRule.NONE;
    }
    return cell;
  }
}
