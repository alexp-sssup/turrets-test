import { Path } from "../../path/Path";
import { StationSnapshot, StationStatus } from "../FieldFrame";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";
import { OverlayMode, overlayName } from "../ViewState";

/**
 * Station-to-depot routes, round-trip times and runners on the move.
 *
 * This overlay is the reason the 2D cross-section pays for itself (UI spec 2): the resupply
 * model only earns its cost if a tester can watch a runner walk a corridor and then watch
 * that corridor get cut. In this projection that is the default view -- no cutaway mode, no
 * transparency, no camera to learn.
 *
 * The route drawn is the one the pathfinder actually returned and the one the round-trip
 * time was costed from, not an illustration of it. When a station has no route the line is
 * replaced by the reason.
 */
export class LogisticsLayer implements Layer {
  public readonly id: string = overlayName(OverlayMode.Logistics);

  public draw(context: DrawContext): void {
    const frame = context.frame;
    for (let i = 0; i < frame.stations.length; i++) {
      this.drawStationRoute(context, frame.stations[i]);
    }
    this.drawDepots(context);
  }

  private drawStationRoute(context: DrawContext, station: StationSnapshot): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const blueprint = context.frame.design.blueprint;
    const stationPosition = blueprint.blockAt(station.block).position;
    const anchorX = context.projection.screenX(stationPosition.z) + scale * 0.5;
    const anchorY = context.projection.screenY(stationPosition.y) + scale * 0.5;

    const path = station.depotPath;
    if (path === null || station.status === StationStatus.NoPath) {
      ctx.fillStyle = Palette.danger;
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillText("no route to a depot", anchorX + scale * 0.6, anchorY);
      ctx.beginPath();
      ctx.strokeStyle = Palette.danger;
      ctx.lineWidth = 2;
      ctx.moveTo(anchorX - scale * 0.35, anchorY - scale * 0.35);
      ctx.lineTo(anchorX + scale * 0.35, anchorY + scale * 0.35);
      ctx.stroke();
      ctx.lineWidth = 1;
      return;
    }

    LogisticsLayer.drawPath(context, path);

    // Round-trip time, at the station end of the route. UI spec 3.1 makes this mandatory
    // editor support: discovering haul cost at runtime would violate the whole premise.
    const label = Number.isFinite(station.roundTripSeconds)
      ? station.roundTripSeconds.toFixed(1) + "s round trip"
      : "unreachable";
    ctx.font = "10px ui-monospace, monospace";
    const width = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(12,16,22,0.85)";
    ctx.fillRect(anchorX + scale * 0.5, anchorY - 16, width + 8, 14);
    ctx.fillStyle = Palette.text;
    ctx.fillText(label, anchorX + scale * 0.5 + 4, anchorY - 5);
  }

  private static drawPath(context: DrawContext, path: Path): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const slice = context.view.slice;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    for (let i = 0; i + 1 < path.cellCount; i++) {
      const from = path.cellAt(i);
      const to = path.cellAt(i + 1);
      const onSlice = from.x === slice && to.x === slice;
      // A leg that leaves the drawn cross-section is dashed: the corridor is real, it just
      // is not in this slice, and pretending otherwise would misreport the route's shape.
      ctx.strokeStyle = onSlice ? "rgba(255,209,102,0.9)" : "rgba(255,209,102,0.35)";
      ctx.setLineDash(onSlice ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(
        context.projection.screenX(from.z) + scale * 0.5,
        context.projection.screenY(from.y) + scale * 0.5
      );
      ctx.lineTo(
        context.projection.screenX(to.z) + scale * 0.5,
        context.projection.screenY(to.y) + scale * 0.5
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    const end = path.end;
    ctx.fillStyle = Palette.warning;
    ctx.beginPath();
    ctx.arc(
      context.projection.screenX(end.z) + scale * 0.5,
      context.projection.screenY(end.y) + scale * 0.5,
      3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  private drawDepots(context: DrawContext): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const frame = context.frame;
    const blueprint = frame.design.blueprint;
    for (let i = 0; i < frame.depots.length; i++) {
      const depot = frame.depots[i];
      const position = blueprint.blockAt(depot.block).position;
      const x = context.projection.screenX(position.z);
      const y = context.projection.screenY(position.y);
      const onSlice = position.x === context.view.slice;
      ctx.globalAlpha = onSlice ? 1 : 0.35;

      // Fill level as a bar, and the cook-off radius as a ring when a neighbour is inside
      // it: "depot dispersal is two-sided" made visible.
      ctx.fillStyle = "rgba(12,16,22,0.8)";
      ctx.fillRect(x, y - 8, scale, 6);
      ctx.fillStyle = Palette.warning;
      ctx.fillRect(x, y - 8, scale * depot.fillFraction, 6);
      if (depot.chainDistance <= 1) {
        ctx.strokeStyle = Palette.danger;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(x + scale * 0.5, y + scale * 0.5, scale * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
  }
}
