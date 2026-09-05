import { StationSnapshot } from "../FieldFrame";
import { CellSilhouette } from "../CellSilhouette";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";
import { OverlayMode, overlayName } from "../ViewState";

/**
 * Firing arcs and the shadows a design casts on itself.
 *
 * The flat cross-section created an honesty problem here that this projection removes. An
 * arc is a fan in the **horizontal** plane, and a side-on view of a vertical slice had
 * nowhere to put it, so the fan had to be exiled to a plan inset and the main view got a
 * single sight line. In the isometric view the fan lies on the plane it belongs to: nine
 * rays out of the muzzle at the station's own height, clear ones and blocked ones coloured,
 * drawn where a tester can compare them against the blocks that stop them.
 *
 * The plan inset stays, small and fixed in the corner. It is a reference, not a second
 * camera: it shows the whole arc at once even when the fan runs off the frame, and it is the
 * one place a gun buried behind another gun visibly reports nothing.
 *
 * Both read the same `ArcSample` walk the validator prints its percentage from, so the
 * picture and the number cannot disagree.
 */
export class ArcsLayer implements Layer {
  public readonly id: string = overlayName(OverlayMode.Arcs);

  public draw(context: DrawContext): void {
    const frame = context.frame;
    for (let i = 0; i < frame.stations.length; i++) {
      this.drawFan(context, frame.stations[i]);
    }
    this.drawPlanInset(context);
  }

  /**
   * The fan, on the horizontal plane through the muzzle.
   *
   * Every ray the validator walked, ending exactly where it was stopped, with the offending
   * block ringed. That answers both questions at once -- "why is this gun useless" and "how
   * much of the arc do I actually have" -- which the flat view had to split between a line
   * and an inset.
   */
  private drawFan(context: DrawContext, station: StationSnapshot): void {
    const ctx = context.ctx;
    const projection = context.projection;
    const blueprint = context.frame.design.blueprint;
    const position = blueprint.blockAt(station.block).position;
    const samples = station.arcSamples;
    if (samples.length === 0) {
      return;
    }

    const originX = position.x + 0.5;
    const originY = position.y + 0.5;
    const originZ = position.z + 0.5;
    const muzzleX = projection.screenX(originX, originZ);
    const muzzleY = projection.screenY(originX, originY, originZ);

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const endX = originX + sample.dirX * sample.steps;
      const endZ = originZ + sample.dirZ * sample.steps;
      ctx.strokeStyle = sample.clear ? "rgba(95,178,255,0.65)" : "rgba(255,92,92,0.8)";
      ctx.lineWidth = sample.clear ? 1.5 : 1;
      ctx.setLineDash(sample.clear ? [] : [4, 3]);
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(projection.screenX(endX, endZ), projection.screenY(endX, originY, endZ));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    const centre = samples[(samples.length - 1) >> 1];
    if (!centre.clear && centre.blockedBy >= 0) {
      const blocker = blueprint.blockAt(centre.blockedBy).position;
      CellSilhouette.trace(context, blocker.x, blocker.y, blocker.z);
      ctx.strokeStyle = Palette.danger;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = Palette.danger;
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(
        "blocks the sight line",
        CellSilhouette.centreX(context, blocker.x, blocker.z) + context.projection.scale,
        CellSilhouette.centreY(context, blocker.x, blocker.y, blocker.z)
      );
    }

    const label = (station.arcClearFraction * 100).toFixed(0) + "% clear";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = station.arcClearFraction < 0.5 ? Palette.danger : Palette.accent;
    ctx.fillText(label, muzzleX + 6, muzzleY - 8);
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
