import { IVec3 } from "../../core/IVec3";
import { DrawContext, Layer } from "../Layer";
import { Palette, UtilizationBand } from "../Palette";
import { OverlayMode, overlayName } from "../ViewState";

/**
 * Per-joint utilization: the heatmap, and the most expensive claim in the project.
 *
 * Spec 1.1 asks whether a player can read the solver. The solver's answer is a per-joint
 * field whose peak is exactly `1 / loadFactor`, so the overlay cannot disagree with the
 * headline margin -- but only if the field is drawn *where the joints are*. So a joint is
 * drawn on the face it actually is: a bar between two stacked blocks, a bar between two
 * blocks along the lane, a pad under a block that rests on the ground, and a small square
 * for a joint whose face is perpendicular to the cross-section.
 *
 * Two hard requirements from UI spec 4, both met here:
 *
 * * **Not hue alone.** Each of the four bands has its own luminance *and* its own hatch
 *   pattern, so the overlay survives greyscale and survives colourblindness.
 * * **Composes, never replaces.** The base layer has already drawn the structure; this
 *   draws on top of it. Losing sight of the wall to read its stress defeats the purpose.
 */
export class StressLayer implements Layer {
  public readonly id: string = overlayName(OverlayMode.Stress);

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
      // `critical` marks the failure mechanism at the *collapse* load, which is a
      // non-empty set even for a structure with a margin of thirty. Ringing those in red
      // would tell a tester their sound design is failing, so the loud ring is reserved
      // for joints over capacity at the load actually applied, and the mechanism only
      // earns it once the structure is over capacity as a whole.
      const failing = utilization >= 1;
      const inMechanism = joints.critical[j] === 1 && frame.loadFactor < 1;
      this.drawJoint(
        context,
        lowPosition,
        highPosition,
        band,
        failing || inMechanism,
        joints.predictive[j] === 1,
        utilization
      );
    }
  }

  private drawJoint(
    context: DrawContext,
    low: IVec3 | null,
    high: IVec3,
    band: UtilizationBand,
    critical: boolean,
    predictive: boolean,
    utilization: number
  ): void {
    const scale = context.projection.scale;
    const thickness = scale * 0.17 < 3 ? 3 : scale * 0.17;

    let left: number;
    let top: number;
    let width: number;
    let height: number;

    if (low === null) {
      // A support: the pad pushing back under the block. It never pulls, which is what
      // makes overturning fall out of the solver rather than needing a rule.
      left = context.projection.screenX(high.z) + scale * 0.15;
      top = context.projection.screenY(high.y) + scale - thickness * 0.5;
      width = scale * 0.7;
      height = thickness;
    } else if (low.y !== high.y) {
      const lower = low.y < high.y ? low : high;
      left = context.projection.screenX(lower.z) + scale * 0.15;
      top = context.projection.screenY(lower.y) - thickness * 0.5;
      width = scale * 0.7;
      height = thickness;
    } else if (low.z !== high.z) {
      const nearer = low.z < high.z ? low : high;
      left = context.projection.screenX(nearer.z + 1) - thickness * 0.5;
      top = context.projection.screenY(nearer.y) + scale * 0.15;
      width = thickness;
      height = scale * 0.7;
    } else {
      // The face is perpendicular to the cross-section: this joint runs into the screen.
      // Drawn as a small square at the cell's centre, so it is visible without pretending
      // to have an extent it does not have in this projection.
      const side = thickness * 1.3;
      left = context.projection.screenX(high.z) + scale * 0.5 - side * 0.5;
      top = context.projection.screenY(high.y) + scale * 0.5 - side * 0.5;
      width = side;
      height = side;
    }

    const ctx = context.ctx;
    ctx.fillStyle = band.fill;
    ctx.fillRect(left, top, width, height);
    if (band.hatchSpacing > 0) {
      StressLayer.hatch(ctx, left, top, width, height, band);
    }
    ctx.strokeStyle = "rgba(10,12,16,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 0.5, top - 0.5, width + 1, height + 1);

    if (critical) {
      // Over capacity at the applied load, or part of the mechanism of a structure that
      // is. This is what shears.
      ctx.strokeStyle = Palette.danger;
      ctx.lineWidth = 2;
      ctx.strokeRect(left - 2.5, top - 2.5, width + 5, height + 5);
      ctx.lineWidth = 1;
    } else if (predictive) {
      ctx.strokeStyle = Palette.warning;
      ctx.strokeRect(left - 1.5, top - 1.5, width + 3, height + 3);
    }

    if (scale >= 30 && utilization >= 0.8 && Number.isFinite(utilization)) {
      ctx.fillStyle = Palette.text;
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(utilization.toFixed(2), left, top - 3);
    }
  }

  /**
   * The texture half of the encoding. Diagonals for the middle band, crossed diagonals for
   * the two that matter, so the four bands are four distinguishable textures in greyscale.
   */
  private static hatch(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    width: number,
    height: number,
    band: UtilizationBand
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, width, height);
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
