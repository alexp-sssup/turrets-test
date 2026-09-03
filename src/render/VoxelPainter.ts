import { BlockKind } from "../blueprint/BlockKind";
import { MaterialId } from "../materials/MaterialId";
import { CellPresence } from "./CellPresence";
import { CellSilhouette } from "./CellSilhouette";
import { FacePalette } from "./FacePalette";
import { DrawContext } from "./Layer";
import { Palette } from "./Palette";
import { SectionCue } from "./SectionCue";
import { ViewFacing } from "./ViewFacing";
import { VoxelFace } from "./VoxelFace";
import { VoxelFaces } from "./VoxelFaces";

/**
 * One voxel, drawn as a cube (isometric renderer spec 3).
 *
 * Three faces, flat-shaded, no texture and no gradient: the top and the two whose normals
 * point toward the camera, each drawn only where the neighbour it would run into is absent.
 * The shade is fixed to the **screen** rather than to the world, so a quarter turn never
 * changes which side of a turret is bright -- a depth cue that changed meaning when the
 * tester pressed a key would not be a cue.
 *
 * The edge rule of spec 3.1 is the one that decides whether a wall reads as a wall: a 1 px
 * darker edge is stroked only along a silhouette or a crease, never along the seam between
 * two coplanar faces. Stroking every cell -- which is what the flat view did -- turns a
 * solid wall into a grid of boxes, so the tester reads texture where there is form.
 */
export class VoxelPainter {
  private readonly facing: ViewFacing;
  private readonly fills: FacePalette;
  /** Scratch for one face's projected corners. Reused, so a cell allocates nothing. */
  private readonly quadX: Float64Array;
  private readonly quadY: Float64Array;

  public constructor(facing: ViewFacing) {
    this.facing = facing;
    this.fills = new FacePalette(facing);
    this.quadX = new Float64Array(VoxelFace.CORNER_COUNT);
    this.quadY = new Float64Array(VoxelFace.CORNER_COUNT);
  }

  /** A solid cell: its faces, its damage, its fire and its kind. */
  public paintSolid(
    context: DrawContext,
    cells: CellPresence,
    cue: SectionCue,
    block: number,
    x: number,
    y: number,
    z: number
  ): void {
    const frame = context.frame;
    const detail = frame.design.blueprint.blockAt(block);
    const burning = frame.isBurning(block);
    const damage = frame.damageFraction(block);
    const ctx = context.ctx;

    for (let index = 0; index < this.facing.count; index++) {
      const face = this.facing.at(index);
      if (!VoxelFaces.isDrawn(cells, face, x, y, z)) {
        continue;
      }
      this.project(context, face, x, y, z);
      ctx.fillStyle = burning
        ? Palette.dimmed(Palette.fireHex(damage), face.shade, cue.dim)
        : this.fills.fill(detail.material, index, cue.dimIndex, damage);
      this.fillQuad(ctx);
      if (context.detail.edges) {
        this.strokeCreases(context, cells, face, x, y, z);
      }
    }

    if (detail.kind !== BlockKind.Structural) {
      this.paintKind(context, cells, cue, detail.kind, block, x, y, z);
    }
  }

  /**
   * A peeled cell: the wall between the camera and the build plane, shown as cut away
   * rather than deleted (spec 6). Silhouette and creases only, never a fill.
   */
  public paintWireframe(
    context: DrawContext,
    cells: CellPresence,
    cue: SectionCue,
    kind: BlockKind,
    x: number,
    y: number,
    z: number
  ): void {
    const ctx = context.ctx;
    ctx.globalAlpha = cue.alpha;
    ctx.strokeStyle = kind === BlockKind.Structural ? Palette.peelEdge : Palette.kindColour(kind);
    ctx.lineWidth = 1;
    for (let index = 0; index < this.facing.count; index++) {
      const face = this.facing.at(index);
      if (!VoxelFaces.isDrawn(cells, face, x, y, z)) {
        continue;
      }
      this.project(context, face, x, y, z);
      for (let edge = 0; edge < VoxelFace.CORNER_COUNT; edge++) {
        if (!VoxelFaces.isEdgeStroked(cells, face, x, y, z, edge)) {
          continue;
        }
        this.strokeEdge(ctx, edge);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The flat dev view's ghost (spec 9): one neutral fill for every section but the one being
   * worked in, because in that projection they all land in the same place and depth cannot
   * mean anything.
   */
  public paintGhost(context: DrawContext, x: number, y: number, z: number): void {
    CellSilhouette.trace(context, x, y, z);
    context.ctx.fillStyle = Palette.ghost;
    context.ctx.fill();
  }

  /**
   * A hole where a block used to be, in the build plane only.
   *
   * "What did I lose" is the first question the replay has to answer, and it is a question
   * about the section the tester is reading. Holes in every section at once would be a
   * picture of the whole run's damage rather than of one cross-section's.
   */
  public paintHole(context: DrawContext, x: number, y: number, z: number): void {
    const ctx = context.ctx;
    CellSilhouette.trace(context, x, y, z);
    ctx.strokeStyle = "rgba(255,92,92,0.30)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private project(
    context: DrawContext,
    face: VoxelFace,
    x: number,
    y: number,
    z: number
  ): void {
    const projection = context.projection;
    for (let corner = 0; corner < VoxelFace.CORNER_COUNT; corner++) {
      const cx = x + face.cornerX(corner);
      const cy = y + face.cornerY(corner);
      const cz = z + face.cornerZ(corner);
      this.quadX[corner] = projection.screenX(cx, cz);
      this.quadY[corner] = projection.screenY(cx, cy, cz);
    }
  }

  private fillQuad(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(this.quadX[0], this.quadY[0]);
    for (let corner = 1; corner < VoxelFace.CORNER_COUNT; corner++) {
      ctx.lineTo(this.quadX[corner], this.quadY[corner]);
    }
    ctx.closePath();
    ctx.fill();
  }

  private strokeCreases(
    context: DrawContext,
    cells: CellPresence,
    face: VoxelFace,
    x: number,
    y: number,
    z: number
  ): void {
    const ctx = context.ctx;
    ctx.strokeStyle = Palette.voxelEdge;
    ctx.lineWidth = 1;
    for (let edge = 0; edge < VoxelFace.CORNER_COUNT; edge++) {
      if (!VoxelFaces.isEdgeStroked(cells, face, x, y, z, edge)) {
        continue;
      }
      this.strokeEdge(ctx, edge);
    }
  }

  private strokeEdge(ctx: CanvasRenderingContext2D, edge: number): void {
    const next = (edge + 1) % VoxelFace.CORNER_COUNT;
    ctx.beginPath();
    ctx.moveTo(this.quadX[edge], this.quadY[edge]);
    ctx.lineTo(this.quadX[next], this.quadY[next]);
    ctx.stroke();
  }

  /**
   * The kind badge: a ring on the top face in every solid section, the glyph only in the
   * build plane (spec 3.2).
   *
   * A depot two sections back is worth knowing about -- that is the interior read the
   * projection exists for -- but its glyph behind a wall is noise.
   */
  private paintKind(
    context: DrawContext,
    cells: CellPresence,
    cue: SectionCue,
    kind: BlockKind,
    block: number,
    x: number,
    y: number,
    z: number
  ): void {
    const ctx = context.ctx;
    const projection = context.projection;
    const top = this.facing.top;
    if (VoxelFaces.isDrawn(cells, top, x, y, z)) {
      this.project(context, top, x, y, z);
      ctx.strokeStyle = Palette.kindColour(kind);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.quadX[0], this.quadY[0]);
      for (let corner = 1; corner < VoxelFace.CORNER_COUNT; corner++) {
        ctx.lineTo(this.quadX[corner], this.quadY[corner]);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (!cue.detail) {
      return;
    }
    const centreX = projection.screenX(x + 0.5, z + 0.5);
    const centreY = projection.screenY(x + 0.5, y + 0.5, z + 0.5);
    if (projection.scale >= 12) {
      ctx.fillStyle = Palette.kindColour(kind);
      ctx.font = Math.round(projection.scale * 0.8).toString() + "px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(Palette.kindGlyph(kind), centreX, centreY);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    const depot = context.frame.depotAt(block);
    if (kind === BlockKind.Depot && depot !== null && depot.fillFraction > 0) {
      // A depot that is nearly full is worth flagging on the base layer: it is the one block
      // whose contents can end the run.
      const height = projection.scale * depot.fillFraction;
      ctx.fillStyle = "rgba(255,180,58,0.75)";
      ctx.fillRect(centreX - 2, centreY + projection.scale * 0.5 - height, 4, height);
    }
  }
}
