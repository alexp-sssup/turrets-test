import { SectionCue } from "./SectionCue";
import { ViewMode } from "./ViewMode";
import { ViewYaw } from "./ViewYaw";

/**
 * Which sections are peeled, and what every section looks like (isometric renderer spec 6).
 *
 * > **The build plane is never occluded. Everything between it and the camera is peeled to a
 * > wireframe; everything behind it is drawn solid.**
 *
 * Which sections count as "in front" comes from the yaw and not from the sign of x, because
 * a quarter turn moves the camera to the other side of the turret (spec 2.2). And peeling
 * *those* sections is exactly enough: one step along the view ray changes the section index
 * by exactly one at every yaw, so every occluder of a build-plane cell lies in a nearer
 * section, and there are no others. That is what makes plane-locked placement honest --
 * with the peel engaged, what a tester clicks on is what a tester gets (spec 5.3).
 *
 * Peel depth is per-screen (spec 6): Design opens on an open cutaway, Run and Replay on a
 * solid turret, because a run rendered as a cross-section is a run nobody is playing.
 *
 * A plain value computation over four numbers and a yaw: no design, no frame, no canvas.
 */
export class PeelPlane {
  public readonly activeX: number;
  public readonly mode: ViewMode;
  public readonly peeling: boolean;
  private readonly minX: number;
  private readonly cues: readonly SectionCue[];

  public constructor(
    minX: number,
    maxX: number,
    activeX: number,
    yaw: ViewYaw,
    mode: ViewMode,
    peeling: boolean
  ) {
    this.activeX = activeX;
    this.mode = mode;
    this.peeling = peeling && mode === ViewMode.Iso;
    const low = minX < activeX ? minX : activeX;
    const high = maxX > activeX ? maxX : activeX;
    this.minX = low;
    const cues: SectionCue[] = [];
    for (let x = low; x <= high; x++) {
      cues.push(PeelPlane.cue(x, activeX, yaw, mode, this.peeling));
    }
    this.cues = cues;
  }

  private static cue(
    sectionX: number,
    activeX: number,
    yaw: ViewYaw,
    mode: ViewMode,
    peeling: boolean
  ): SectionCue {
    if (sectionX === activeX) {
      return SectionCue.plane(sectionX);
    }
    const offset = sectionX - activeX;
    const distance = offset < 0 ? -offset : offset;
    const inFront = yaw.isInFront(sectionX, activeX);
    if (mode === ViewMode.Flat) {
      return SectionCue.ghost(sectionX, distance, offset < 0);
    }
    if (peeling && inFront) {
      return SectionCue.peeled(sectionX, distance);
    }
    // Nothing peeled: the turret is solid and it is the turret the game would show. Only the
    // sections behind the build plane are dimmed, and only when something is being peeled --
    // otherwise a Run frame would fade half a turret for no reason a player could see.
    return SectionCue.solid(sectionX, peeling ? distance : 0, inFront);
  }

  public get count(): number {
    return this.cues.length;
  }

  public at(index: number): SectionCue {
    return this.cues[index];
  }

  /** The treatment of the section a cell stands in. Out-of-range sections read as solid. */
  public cueFor(sectionX: number): SectionCue {
    const index = sectionX - this.minX;
    if (index < 0 || index >= this.cues.length) {
      return SectionCue.solid(sectionX, 0, false);
    }
    return this.cues[index];
  }

  /** True when the cell is drawn as part of the cutaway rather than as solid geometry. */
  public isPeeled(sectionX: number): boolean {
    return this.cueFor(sectionX).wireframe;
  }

  /** How many sections stand between the camera and the build plane (spec 6). */
  public get peeledCount(): number {
    let peeled = 0;
    for (let i = 0; i < this.cues.length; i++) {
      if (this.cues[i].wireframe) {
        peeled++;
      }
    }
    return peeled;
  }
}
