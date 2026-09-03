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
    const scale = context.projection.scale;
    const ctx = context.ctx;

    // The candidate itself.
    const x = context.projection.screenXAt(focus.x, focus.z);
    const y = context.projection.screenYAt(focus.x, focus.y);
    ctx.strokeStyle = Palette.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(x + 0.5, y + 0.5, scale - 1, scale - 1);
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

    const blueprint = context.frame.design.blueprint;
    for (let i = 0; i < outcome.lostBlocks.length; i++) {
      const position = blueprint.blockAt(outcome.lostBlocks[i]).position;
      const onSlice = position.x === context.view.slice;
      const left = context.projection.screenXAt(position.x, position.z);
      const top = context.projection.screenYAt(position.x, position.y);
      ctx.globalAlpha = onSlice ? 0.55 : 0.2;
      ctx.fillStyle = Palette.danger;
      ctx.fillRect(left + 1, top + 1, scale - 2, scale - 2);
      ctx.globalAlpha = 1;
      if (onSlice) {
        ctx.strokeStyle = Palette.danger;
        ctx.beginPath();
        ctx.moveTo(left + 3, top + 3);
        ctx.lineTo(left + scale - 3, top + scale - 3);
        ctx.moveTo(left + scale - 3, top + 3);
        ctx.lineTo(left + 3, top + scale - 3);
        ctx.stroke();
      }
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
