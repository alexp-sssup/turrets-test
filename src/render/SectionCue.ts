import { ViewMode } from "./ViewMode";

/**
 * How one cross-section is drawn relative to the active one (depth view spec 3).
 *
 * The peel rule in one value type: the active section is never occluded, everything nearer
 * the viewer is peeled to an outline, and everything behind it is drawn solid and dimmed
 * with distance. A section's treatment is a function of its signed distance from the active
 * one and of nothing else -- no camera, no per-section state, and nothing a tester has to
 * set.
 *
 * Kept free of the canvas so the rule itself is testable headlessly, which matters because
 * "can a tester see inside their turret" is decided here rather than in the drawing code.
 */
export class SectionCue {
  public readonly sectionX: number;
  /** Sections between this one and the active one. Zero for the active section. */
  public readonly distance: number;
  public readonly active: boolean;
  /** Nearer the viewer than the active section: this is what gets cut away. */
  public readonly inFront: boolean;
  public readonly alpha: number;
  /** Stroked, not filled. True only for the sections in front of the active one. */
  public readonly outline: boolean;
  /** Filled with the block's own material colour rather than the neutral ghost. */
  public readonly material: boolean;
  /** Glyphs, rack pips and depot fill bars. The active section only: they are noise behind it. */
  public readonly detail: boolean;

  public constructor(
    sectionX: number,
    distance: number,
    active: boolean,
    inFront: boolean,
    alpha: number,
    outline: boolean,
    material: boolean,
    detail: boolean
  ) {
    this.sectionX = sectionX;
    this.distance = distance;
    this.active = active;
    this.inFront = inFront;
    this.alpha = alpha;
    this.outline = outline;
    this.material = material;
    this.detail = detail;
  }

  /**
   * The alpha ramps of spec 3.
   *
   * Both fall geometrically and both have a floor: a section that fades to nothing has been
   * deleted rather than dimmed, and "there are two more walls in front of this" is
   * information a tester needs in order to trust the cutaway.
   */
  public static readonly BEHIND_NEAREST: number = 0.55;
  public static readonly BEHIND_FALLOFF: number = 0.72;
  public static readonly BEHIND_FLOOR: number = 0.18;
  public static readonly FRONT_NEAREST: number = 0.34;
  public static readonly FRONT_FALLOFF: number = 0.8;
  public static readonly FRONT_FLOOR: number = 0.12;

  public static forSection(sectionX: number, activeX: number, mode: ViewMode): SectionCue {
    const offset = sectionX - activeX;
    if (offset === 0) {
      return new SectionCue(sectionX, 0, true, false, 1, false, true, true);
    }
    const distance = offset < 0 ? -offset : offset;
    if (mode === ViewMode.Flat) {
      // The flat view's ghost, unchanged: one neutral fill for every other section, because
      // in that projection they all land in the same place and depth cannot mean anything.
      // `Palette.ghost` carries its own alpha, so the cue does not add a second one.
      return new SectionCue(sectionX, distance, false, offset < 0, 1, false, false, false);
    }
    if (offset > 0) {
      return new SectionCue(
        sectionX,
        distance,
        false,
        false,
        SectionCue.ramp(SectionCue.BEHIND_NEAREST, SectionCue.BEHIND_FALLOFF, SectionCue.BEHIND_FLOOR, distance),
        false,
        true,
        false
      );
    }
    return new SectionCue(
      sectionX,
      distance,
      false,
      true,
      SectionCue.ramp(SectionCue.FRONT_NEAREST, SectionCue.FRONT_FALLOFF, SectionCue.FRONT_FLOOR, distance),
      true,
      false,
      false
    );
  }

  private static ramp(nearest: number, falloff: number, floor: number, distance: number): number {
    let alpha = nearest;
    for (let i = 1; i < distance; i++) {
      alpha *= falloff;
    }
    return alpha < floor ? floor : alpha;
  }
}
