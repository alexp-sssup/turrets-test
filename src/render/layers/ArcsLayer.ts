import { StationSnapshot } from "../FieldFrame";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";
import { OverlayMode, overlayName } from "../ViewState";

/**
 * Firing arcs and the shadows a design casts on itself.
 *
 * There is an honesty problem here that the 2D decision creates and this layer has to
 * answer for. An arc is a fan in the *horizontal* plane, and the main view is a vertical
 * cross-section, so the fan does not live in the drawn plane at all. Drawing it as a wedge
 * in the (z, y) view would be a picture of something that is not there.
 *
 * So it is drawn twice, each in the plane it belongs to:
 *
 * * In the main view, the sight line down the lane, ending exactly where the ray was
 *   stopped, with the offending block marked. That answers "why is this gun useless".
 * * In a small plan inset, the real nine-ray fan in (x, z) with clear and blocked rays
 *   coloured. That answers "how much of the arc do I actually have", and it is where a gun
 *   buried behind another gun visibly reports nothing.
 *
 * Both read the same `ArcSample` walk the validator prints its percentage from, so the
 * picture and the number cannot disagree. UI spec 2 notes that 2D only gives §1.3 a partial
 * answer; this is the part it can give.
 */
export class ArcsLayer implements Layer {
  public readonly id: string = overlayName(OverlayMode.Arcs);

  public draw(context: DrawContext): void {
    const frame = context.frame;
    for (let i = 0; i < frame.stations.length; i++) {
      this.drawSightLine(context, frame.stations[i]);
    }
    this.drawPlanInset(context);
  }

  private drawSightLine(context: DrawContext, station: StationSnapshot): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const blueprint = context.frame.design.blueprint;
    const position = blueprint.blockAt(station.block).position;
    const onSlice = position.x === context.view.slice;
    const samples = station.arcSamples;
    if (samples.length === 0) {
      return;
    }
    const centre = samples[(samples.length - 1) >> 1];
    const originX = context.projection.screenXAt(position.x, position.z) + scale * 0.5;
    const originY = context.projection.screenYAt(position.x, position.y) + scale * 0.5;
    const endZ = position.z + centre.dirZ * centre.steps;
    const endX = context.projection.screenXAt(position.x, endZ) + scale * 0.5;

    ctx.globalAlpha = onSlice ? 1 : 0.3;
    ctx.strokeStyle = centre.clear ? "rgba(95,178,255,0.75)" : Palette.danger;
    ctx.lineWidth = 2;
    ctx.setLineDash(centre.clear ? [] : [4, 3]);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(endX, originY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!centre.clear && centre.blockedBy >= 0) {
      const blocker = blueprint.blockAt(centre.blockedBy).position;
      const bx = context.projection.screenXAt(blocker.x, blocker.z);
      const by = context.projection.screenYAt(blocker.x, blocker.y);
      ctx.strokeStyle = Palette.danger;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 0.5, by + 0.5, scale - 1, scale - 1);
      ctx.fillStyle = Palette.danger;
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("blocks the sight line", bx + scale + 4, by + scale * 0.5);
    }

    const label = (station.arcClearFraction * 100).toFixed(0) + "% clear";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = station.arcClearFraction < 0.5 ? Palette.danger : Palette.accent;
    ctx.fillText(label, originX + 6, originY - 8);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
  }

  /**
   * The plan view: x across, z down, attackers arriving from the top. Small, fixed, and in
   * the corner -- it is a reference, not a second camera to learn.
   */
  private drawPlanInset(context: DrawContext): void {
    const ctx = context.ctx;
    const design = context.frame.design;
    const frame = context.frame;
    const size = 132;
    const margin = 12;
    const left = context.projection.widthPx - size - margin;
    const top = margin;

    const bounds = design.viewBounds;
    const zSpan = design.gun.range + design.pad.depth + 2;
    const xSpan = bounds.size.x;
    const cell = Math.min(size / zSpan, size / xSpan);
    const planX = (x: number): number => left + (x - bounds.min.x) * cell + (size - xSpan * cell) * 0.5;
    const planZ = (z: number): number => top + (z - (design.pad.minZ - design.gun.range)) * cell;

    ctx.fillStyle = "rgba(10,13,18,0.9)";
    ctx.fillRect(left, top, size, size);
    ctx.strokeStyle = Palette.padLine;
    ctx.strokeRect(left + 0.5, top + 0.5, size, size);
    ctx.fillStyle = Palette.textDim;
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillText("plan view: firing arcs", left + 4, top + 11);
    ctx.fillText("attackers", left + 4, top + 22);

    // The design from above, so the fan can be read against the blocks that stop it.
    const blueprint = design.blueprint;
    for (let i = 0; i < blueprint.blockCount; i++) {
      if (!frame.isAlive(i)) {
        continue;
      }
      const position = blueprint.blockAt(i).position;
      ctx.fillStyle = "rgba(150,168,190,0.30)";
      ctx.fillRect(planX(position.x), planZ(position.z), cell - 1, cell - 1);
    }

    for (let s = 0; s < frame.stations.length; s++) {
      const station = frame.stations[s];
      const position = blueprint.blockAt(station.block).position;
      const originX = planX(position.x) + cell * 0.5;
      const originZ = planZ(position.z) + cell * 0.5;
      const samples = station.arcSamples;
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        ctx.strokeStyle = sample.clear ? "rgba(95,178,255,0.7)" : "rgba(255,92,92,0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(originX, originZ);
        ctx.lineTo(originX + sample.dirX * sample.steps * cell, originZ + sample.dirZ * sample.steps * cell);
        ctx.stroke();
      }
      ctx.fillStyle = Palette.accent;
      ctx.fillRect(originX - 2, originZ - 2, 4, 4);
    }

    for (let a = 0; a < frame.attackers.length; a++) {
      const unit = frame.attackers[a];
      ctx.fillStyle = "#d8534f";
      ctx.fillRect(planX(unit.laneX) + cell * 0.25, planZ(unit.laneZ) + cell * 0.25, cell * 0.5, cell * 0.5);
    }
  }
}
