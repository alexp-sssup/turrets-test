/**
 * How one cross-section is drawn relative to the build plane (isometric renderer spec 6).
 *
 * The peel rule in one value type: the build plane is never occluded, everything between it
 * and the camera is peeled to a wireframe, and everything behind it is drawn solid and
 * dimmed with distance. A section's treatment is a function of its signed distance from the
 * build plane and of the yaw, and of nothing else -- no camera state, no per-section state,
 * nothing a tester has to set.
 *
 * Two separate depth cues, and the split is load-bearing. **`dim` mixes a solid cell's
 * colour toward the background; `alpha` is only ever used for the wireframe strokes.** A
 * solid cell is never drawn translucent, because alpha composites multiply and a cell whose
 * luminance depended on how many cells sat behind it would break the one non-negotiable in
 * UI spec 4 -- which is exactly the reason spec 6.1 rejects an x-ray mode.
 *
 * Kept free of the canvas so the rule itself is testable headlessly, which matters because
 * "can a tester see inside their turret" is decided here rather than in the drawing code.
 */
export class SectionCue {
  public readonly sectionX: number;
  /** Sections between this one and the build plane. Zero for the build plane itself. */
  public readonly distance: number;
  public readonly active: boolean;
  /** Between the camera and the build plane: this is what gets cut away. */
  public readonly inFront: boolean;
  /** Stroked, not filled. True only for peeled sections. */
  public readonly wireframe: boolean;
  /** Stroke alpha, for wireframe sections only. */
  public readonly alpha: number;
  /** How far a solid cell's colour is mixed toward the background: 0 full, 1 gone. */
  public readonly dim: number;
  /** `dim` as a rung, so the painter can look a fill up instead of building a colour. */
  public readonly dimIndex: number;
  /** Filled with the block's own material colour rather than the flat view's neutral ghost. */
  public readonly material: boolean;
  /** Glyphs, rack pips and depot fill bars. The build plane only: they are noise behind it. */
  public readonly detail: boolean;

  public constructor(
    sectionX: number,
    distance: number,
    active: boolean,
    inFront: boolean,
    wireframe: boolean,
    alpha: number,
    dim: number,
    dimIndex: number,
    material: boolean,
    detail: boolean
  ) {
    this.sectionX = sectionX;
    this.distance = distance;
    this.active = active;
    this.inFront = inFront;
    this.wireframe = wireframe;
    this.alpha = alpha;
    this.dim = dim;
    this.dimIndex = dimIndex;
    this.material = material;
    this.detail = detail;
  }

  /**
   * The ramps of spec 6.
   *
   * Both have a floor: a section that fades to nothing has been deleted rather than dimmed,
   * and "there are two more walls in front of this" is information a tester needs in order
   * to trust the cutaway.
   */
  public static readonly WIRE_NEAREST: number = 0.38;
  public static readonly WIRE_FALLOFF: number = 0.78;
  public static readonly WIRE_FLOOR: number = 0.14;
  public static readonly DIM_PER_SECTION: number = 0.16;
  public static readonly DIM_CEILING: number = 0.55;
  /** How many distinct dim rungs exist, and therefore how many fills a palette precomputes. */
  public static readonly DIM_STEPS: number = 5;

  /** The build plane: the full treatment, in every mode. */
  public static plane(sectionX: number): SectionCue {
    return new SectionCue(sectionX, 0, true, false, false, 1, 0, 0, true, true);
  }

  /** Behind the build plane, or anywhere at all when nothing is peeled. */
  public static solid(sectionX: number, distance: number, inFront: boolean): SectionCue {
    let index = distance;
    if (index > SectionCue.DIM_STEPS - 1) {
      index = SectionCue.DIM_STEPS - 1;
    }
    let dim = SectionCue.DIM_PER_SECTION * index;
    if (dim > SectionCue.DIM_CEILING) {
      dim = SectionCue.DIM_CEILING;
    }
    return new SectionCue(sectionX, distance, false, inFront, false, 1, dim, index, true, false);
  }

  /** Between the camera and the build plane: the cutaway, shown as cut away. */
  public static peeled(sectionX: number, distance: number): SectionCue {
    let alpha = SectionCue.WIRE_NEAREST;
    for (let i = 1; i < distance; i++) {
      alpha *= SectionCue.WIRE_FALLOFF;
    }
    if (alpha < SectionCue.WIRE_FLOOR) {
      alpha = SectionCue.WIRE_FLOOR;
    }
    return new SectionCue(sectionX, distance, false, true, true, alpha, 0, 0, false, false);
  }

  /**
   * The flat dev view's ghost (spec 9): one neutral fill for every other section, because in
   * that projection they all land in the same place and depth cannot mean anything.
   * `Palette.ghost` carries its own alpha, so the cue does not add a second one.
   */
  public static ghost(sectionX: number, distance: number, inFront: boolean): SectionCue {
    return new SectionCue(sectionX, distance, false, inFront, false, 1, 0, 0, false, false);
  }
}
