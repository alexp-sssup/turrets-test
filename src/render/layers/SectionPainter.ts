import { IVec3 } from "../../core/IVec3";
import { BlockKind } from "../../blueprint/BlockKind";
import { MaterialId } from "../../materials/MaterialId";
import { DrawContext } from "../Layer";
import { Palette } from "../Palette";
import { SectionCue } from "../SectionCue";

/**
 * One cross-section's cells, drawn in the treatment its cue asks for (depth view spec 3).
 *
 * Split out of `BaseLayer` because the peel rule is the answer to the one question the
 * depth view exists to answer -- how a tester sees inside a multilayer turret -- and it is
 * worth reading on its own. `BaseLayer` decides the order and the ground; this decides what
 * a section looks like once its turn comes.
 *
 * Three treatments, and the cue picks between them:
 *
 * * **Peeled** (in front of the working plane): stroked, never filled. A wall that would
 *   hide the section being edited is cut away, but it is *shown as cut away*.
 * * **Ghosted** (the flat view's other sections): one neutral fill, because in that
 *   projection every section lands in the same place and depth cannot mean anything.
 * * **Solid**: the material, its damage and its fire, drawn as a cabinet cube whose top and
 *   side faces are shaded off the material's own colour (depth view spec 2). The active
 *   section gets the badges and pips as well; the sections behind it keep their kind rings
 *   and drop the rest, so an interior reads without competing with the working plane.
 */
export class SectionPainter {
  public static paint(context: DrawContext, cue: SectionCue): void {
    const blueprint = context.frame.design.blueprint;
    for (let i = 0; i < blueprint.blockCount; i++) {
      const block = blueprint.blockAt(i);
      if (block.position.x !== cue.sectionX) {
        continue;
      }
      if (!context.frame.isAlive(i)) {
        SectionPainter.paintHole(context, cue, block.position);
        continue;
      }
      if (cue.outline) {
        SectionPainter.paintPeeled(context, cue, block.position, block.kind);
        continue;
      }
      if (!cue.material) {
        SectionPainter.paintGhost(context, cue, block.position);
        continue;
      }
      SectionPainter.paintSolid(context, cue, i);
    }
  }

  /**
   * A hole where a block used to be, in the working plane only.
   *
   * "What did I lose" is the first question the replay has to answer, and it is a question
   * about the section the tester is reading. Holes in every section at once would be a
   * picture of the whole run's damage rather than of one cross-section's.
   */
  private static paintHole(context: DrawContext, cue: SectionCue, position: IVec3): void {
    if (!cue.active) {
      return;
    }
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const x = context.projection.screenXAt(cue.sectionX, position.z);
    const y = context.projection.screenYAt(cue.sectionX, position.y);
    ctx.strokeStyle = "rgba(255,92,92,0.30)";
    ctx.setLineDash([2, 3]);
    ctx.strokeRect(x + 1.5, y + 1.5, scale - 3, scale - 3);
    ctx.setLineDash([]);
  }

  /** The cutaway: an outline, in the kind's colour when the block has one worth keeping. */
  private static paintPeeled(
    context: DrawContext,
    cue: SectionCue,
    position: IVec3,
    kind: BlockKind
  ): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const x = context.projection.screenXAt(cue.sectionX, position.z);
    const y = context.projection.screenYAt(cue.sectionX, position.y);
    ctx.globalAlpha = cue.alpha;
    ctx.strokeStyle = kind === BlockKind.Structural ? Palette.peelEdge : Palette.kindColour(kind);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, scale - 3, scale - 3);
    ctx.globalAlpha = 1;
  }

  /** The flat view's ghost, unchanged: a 5-wide turret must not look 1-wide. */
  private static paintGhost(context: DrawContext, cue: SectionCue, position: IVec3): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const x = context.projection.screenXAt(cue.sectionX, position.z);
    const y = context.projection.screenYAt(cue.sectionX, position.y);
    ctx.fillStyle = Palette.ghost;
    ctx.fillRect(x + 2, y + 2, scale - 4, scale - 4);
  }

  private static paintSolid(context: DrawContext, cue: SectionCue, block: number): void {
    const ctx = context.ctx;
    const frame = context.frame;
    const scale = context.projection.scale;
    const detail = context.frame.design.blueprint.blockAt(block);
    const position = detail.position;
    const x = context.projection.screenXAt(cue.sectionX, position.z);
    const y = context.projection.screenYAt(cue.sectionX, position.y);
    const burning = frame.isBurning(block);
    const damage = frame.damageFraction(block);

    ctx.globalAlpha = cue.alpha;
    SectionPainter.paintFaces(context, position, detail.material, damage);

    ctx.fillStyle = burning ? Palette.fireFill(damage) : Palette.materialFill(detail.material);
    ctx.fillRect(x + 1, y + 1, scale - 2, scale - 2);

    // Damage darkens the cell rather than recolouring it, so material stays readable
    // right up to the point the block dies.
    if (damage > 0) {
      ctx.fillStyle = "rgba(0,0,0," + (damage * 0.55).toFixed(3) + ")";
      ctx.fillRect(x + 1, y + 1, scale - 2, scale - 2);
    }

    ctx.strokeStyle = Palette.materialEdge(detail.material);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, scale - 3, scale - 3);

    if (detail.kind !== BlockKind.Structural) {
      SectionPainter.paintKind(context, cue, detail.kind, block, x, y, scale);
    }
    if (burning && cue.detail) {
      ctx.fillStyle = "rgba(255,220,120,0.85)";
      ctx.fillRect(x + scale * 0.5 - 1, y + 2, 2, scale * 0.3);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The two receding faces that make a stack of sections read as a solid mass rather than
   * as a stack of cards (depth view spec 2).
   *
   * Drawn only where the neighbour they would run into is absent, so an interior wall costs
   * nothing and a silhouette costs two quads. Nothing is drawn at all in the flat view,
   * where the depth axis has no extent.
   */
  private static paintFaces(
    context: DrawContext,
    position: IVec3,
    material: MaterialId,
    damage: number
  ): void {
    const axis = context.projection.axis;
    if (axis.isFlat) {
      return;
    }
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const x = context.projection.screenXAt(position.x, position.z);
    const y = context.projection.screenYAt(position.x, position.y);
    const dx = axis.offsetX(1);
    const dy = axis.offsetY(1);

    if (SectionPainter.emptyAt(context, position.x, position.y + 1, position.z)) {
      ctx.fillStyle = Palette.topFaceFill(material);
      SectionPainter.quad(ctx, x, y, x + scale, y, x + scale + dx, y + dy, x + dx, y + dy);
      SectionPainter.darken(ctx, damage);
    }
    if (SectionPainter.emptyAt(context, position.x, position.y, position.z + 1)) {
      ctx.fillStyle = Palette.sideFaceFill(material);
      SectionPainter.quad(
        ctx,
        x + scale,
        y,
        x + scale,
        y + scale,
        x + scale + dx,
        y + scale + dy,
        x + scale + dx,
        y + dy
      );
      SectionPainter.darken(ctx, damage);
    }
  }

  private static darken(ctx: CanvasRenderingContext2D, damage: number): void {
    if (damage <= 0) {
      return;
    }
    ctx.fillStyle = "rgba(0,0,0," + (damage * 0.55).toFixed(3) + ")";
    ctx.fill();
  }

  private static quad(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  }

  /** True when no live block stands in that cell, which is when a face is visible. */
  private static emptyAt(context: DrawContext, x: number, y: number, z: number): boolean {
    const index = context.frame.design.blueprint.indexAt(new IVec3(x, y, z));
    return index < 0 || !context.frame.isAlive(index);
  }

  /**
   * The kind badge: a ring in every solid section, the glyph and the readouts only in the
   * one being worked in.
   *
   * A depot two sections back is worth knowing about -- that is the interior read the depth
   * view exists for -- but its fill bar and its glyph behind a wall are noise.
   */
  private static paintKind(
    context: DrawContext,
    cue: SectionCue,
    kind: BlockKind,
    block: number,
    x: number,
    y: number,
    scale: number
  ): void {
    const ctx = context.ctx;
    ctx.strokeStyle = Palette.kindColour(kind);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2.5, y + 2.5, scale - 5, scale - 5);
    if (!cue.detail) {
      ctx.lineWidth = 1;
      return;
    }
    if (scale >= 16) {
      ctx.fillStyle = Palette.kindColour(kind);
      ctx.font = Math.round(scale * 0.5).toString() + "px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(Palette.kindGlyph(kind), x + scale * 0.5, y + scale * 0.52);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    // A depot that is nearly full is worth flagging even on the base layer: it is the one
    // block whose contents can end the run.
    const depot = context.frame.depotAt(block);
    if (kind === BlockKind.Depot && depot !== null && depot.fillFraction > 0) {
      const height = (scale - 6) * depot.fillFraction;
      ctx.fillStyle = "rgba(255,180,58,0.55)";
      ctx.fillRect(x + 3, y + scale - 3 - height, 3, height);
    }
    ctx.lineWidth = 1;
  }
}
