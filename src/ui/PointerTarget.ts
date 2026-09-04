import { IVec3 } from "../core/IVec3";

/**
 * Which cell a pointer addresses (pointing spec 2).
 *
 * Two questions, and the whole of the difference between them is whether the verb is about
 * a block that already exists:
 *
 * * **Inspect** names the frontmost visible block under the pointer, on every screen
 *   (isometric renderer spec 5.2, restored on Design by pointing spec 2.1).
 * * **An edit** puts a new block in the build plane and nowhere else (iso spec 5.3), unless
 *   the eraser is armed -- and the eraser takes away a block that is already drawn, so it
 *   addresses the picked one (pointing spec 2.2).
 *
 * It takes the two candidate cells rather than a projection or a canvas, for the reason
 * mobile UI spec 7.2 gives for `GestureRecognizer`: the rule is then a function from values
 * to values, `node:test` can pin it either side of every case, and nothing here will
 * refuse to port.
 */
export class PointerTarget {
  /**
   * The cell an inspect names (pointing spec 2.1).
   *
   * `picked` is the frontmost visible block, or `null` over empty scene -- where the
   * build-plane cell is the honest answer to "what is here", because it is the cell the
   * same click would have filled. It is also what keeps a sweep continuous as the finger
   * crosses a gap.
   */
  public static toInspect(picked: IVec3 | null, buildPlaneCell: IVec3): IVec3 {
    return picked === null ? buildPlaneCell : picked;
  }

  /**
   * The cell an edit changes (pointing spec 2.2, 2.3), or `null` when there is nothing to
   * change: the eraser over empty scene.
   *
   * A placing entry never returns `null`, because a placement always has somewhere to land.
   */
  public static toEdit(erases: boolean, picked: IVec3 | null, buildPlaneCell: IVec3): IVec3 | null {
    return erases ? picked : buildPlaneCell;
  }
}
