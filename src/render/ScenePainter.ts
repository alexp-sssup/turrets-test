import { DrawContext } from "./Layer";
import { Palette } from "./Palette";

/**
 * The scene the turret stands in (isometric renderer spec 7).
 *
 * A solid turret standing on nothing still reads as a diagram, and a 2:1 projection has no
 * perspective to fall back on, so every mark here is load-bearing for depth perception
 * rather than decorative:
 *
 * * **The ground**, tiled in four-voxel blocks with an accent on the same interval, so
 *   distance along the lane is countable without measuring pixels. This is a grid *on the
 *   ground*, which the flat view's screen-space grid was not.
 * * **The pad**, as the marked area the turret is allowed to stand on rather than a band.
 * * **The gun-range marker on the ground**, across the lane, because a range limit lives on
 *   the ground and "nothing is in range yet" has to stay distinguishable from "my gun is
 *   silent".
 */
export class ScenePainter {
  /** How far the ground reaches past the world box, so the pad is not on a ribbon. */
  public static readonly GROUND_MARGIN_X: number = 4;
  public static readonly GROUND_MARGIN_Z: number = 2;
  /** Tile size, in voxels. Also the accent interval. */
  public static readonly TILE: number = 4;

  public static paint(context: DrawContext): void {
    const ctx = context.ctx;
    ctx.fillStyle = Palette.sky;
    ctx.fillRect(0, 0, context.projection.widthPx, context.projection.heightPx);
    ScenePainter.paintGround(context);
    ScenePainter.paintPad(context);
    ScenePainter.paintRange(context);
  }

  /** One horizontal quad, in world coordinates, at `level`. */
  private static quad(
    context: DrawContext,
    level: number,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number
  ): void {
    const projection = context.projection;
    const ctx = context.ctx;
    ctx.beginPath();
    ctx.moveTo(projection.screenX(minX, minZ), projection.screenY(minX, level, minZ));
    ctx.lineTo(projection.screenX(maxX, minZ), projection.screenY(maxX, level, minZ));
    ctx.lineTo(projection.screenX(maxX, maxZ), projection.screenY(maxX, level, maxZ));
    ctx.lineTo(projection.screenX(minX, maxZ), projection.screenY(minX, level, maxZ));
    ctx.closePath();
  }

  private static paintGround(context: DrawContext): void {
    const ctx = context.ctx;
    const design = context.frame.design;
    const bounds = design.viewBounds;
    const level = design.pad.level;
    const minX = bounds.min.x - ScenePainter.GROUND_MARGIN_X;
    const maxX = bounds.min.x + bounds.size.x + ScenePainter.GROUND_MARGIN_X;
    // The ground runs the whole lane, not just the framed part of it. The view box stops a
    // few voxels beyond gun range on purpose (`FieldDesign`), but an attacker still walking
    // in from the spawn point has to be standing on something: a unit drawn over the sky is
    // a unit at an unknown distance, which is the one thing spec 7.3 will not have.
    const spawn = design.arena.spawnZ;
    const laneStart = spawn < bounds.min.z ? spawn : bounds.min.z;
    const minZ = laneStart - ScenePainter.GROUND_MARGIN_Z;
    const maxZ = bounds.min.z + bounds.size.z + ScenePainter.GROUND_MARGIN_Z;

    ScenePainter.quad(context, level, minX, minZ, maxX, maxZ);
    ctx.fillStyle = Palette.groundTile;
    ctx.fill();

    if (!context.detail.groundDetail) {
      // Spec 8's degradation order: the tiles and their accents are the second thing to go.
      return;
    }

    // The tiling: every other four-voxel block in the second shade, so the plane has a
    // texture with a known size rather than a flat colour with no scale.
    const tile = ScenePainter.TILE;
    const firstX = Math.floor(minX / tile) * tile;
    const firstZ = Math.floor(minZ / tile) * tile;
    ctx.fillStyle = Palette.groundTileAlt;
    for (let x = firstX; x < maxX; x += tile) {
      for (let z = firstZ; z < maxZ; z += tile) {
        if (((Math.floor(x / tile) + Math.floor(z / tile)) & 1) === 0) {
          continue;
        }
        const lowX = x < minX ? minX : x;
        const lowZ = z < minZ ? minZ : z;
        const highX = x + tile > maxX ? maxX : x + tile;
        const highZ = z + tile > maxZ ? maxZ : z + tile;
        ScenePainter.quad(context, level, lowX, lowZ, highX, highZ);
        ctx.fill();
      }
    }

    ctx.strokeStyle = Palette.groundAccent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = firstX; x <= maxX; x += tile) {
      ctx.moveTo(context.projection.screenX(x, minZ), context.projection.screenY(x, level, minZ));
      ctx.lineTo(context.projection.screenX(x, maxZ), context.projection.screenY(x, level, maxZ));
    }
    for (let z = firstZ; z <= maxZ; z += tile) {
      ctx.moveTo(context.projection.screenX(minX, z), context.projection.screenY(minX, level, z));
      ctx.lineTo(context.projection.screenX(maxX, z), context.projection.screenY(maxX, level, z));
    }
    ctx.stroke();
  }

  private static paintPad(context: DrawContext): void {
    const ctx = context.ctx;
    const pad = context.frame.design.pad;
    ScenePainter.quad(context, pad.level, pad.minX, pad.minZ, pad.maxX + 1, pad.maxZ + 1);
    ctx.fillStyle = Palette.pad;
    ctx.fill();
    ctx.strokeStyle = Palette.padLine;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private static paintRange(context: DrawContext): void {
    const ctx = context.ctx;
    const design = context.frame.design;
    const pad = design.pad;
    const edge = pad.minZ - design.gun.range;
    const minX = pad.minX - ScenePainter.GROUND_MARGIN_X;
    const maxX = pad.maxX + 1 + ScenePainter.GROUND_MARGIN_X;
    const projection = context.projection;
    ctx.strokeStyle = "rgba(95,178,255,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(projection.screenX(minX, edge), projection.screenY(minX, pad.level, edge));
    ctx.lineTo(projection.screenX(maxX, edge), projection.screenY(maxX, pad.level, edge));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.fillStyle = Palette.textDim;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(
      "gun range",
      projection.screenX(maxX, edge) + 4,
      projection.screenY(maxX, pad.level, edge)
    );
  }
}
