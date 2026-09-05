import { CellPresence } from "./CellPresence";
import { FieldFrame } from "./FieldFrame";

/**
 * The frame's live blocks, as the presence predicate the face rules need.
 *
 * One of these per composition. There used to be two -- "alive and not peeled" and "alive" --
 * and the peel was the only reason for the pair; with the cutaway gone (no-sections spec 3)
 * a block is either there or it is not, and the face rules, the occlusion rule of spec 3.3
 * and the pick all ask the same question.
 */
export class FrameCells implements CellPresence {
  private readonly frame: FieldFrame;

  public constructor(frame: FieldFrame) {
    this.frame = frame;
  }

  public isSolid(x: number, y: number, z: number): boolean {
    return this.frame.liveBlockAt(x, y, z) >= 0;
  }
}
