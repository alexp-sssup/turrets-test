import { IVec3 } from "../core/IVec3";

/**
 * Which cell a pointer addresses (pointing spec 2, face-placement spec 2).
 *
 * Three verbs, one pick, and the whole of the difference between them is what they do about
 * the block they found:
 *
 * * **Inspect** names the frontmost visible block under the pointer, on every screen
 *   (isometric renderer spec 5.2, restored on Design by pointing spec 2.1).
 * * **The eraser** takes that same block away (pointing spec 2.2).
 * * **A placement** builds across the face the view ray entered it through, or on the pad
 *   where there is no block (face-placement spec 2.1, 2.2).
 *
 * The placement cell arrives already resolved, because working it out needs the ray, the pad
 * and the unpeeled block set and this rule needs none of them. What is left here is the
 * choice between two candidate cells -- which is a function from values to values, testable
 * either side of every case, and, for the reason mobile UI spec 7.2 gives for
 * `GestureRecognizer`, will not refuse to port.
 */
export class PointerTarget {
  /**
   * The cell an inspect names (pointing spec 2.1).
   *
   * `picked` is the frontmost visible block, or `null` over empty scene -- where the cell a
   * placement would have filled is the honest answer to "what is here", and it keeps a sweep
   * continuous as the finger crosses a gap. Over scene that would take no placement either
   * -- the sky, the lane, the apron -- there is nothing to name, and saying so is `null`.
   */
  public static toInspect(picked: IVec3 | null, placement: IVec3 | null): IVec3 | null {
    return picked === null ? placement : picked;
  }

  /**
   * The cell an edit changes, or `null` when there is nothing to change: the eraser over
   * empty scene (pointing spec 2.2), and a placement with no face and no pad under the
   * pointer, or with its target cell already occupied (face-placement spec 2.2, 2.4).
   */
  public static toEdit(
    erases: boolean,
    picked: IVec3 | null,
    placement: IVec3 | null
  ): IVec3 | null {
    return erases ? picked : placement;
  }
}
