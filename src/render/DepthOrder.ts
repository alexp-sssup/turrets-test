import { SectionCue } from "./SectionCue";
import { ViewMode } from "./ViewMode";

/**
 * The cross-sections in the order they are composited, each with its cue (depth view spec 3).
 *
 * Back to front, farthest first: larger x is farther from the viewer, so the depth mode
 * walks x downward and the nearest section lands on top. The sections in front of the
 * active one therefore draw last -- which is what makes the peel read as a cutaway rather
 * than as missing geometry, since an outline over the working plane is exactly what a
 * removed wall looks like.
 *
 * The flat view has no depth to order, and there the active section must draw *last* so the
 * ghosts stay behind it. That is the one thing the two orders disagree about, and it is why
 * this is a class rather than a loop written twice.
 *
 * A plain value computation over four numbers: no design, no frame, no canvas.
 */
export class DepthOrder {
  public readonly cues: readonly SectionCue[];
  public readonly activeX: number;
  public readonly mode: ViewMode;

  public constructor(minX: number, maxX: number, activeX: number, mode: ViewMode) {
    this.activeX = activeX;
    this.mode = mode;
    const cues: SectionCue[] = [];
    const low = minX < activeX ? minX : activeX;
    const high = maxX > activeX ? maxX : activeX;
    if (mode === ViewMode.Depth) {
      for (let x = high; x >= low; x--) {
        cues.push(SectionCue.forSection(x, activeX, mode));
      }
    } else {
      for (let x = low; x <= high; x++) {
        if (x !== activeX) {
          cues.push(SectionCue.forSection(x, activeX, mode));
        }
      }
      cues.push(SectionCue.forSection(activeX, activeX, mode));
    }
    this.cues = cues;
  }

  public get count(): number {
    return this.cues.length;
  }

  /** How many sections stand between the viewer and the working plane (spec 5). */
  public get peeledCount(): number {
    if (this.mode !== ViewMode.Depth) {
      return 0;
    }
    let peeled = 0;
    for (let i = 0; i < this.cues.length; i++) {
      if (this.cues[i].inFront) {
        peeled++;
      }
    }
    return peeled;
  }
}
