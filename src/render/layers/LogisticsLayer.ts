import { Path } from "../../path/Path";
import { StationSnapshot, StationStatus } from "../FieldFrame";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";
import { OverlayMode, overlayName } from "../ViewState";

/**
 * Station-to-depot routes, round-trip times and runners on the move.
 *
 * The resupply model of the prototype spec 4.3 only earns its cost if a tester can watch a
 * runner walk a corridor and then watch that corridor get cut. In the isometric view the
 * route is drawn as the three-dimensional thing it is: a leg that steps sideways in x goes
 * visibly round the back of a wall instead of becoming a dashed stub in a cross-section
 * that cannot hold it (isometric renderer spec 1).
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
    const anchorX = context.projection.screenX(stationPosition.x + 0.5, stationPosition.z + 0.5);
    const anchorY = context.projection.screenY(
      stationPosition.x + 0.5,
      stationPosition.y + 0.5,
      stationPosition.z + 0.5
    );

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
    const projection = context.projection;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    for (let i = 0; i + 1 < path.cellCount; i++) {
      const from = path.cellAt(i);
      const to = path.cellAt(i + 1);
      // A leg is a leg wherever it runs: the projection has a place for every cell, so no
      // part of a route needs the apology a dashed line used to make for it (no-sections
      // spec 2.4).
      ctx.strokeStyle = "rgba(255,209,102,0.9)";
      ctx.beginPath();
      ctx.moveTo(
        projection.screenX(from.x + 0.5, from.z + 0.5),
        projection.screenY(from.x + 0.5, from.y + 0.5, from.z + 0.5)
      );
      ctx.lineTo(
        projection.screenX(to.x + 0.5, to.z + 0.5),
        projection.screenY(to.x + 0.5, to.y + 0.5, to.z + 0.5)
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    const end = path.end;
    ctx.fillStyle = Palette.warning;
    ctx.beginPath();
    ctx.arc(
      projection.screenX(end.x + 0.5, end.z + 0.5),
      projection.screenY(end.x + 0.5, end.y + 0.5, end.z + 0.5),
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
      const centreX = context.projection.screenX(position.x + 0.5, position.z + 0.5);
      const top = context.projection.screenY(position.x + 0.5, position.y + 1, position.z + 0.5);

      // Fill level as a bar over the block, and the cook-off radius as a ring on the block's
      // own level when a neighbour is inside it: "depot dispersal is two-sided" made visible.
      const width = scale * 1.2;
      ctx.fillStyle = "rgba(12,16,22,0.8)";
      ctx.fillRect(centreX - width * 0.5, top - 10, width, 6);
      ctx.fillStyle = Palette.warning;
      ctx.fillRect(centreX - width * 0.5, top - 10, width * depot.fillFraction, 6);
      if (depot.chainDistance <= 1) {
        const centreY = context.projection.screenY(
          position.x + 0.5,
          position.y + 0.5,
          position.z + 0.5
        );
        ctx.strokeStyle = Palette.danger;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.ellipse(centreX, centreY, scale * 2.2, scale * 1.1, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
  }
}
