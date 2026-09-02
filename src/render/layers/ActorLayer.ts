import { AttackerSnapshot, CrewSnapshot, StationSnapshot, StationStatus, isLoudStatus, stationStatusName } from "../FieldFrame";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";

/**
 * Everything that moves: attackers on the lane, crew in the corridors, muzzle flashes, and
 * the station status lights.
 *
 * Part of the always-drawn base composition rather than an overlay, because the Run screen
 * has one job -- make it obvious why a gun is silent -- and UI spec 3.2 says dry and
 * no-path get the loudest treatment in the whole build. A tester who does not notice a
 * silent gun reads the game as cheating, which is the exact failure mode the metrics cannot
 * recover from.
 */
export class ActorLayer implements Layer {
  public readonly id: string = "base";

  public draw(context: DrawContext): void {
    this.drawAttackers(context);
    this.drawStations(context);
    this.drawCrew(context);
  }

  private drawAttackers(context: DrawContext): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const attackers = context.frame.attackers;
    for (let i = 0; i < attackers.length; i++) {
      const unit: AttackerSnapshot = attackers[i];
      const onSlice = unit.laneX === context.view.slice;
      const x = context.projection.screenX(unit.laneZ) + scale * 0.5;
      const groundY = context.projection.screenY(context.frame.design.pad.level);
      const height = scale * 1.1;
      const width = scale * 0.55;

      if (x < 0) {
        // Still out in the lane, past the left edge of the frame. Marked rather than
        // dropped: "nothing is in range yet" and "my guns are silent" have to look
        // different, and the view deliberately does not show all forty voxels of approach.
        ActorLayer.offScreenMarker(context, groundY, context.frame.design.pad.minZ - unit.laneZ);
        continue;
      }

      ctx.globalAlpha = onSlice ? 1 : 0.35;
      ctx.fillStyle = unit.engaged ? "#d8534f" : "#9c5b57";
      ctx.fillRect(x - width * 0.5, groundY - height, width, height);
      // Health as a bar over the head: a unit that is nearly dead is worth one more shot.
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x - width * 0.5, groundY - height - 6, width, 3);
      ctx.fillStyle = Palette.good;
      ctx.fillRect(x - width * 0.5, groundY - height - 6, width * unit.hpFraction, 3);
      if (unit.focused) {
        ctx.strokeStyle = Palette.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - width * 0.7, groundY - height - 10, width * 1.4, height + 14);
        ctx.lineWidth = 1;
      }
      ctx.globalAlpha = 1;
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

  private drawStations(context: DrawContext): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const frame = context.frame;
    const blueprint = frame.design.blueprint;
    for (let i = 0; i < frame.stations.length; i++) {
      const station: StationSnapshot = frame.stations[i];
      const position = blueprint.blockAt(station.block).position;
      const onSlice = position.x === context.view.slice;
      const x = context.projection.screenX(position.z);
      const y = context.projection.screenY(position.y);

      if (station.firedThisTick && onSlice) {
        // Muzzle flash, pointing the way the gun faces (-z: down the lane).
        ctx.fillStyle = "rgba(255,232,150,0.9)";
        ctx.beginPath();
        ctx.moveTo(x, y + scale * 0.5);
        ctx.lineTo(x - scale * 0.7, y + scale * 0.2);
        ctx.lineTo(x - scale * 0.7, y + scale * 0.8);
        ctx.closePath();
        ctx.fill();
      }

      // The rack, as a row of pips. Watching it empty is how burst-and-lull is read.
      if (onSlice && scale >= 16) {
        const pips = station.rackRounds < 6 ? station.rackRounds : 6;
        for (let p = 0; p < pips; p++) {
          ctx.fillStyle = Palette.warning;
          ctx.fillRect(x + 4 + p * 3, y + scale - 6, 2, 4);
        }
      }

      if (isLoudStatus(station.status) || station.status === StationStatus.Unmanned) {
        ActorLayer.drawStatusBadge(context, station, x, y, scale, onSlice);
      }
    }
  }

  /**
   * The loud treatment: a coloured ring, a label, and -- for a severed corridor -- a slash
   * through the route the runner can no longer walk.
   */
  private static drawStatusBadge(
    context: DrawContext,
    station: StationSnapshot,
    x: number,
    y: number,
    scale: number,
    onSlice: boolean
  ): void {
    const ctx = context.ctx;
    const loud = isLoudStatus(station.status);
    const colour = loud ? Palette.danger : Palette.warning;
    ctx.globalAlpha = onSlice ? 1 : 0.4;
    ctx.strokeStyle = colour;
    ctx.lineWidth = loud ? 3 : 2;
    ctx.strokeRect(x - 1, y - 1, scale + 2, scale + 2);
    if (loud) {
      ctx.fillStyle = colour;
      ctx.font = "bold 10px ui-monospace, monospace";
      const label = stationStatusName(station.status).toUpperCase();
      const width = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(20,10,10,0.85)";
      ctx.fillRect(x + scale * 0.5 - width * 0.5 - 3, y - 17, width + 6, 13);
      ctx.fillStyle = colour;
      ctx.fillText(label, x + scale * 0.5 - width * 0.5, y - 7);
    }
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
  }

  private drawCrew(context: DrawContext): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const crew = context.frame.crew;
    for (let i = 0; i < crew.length; i++) {
      const member: CrewSnapshot = crew[i];
      const onSlice = Math.round(member.x) === context.view.slice;
      const x = context.projection.screenX(member.z) + scale * 0.5;
      const y = context.projection.screenY(member.y) + scale * 0.75;
      ctx.globalAlpha = onSlice ? 1 : 0.3;
      ctx.fillStyle = Palette.crewColour(member.role);
      ctx.beginPath();
      ctx.arc(x, y, scale * 0.18, 0, Math.PI * 2);
      ctx.fill();
      if (member.carrying >= 0) {
        // A runner with a load on their back. The whole point of simulating resupply is
        // that this shape is visible walking down a corridor that can be cut.
        ctx.fillStyle = Palette.warning;
        ctx.fillRect(x - scale * 0.1, y - scale * 0.34, scale * 0.2, scale * 0.14);
      }
      ctx.globalAlpha = 1;
    }
  }
}
