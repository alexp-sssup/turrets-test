import { AttackerSnapshot, StationSnapshot, StationStatus, isLoudStatus, stationStatusName } from "../FieldFrame";
import { CellSilhouette } from "../CellSilhouette";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";
import { ActorPainter } from "../ActorPainter";

/**
 * The marks that must never be occluded: station status, health, focus, and the arrow for a
 * unit still out in the lane.
 *
 * The actors themselves are geometry and are drawn in the sorted composition, where a
 * runner ends up behind the wall they walk behind (isometric renderer spec 4). What is left
 * here is the loud treatment UI spec 3.2 demands, and it draws *after* the sort and is
 * clipped by nothing (spec 4.1) -- because the one job of the Run screen is to make it
 * obvious why a gun is silent, and a DRY badge hidden behind a parapet is a tester deciding
 * the game cheats.
 */
export class ActorLayer implements Layer {
  public readonly id: string = "base";

  public draw(context: DrawContext): void {
    this.drawAttackerMarks(context);
    this.drawStationMarks(context);
  }

  private drawAttackerMarks(context: DrawContext): void {
    const ctx = context.ctx;
    const frame = context.frame;
    const level = frame.design.pad.level;
    for (let i = 0; i < frame.attackers.length; i++) {
      const unit: AttackerSnapshot = frame.attackers[i];
      const x = context.projection.screenX(unit.laneX + 0.5, unit.laneZ + 0.5);
      const head = context.projection.screenY(
        unit.laneX + 0.5,
        level + ActorPainter.ATTACKER_HEIGHT,
        unit.laneZ + 0.5
      );
      if (x < 0 || x > context.projection.widthPx) {
        // Still out in the lane, past the edge of the frame. Marked rather than dropped:
        // "nothing is in range yet" and "my guns are silent" have to look different, and the
        // view deliberately does not show all forty voxels of approach.
        ActorLayer.offScreenMarker(
          context,
          context.projection.screenY(unit.laneX + 0.5, level, unit.laneZ + 0.5),
          frame.design.pad.minZ - unit.laneZ
        );
        continue;
      }
      const width = context.projection.scale * 0.8;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x - width * 0.5, head - 8, width, 3);
      ctx.fillStyle = Palette.good;
      ctx.fillRect(x - width * 0.5, head - 8, width * unit.hpFraction, 3);
      if (unit.focused) {
        ctx.strokeStyle = Palette.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, head - 14, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  }

  /** An arrow at the frame edge with how far out the nearest unit still is. */
  private static offScreenMarker(context: DrawContext, groundY: number, distance: number): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    ctx.fillStyle = "rgba(216,83,79,0.85)";
    ctx.beginPath();
    ctx.moveTo(4, groundY - scale * 0.55);
    ctx.lineTo(4 + scale * 0.4, groundY - scale * 0.95);
    ctx.lineTo(4 + scale * 0.4, groundY - scale * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(216,140,138,0.9)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(distance.toFixed(0) + " out", 6 + scale * 0.45, groundY - scale * 0.45);
  }

  private drawStationMarks(context: DrawContext): void {
    const ctx = context.ctx;
    const frame = context.frame;
    const blueprint = frame.design.blueprint;
    for (let i = 0; i < frame.stations.length; i++) {
      const station: StationSnapshot = frame.stations[i];
      const position = blueprint.blockAt(station.block).position;
      const top = context.projection.screenY(position.x + 0.5, position.y + 1, position.z + 0.5);
      const centre = CellSilhouette.centreX(context, position.x, position.z);

      // The rack, as a row of pips over the gun. Watching it empty is how burst-and-lull is
      // read, and it is worth reading in every section: a dry gun three sections back is
      // still a dry gun.
      if (context.projection.scale >= 12) {
        const pips = station.rackRounds < 6 ? station.rackRounds : 6;
        for (let p = 0; p < pips; p++) {
          ctx.fillStyle = Palette.warning;
          ctx.fillRect(centre - 9 + p * 3, top - 4, 2, 4);
        }
      }

      if (isLoudStatus(station.status) || station.status === StationStatus.Unmanned) {
        ActorLayer.drawStatusBadge(context, station, centre, top);
      }
    }
  }

  /** The loud treatment: a ring around the cell and a label above it. */
  private static drawStatusBadge(
    context: DrawContext,
    station: StationSnapshot,
    centreX: number,
    top: number
  ): void {
    const ctx = context.ctx;
    const blueprint = context.frame.design.blueprint;
    const position = blueprint.blockAt(station.block).position;
    const loud = isLoudStatus(station.status);
    const colour = loud ? Palette.danger : Palette.warning;
    CellSilhouette.trace(context, position.x, position.y, position.z);
    ctx.strokeStyle = colour;
    ctx.lineWidth = loud ? 3 : 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    if (!loud) {
      return;
    }
    ctx.font = "bold 10px ui-monospace, monospace";
    const label = stationStatusName(station.status).toUpperCase();
    const width = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(20,10,10,0.85)";
    ctx.fillRect(centreX - width * 0.5 - 3, top - 24, width + 6, 13);
    ctx.fillStyle = colour;
    ctx.fillText(label, centreX - width * 0.5, top - 14);
  }
}
