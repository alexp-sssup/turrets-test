import { IVec3 } from "../../core/IVec3";
import { DrawContext, Layer } from "../Layer";
import { Palette, UtilizationBand } from "../Palette";
import { OverlayMode, overlayName } from "../ViewState";

/**
 * Per-joint utilization: the heatmap, and the most expensive claim in the project.
 *
 * UI spec 1.1 asks whether a player can read the solver. The solver's answer is a per-joint
 * field whose peak is exactly `1 / loadFactor`, so the overlay cannot disagree with the
 * headline margin -- but only if the field is drawn *where the joints are*. In an isometric
 * view that is finally possible: a joint has a face, the face has an extent, and the mark is
 * that face. A joint normal to the cross-section -- the lateral bracing of a wide turret,
 * which the flat view could only draw as a small square with no extent -- is drawn on the
 * plane it actually is.
 *
 * Three requirements, all from UI spec 4 and isometric renderer spec 10:
 *
 * * **Not hue alone.** Each of the four bands has its own luminance *and* its own hatch
 *   pattern, so the overlay survives greyscale and survives colourblindness.
 * * **Composes, never replaces.** The composition has already drawn the structure; this
 *   draws on top of it and is occluded by nothing (spec 4.1). A stress bar hidden behind the
 *   wall it describes is a measurement lost.
 * * **Anchored to the build plane.** The joints touching the active section and no others,
 *   at every yaw, so a quarter turn does not change the question the overlay answers.
 */
export class StressLayer implements Layer {
  public readonly id: string = overlayName(OverlayMode.Stress);
  /** How far the mark is inset from the face it sits on, so neighbours stay distinct. */
  private static readonly INSET: number = 0.16;
  private readonly quadX: Float64Array;
  private readonly quadY: Float64Array;

  public constructor() {
    this.quadX = new Float64Array(4);
    this.quadY = new Float64Array(4);
  }

  public draw(context: DrawContext): void {
    const frame = context.frame;
    const joints = frame.joints;
    if (joints.count === 0) {
      return;
    }
    const blueprint = frame.design.blueprint;
    const slice = context.view.slice;

    for (let j = 0; j < joints.count; j++) {
      const low = joints.low[j];
      const high = joints.high[j];
      const highPosition = blueprint.blockAt(high).position;
      const lowPosition = low >= 0 ? blueprint.blockAt(low).position : null;
      const onSlice = highPosition.x === slice || (lowPosition !== null && lowPosition.x === slice);
      if (!onSlice) {
        continue;
      }
      const utilization = joints.utilization[j];
      const band = Palette.bandOf(utilization);
      // `critical` marks the failure mechanism at the *collapse* load, which is a non-empty
      // set even for a structure with a margin of thirty. Ringing those in red would tell a
      // tester their sound design is failing, so the loud ring is reserved for joints over
      // capacity at the load actually applied, and the mechanism only earns it once the
      // structure is over capacity as a whole.
      const failing = utilization >= 1;
      const inMechanism = joints.critical[j] === 1 && frame.loadFactor < 1;
      this.drawJoint(context, lowPosition, highPosition, band, failing || inMechanism, joints.predictive[j] === 1, utilization);
    }
  }

  /**
   * The face a joint is: the shared face of its two blocks, or the pad under a block that
   * rests on the ground. Inset, so two joints on the same block do not merge.
   */
  private drawJoint(
    context: DrawContext,
    low: IVec3 | null,
    high: IVec3,
    band: UtilizationBand,
    critical: boolean,
    predictive: boolean,
    utilization: number
  ): void {
    const inset = StressLayer.INSET;
    const near = inset;
    const far = 1 - inset;
    if (low === null || low.y !== high.y) {
      // A support -- the pad pushing back, which never pulls, which is what makes
      // overturning fall out of the solver rather than needing a rule -- or a stacked pair.
      // Either way the shared face is horizontal.
      const upper = low === null ? high : low.y > high.y ? low : high;
      this.horizontalFace(context, upper.y, upper.x + near, upper.z + near, upper.x + far, upper.z + far);
    } else if (low.z !== high.z) {
      const nearer = low.z < high.z ? low : high;
      this.lateralFaceZ(context, nearer.z + 1, nearer.x + near, nearer.y + near, nearer.x + far, nearer.y + far);
    } else {
      // The face is normal to the cross-section: the lateral bracing of a wide turret, drawn
      // on the plane between the two sections it joins.
      const nearer = low.x < high.x ? low : high;
      this.lateralFaceX(context, nearer.x + 1, nearer.z + near, nearer.y + near, nearer.z + far, nearer.y + far);
    }
    this.paint(context, band, critical, predictive, utilization);
  }

  /** A rectangle in the horizontal plane `y`, projected into the scratch quad. */
  private horizontalFace(
    context: DrawContext,
    y: number,
    x0: number,
    z0: number,
    x1: number,
    z1: number
  ): void {
    this.corner(context, 0, x0, y, z0);
    this.corner(context, 1, x1, y, z0);
    this.corner(context, 2, x1, y, z1);
    this.corner(context, 3, x0, y, z1);
  }

  /** A rectangle in the plane `z`, spanning x and y. */
  private lateralFaceZ(
    context: DrawContext,
    z: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): void {
    this.corner(context, 0, x0, y0, z);
    this.corner(context, 1, x1, y0, z);
    this.corner(context, 2, x1, y1, z);
    this.corner(context, 3, x0, y1, z);
  }

  /** A rectangle in the cross-section `x`, spanning z and y. */
  private lateralFaceX(
    context: DrawContext,
    x: number,
    z0: number,
    y0: number,
    z1: number,
    y1: number
  ): void {
    this.corner(context, 0, x, y0, z0);
    this.corner(context, 1, x, y0, z1);
    this.corner(context, 2, x, y1, z1);
    this.corner(context, 3, x, y1, z0);
  }

  private corner(context: DrawContext, index: number, x: number, y: number, z: number): void {
    this.quadX[index] = context.projection.screenX(x, z);
    this.quadY[index] = context.projection.screenY(x, y, z);
  }

  private paint(
    context: DrawContext,
    band: UtilizationBand,
    critical: boolean,
    predictive: boolean,
    utilization: number
  ): void {
    const ctx = context.ctx;
    this.trace(ctx);
    ctx.fillStyle = band.fill;
    ctx.fill();
    if (band.hatchSpacing > 0) {
      this.hatch(ctx, band);
    }
    this.trace(ctx);
    ctx.strokeStyle = "rgba(10,12,16,0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (critical) {
      ctx.strokeStyle = Palette.danger;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (predictive) {
      ctx.strokeStyle = Palette.warning;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    if (context.projection.scale >= 24 && utilization >= 0.8 && Number.isFinite(utilization)) {
      ctx.fillStyle = Palette.text;
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(utilization.toFixed(2), this.quadX[0], this.quadY[0] - 3);
    }
  }

  private trace(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(this.quadX[0], this.quadY[0]);
    for (let corner = 1; corner < 4; corner++) {
      ctx.lineTo(this.quadX[corner], this.quadY[corner]);
    }
    ctx.closePath();
  }

  /**
   * The texture half of the encoding. Diagonals for the middle band, crossed diagonals for
   * the two that matter, so the four bands are four distinguishable textures in greyscale.
   */
  private hatch(ctx: CanvasRenderingContext2D, band: UtilizationBand): void {
    let left = this.quadX[0];
    let right = this.quadX[0];
    let top = this.quadY[0];
    let bottom = this.quadY[0];
    for (let corner = 1; corner < 4; corner++) {
      left = this.quadX[corner] < left ? this.quadX[corner] : left;
      right = this.quadX[corner] > right ? this.quadX[corner] : right;
      top = this.quadY[corner] < top ? this.quadY[corner] : top;
      bottom = this.quadY[corner] > bottom ? this.quadY[corner] : bottom;
    }
    const width = right - left;
    const height = bottom - top;
    ctx.save();
    this.trace(ctx);
    ctx.clip();
    ctx.strokeStyle = "rgba(12,14,18,0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const span = width + height;
    for (let offset = -height; offset < span; offset += band.hatchSpacing) {
      ctx.moveTo(left + offset, top);
      ctx.lineTo(left + offset + height, top + height);
    }
    if (band.crossHatched) {
      for (let offset = 0; offset < span + height; offset += band.hatchSpacing) {
        ctx.moveTo(left + offset, top);
        ctx.lineTo(left + offset - height, top + height);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}
