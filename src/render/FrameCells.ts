import { CellPresence } from "./CellPresence";
import { FieldFrame } from "./FieldFrame";
import { PeelPlane } from "./PeelPlane";

/**
 * The frame's live blocks, as the presence predicate the face rules need.
 *
 * Two of these exist per composition, and the difference between them is the peel:
 *
 * * **Solid** cells are alive and not peeled. This is what face visibility and the occlusion
 *   rule of spec 3.3 consult, because a cell behind a peeled wall is not hidden -- the wall
 *   is a wireframe and there is nothing there to hide it.
 * * **All** cells are alive, peeled or not. The wireframe pass consults this, so a two-deep
 *   cutaway reads as one outlined shape rather than as every cell in it outlined.
 */
export class FrameCells implements CellPresence {
  private readonly frame: FieldFrame;
  private readonly peel: PeelPlane;
  private readonly solidOnly: boolean;

  public constructor(frame: FieldFrame, peel: PeelPlane, solidOnly: boolean) {
    this.frame = frame;
    this.peel = peel;
    this.solidOnly = solidOnly;
  }

  public isSolid(x: number, y: number, z: number): boolean {
    const index = this.frame.liveBlockAt(x, y, z);
    if (index < 0) {
      return false;
    }
    return !this.solidOnly || !this.peel.isPeeled(x);
  }
}
