import { DrawContext } from "./Layer";
import { IsoProjection } from "./IsoProjection";

/**
 * The outline of one cell, as a path (isometric renderer spec 3).
 *
 * A unit cube projects to the same hexagon wherever it stands -- the projection is affine
 * and every cell is the same size -- so a silhouette is six constant pixel offsets from one
 * corner and costs no geometry per cell. Holes, hover, selection and the predict overlay's
 * losses all want that shape and none of them wants a face, so it lives here rather than in
 * the painter and is available to any layer without a yaw's face table.
 *
 * Leaves the path current and stroke-ready; the caller decides fill, stroke and dash.
 */
export class CellSilhouette {
  public static trace(context: DrawContext, x: number, y: number, z: number): void {
    const projection = context.projection;
    const ctx = context.ctx;
    if (!projection.isIso) {
      const scale = projection.scale;
      ctx.beginPath();
      ctx.rect(projection.screenX(x, z) + 1, projection.screenY(x, y, z) + 1, scale - 2, scale - 2);
      return;
    }
    const iso = projection.iso;
    const anchorX = iso.anchorX(x, z);
    const anchorY = iso.anchorY(x, y, z);
    ctx.beginPath();
    for (let corner = 0; corner < IsoProjection.HEX_CORNERS; corner++) {
      const px = anchorX + iso.hexOffsetX(corner);
      const py = anchorY + iso.hexOffsetY(corner);
      if (corner === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
  }

  /** The centre of a cell on screen: where a glyph or a label anchors. */
  public static centreX(context: DrawContext, x: number, z: number): number {
    return context.projection.screenX(x + 0.5, z + 0.5);
  }

  public static centreY(context: DrawContext, x: number, y: number, z: number): number {
    return context.projection.screenY(x + 0.5, y + 0.5, z + 0.5);
  }
}
