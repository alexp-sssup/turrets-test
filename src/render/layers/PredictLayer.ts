import { CellSilhouette } from "../CellSilhouette";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";
import { PredictOutcome } from "../PredictAnalysis";
import { OverlayMode, overlayName } from "../ViewState";

/**
 * The predictive overlay: pick a cell, see what goes with it.
 *
 * The outcome is computed by `PredictAnalysis` off the render path and pushed in here, so a
 * frame never blocks on a solve. When the answer is stale (the player has moved on, or the
 * solve has not landed yet) the layer says so instead of drawing a lie -- an overlay that
 * quietly shows the previous cell's answer would be worse than one that shows nothing.
 */
export class PredictLayer implements Layer {
  public readonly id: string = overlayName(OverlayMode.Predict);
  private outcome: PredictOutcome | null;
  private pending: boolean;

  public constructor() {
    this.outcome = null;
    this.pending = false;
  }

  public setOutcome(outcome: PredictOutcome | null): void {
    this.outcome = outcome;
    this.pending = false;
  }

  public setPending(): void {
    this.pending = true;
  }

  public get current(): PredictOutcome | null {
    return this.outcome;
  }

  public draw(context: DrawContext): void {
    const focus = context.view.focusCell();
    if (focus === null) {
      PredictLayer.prompt(context, "hover or click a cell");
      return;
    }
    const ctx = context.ctx;

    // The candidate itself.
    CellSilhouette.trace(context, focus.x, focus.y, focus.z);
    ctx.strokeStyle = Palette.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    const outcome = this.outcome;
    if (outcome === null || !outcome.cell.equals(focus)) {
      PredictLayer.prompt(context, this.pending ? "solving..." : "no answer yet");
      return;
    }
    if (!outcome.collapses) {
      PredictLayer.prompt(context, "nothing else falls");
      return;
    }

    // What goes with it. Drawn at each block's own depth and occluded by nothing (isometric
    // renderer spec 4.1): the answer to "what else falls" is worthless if the blocks that
    // fall are behind a wall.
    const blueprint = context.frame.design.blueprint;
    for (let i = 0; i < outcome.lostBlocks.length; i++) {
      const position = blueprint.blockAt(outcome.lostBlocks[i]).position;
      const onSlice = position.x === context.view.slice;
      CellSilhouette.trace(context, position.x, position.y, position.z);
      ctx.globalAlpha = onSlice ? 0.5 : 0.28;
      ctx.fillStyle = Palette.danger;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = Palette.danger;
      ctx.lineWidth = onSlice ? 1.5 : 1;
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    PredictLayer.prompt(
      context,
      outcome.lostBlocks.length.toString() +
        " block(s) follow, " +
        outcome.severedJoints.length.toString() +
        " joint(s) shear (" +
        outcome.solveMs.toFixed(0) +
        " ms)"
    );
  }

  private static prompt(context: DrawContext, text: string): void {
    const ctx = context.ctx;
    const label = "predict: " + text;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "rgba(12,16,22,0.8)";
    ctx.fillRect(8, context.projection.heightPx - 28, ctx.measureText(label).width + 14, 20);
    ctx.fillStyle = Palette.text;
    ctx.fillText(label, 14, context.projection.heightPx - 14);
  }
}
