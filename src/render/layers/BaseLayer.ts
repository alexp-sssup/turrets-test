import { IVec3 } from "../../core/IVec3";
import { BlockKind } from "../../blueprint/BlockKind";
import { FieldFrame } from "../FieldFrame";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";

/**
 * The layer that always draws: the pad, the lane, and every cell's material, damage and
 * ignition (UI spec 4, overlay 1).
 *
 * Cells outside the drawn cross-section are ghosted rather than hidden. A tester needs to
 * know that the wall they are looking through has three more of itself behind it, and a
 * ghost costs nothing to read; hiding them would make a 5-wide turret look 1-wide.
 */
export class BaseLayer implements Layer {
  public readonly id: string = "base";

  public draw(context: DrawContext): void {
    this.drawGround(context);
    this.drawGhostSlices(context);
    this.drawSliceCells(context);
    this.drawInspection(context);
  }

  private drawGround(context: DrawContext): void {
    const ctx = context.ctx;
    const projection = context.projection;
    const design = context.frame.design;
    const bounds = design.viewBounds;
    const scale = projection.scale;

    ctx.fillStyle = Palette.sky;
    ctx.fillRect(0, 0, projection.widthPx, projection.heightPx);

    // The ground line the lane and the pad both sit on.
    const groundY = projection.screenY(design.pad.level - 1);
    ctx.fillStyle = Palette.background;
    ctx.fillRect(0, groundY, projection.widthPx, projection.heightPx - groundY);

    // The marked pad: the footprint the turret is allowed to stand on (spec 2).
    const padLeft = projection.screenX(design.pad.minZ);
    const padRight = projection.screenX(design.pad.maxZ + 1);
    ctx.fillStyle = Palette.pad;
    ctx.fillRect(padLeft, groundY, padRight - padLeft, scale * 0.35);
    ctx.strokeStyle = Palette.padLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(groundY) + 0.5);
    ctx.lineTo(projection.widthPx, Math.round(groundY) + 0.5);
    ctx.stroke();

    // A faint voxel grid, so a tester can count reach without measuring pixels.
    if (scale >= 12) {
      ctx.strokeStyle = Palette.grid;
      ctx.beginPath();
      for (let z = bounds.min.z; z <= bounds.min.z + bounds.size.z; z++) {
        const x = Math.round(projection.screenX(z)) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, groundY);
      }
      for (let y = design.pad.level; y <= bounds.min.y + bounds.size.y; y++) {
        const screenY = Math.round(projection.screenY(y - 1)) + 0.5;
        ctx.moveTo(0, screenY);
        ctx.lineTo(projection.widthPx, screenY);
      }
      ctx.stroke();
    }

    // The lane marker: where the attacker walks and how far the gun reaches.
    const rangeEdge = projection.screenX(design.pad.minZ - design.gun.range);
    ctx.strokeStyle = "rgba(95,178,255,0.25)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(rangeEdge) + 0.5, 0);
    ctx.lineTo(Math.round(rangeEdge) + 0.5, groundY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = Palette.textDim;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("gun range", rangeEdge + 4, 12);
  }

  /** Blocks in the other cross-sections, so the slice is read as a slice. */
  private drawGhostSlices(context: DrawContext): void {
    const ctx = context.ctx;
    const frame = context.frame;
    const blueprint = frame.design.blueprint;
    const scale = context.projection.scale;
    ctx.fillStyle = Palette.ghost;
    for (let i = 0; i < blueprint.blockCount; i++) {
      if (!frame.isAlive(i)) {
        continue;
      }
      const position = blueprint.blockAt(i).position;
      if (position.x === context.view.slice) {
        continue;
      }
      const x = context.projection.screenX(position.z);
      const y = context.projection.screenY(position.y);
      ctx.fillRect(x + 2, y + 2, scale - 4, scale - 4);
    }
  }

  private drawSliceCells(context: DrawContext): void {
    const ctx = context.ctx;
    const frame = context.frame;
    const blueprint = frame.design.blueprint;
    const scale = context.projection.scale;

    for (let i = 0; i < blueprint.blockCount; i++) {
      const block = blueprint.blockAt(i);
      if (block.position.x !== context.view.slice) {
        continue;
      }
      const x = context.projection.screenX(block.position.z);
      const y = context.projection.screenY(block.position.y);

      if (!frame.isAlive(i)) {
        // A hole where a block used to be. Drawn, because "what did I lose" is the first
        // question the replay has to answer.
        ctx.strokeStyle = "rgba(255,92,92,0.30)";
        ctx.setLineDash([2, 3]);
        ctx.strokeRect(x + 1.5, y + 1.5, scale - 3, scale - 3);
        ctx.setLineDash([]);
        continue;
      }

      const burning = frame.isBurning(i);
      const damage = frame.damageFraction(i);
      ctx.fillStyle = burning ? Palette.fireFill(damage) : Palette.materialFill(block.material);
      ctx.fillRect(x + 1, y + 1, scale - 2, scale - 2);

      // Damage darkens the cell rather than recolouring it, so material stays readable
      // right up to the point the block dies.
      if (damage > 0) {
        ctx.fillStyle = "rgba(0,0,0," + (damage * 0.55).toFixed(3) + ")";
        ctx.fillRect(x + 1, y + 1, scale - 2, scale - 2);
      }

      ctx.strokeStyle = Palette.materialEdge(block.material);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, scale - 3, scale - 3);

      if (block.kind !== BlockKind.Structural) {
        BaseLayer.drawKindBadge(context, block.kind, i, x, y, scale);
      }
      if (burning) {
        ctx.fillStyle = "rgba(255,220,120,0.85)";
        ctx.fillRect(x + scale * 0.5 - 1, y + 2, 2, scale * 0.3);
      }
    }
  }

  private static drawKindBadge(
    context: DrawContext,
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

  private drawInspection(context: DrawContext): void {
    const ctx = context.ctx;
    const hover = context.view.hover;
    if (hover !== null) {
      BaseLayer.outline(context, hover, "rgba(219,228,240,0.35)", 1);
    }
    const selected = context.view.selected;
    if (selected !== null) {
      BaseLayer.outline(context, selected, Palette.accent, 2);
    }
    if (context.view.hasJointHighlight) {
      BaseLayer.drawJointHighlight(context);
    }
    ctx.lineWidth = 1;
  }

  private static outline(context: DrawContext, cell: IVec3, colour: string, width: number): void {
    const ctx = context.ctx;
    const scale = context.projection.scale;
    const x = context.projection.screenX(cell.z);
    const y = context.projection.screenY(cell.y);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.strokeRect(x + 0.5, y + 0.5, scale - 1, scale - 1);
  }

  /**
   * The joint the replay is pointing at. Drawn on the base layer rather than in the stress
   * overlay because it is the answer the tester came for (UI spec 3.3) and it must not
   * disappear when they switch overlays to go looking for context.
   */
  private static drawJointHighlight(context: DrawContext): void {
    const ctx = context.ctx;
    const frame = context.frame;
    const low = context.view.highlightJointLow;
    const high = context.view.highlightJointHigh;
    const blueprint = frame.design.blueprint;
    const scale = context.projection.scale;

    const highPosition = blueprint.blockAt(high).position;
    let midZ = highPosition.z;
    let midY = highPosition.y;
    if (low >= 0) {
      const lowPosition = blueprint.blockAt(low).position;
      midZ = (lowPosition.z + highPosition.z) * 0.5;
      midY = (lowPosition.y + highPosition.y) * 0.5;
    } else {
      midY = highPosition.y - 0.5;
    }
    const x = context.projection.screenX(midZ) + scale * 0.5;
    const y = context.projection.screenY(midY) + scale * 0.5;
    ctx.strokeStyle = Palette.danger;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, scale * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, scale * 0.9, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,92,92,0.4)";
    ctx.stroke();
    ctx.fillStyle = Palette.danger;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("first failure", x + scale, y - scale * 0.6);
  }

  /** True when a cell holds a live block in the drawn cross-section. */
  public static liveBlockAt(frame: FieldFrame, cell: IVec3): number {
    const index = frame.design.blueprint.indexAt(cell);
    if (index < 0) {
      return -1;
    }
    return frame.isAlive(index) ? index : -1;
  }
}
