import { IVec3 } from "../../core/IVec3";
import { DepthOrder } from "../DepthOrder";
import { FieldFrame } from "../FieldFrame";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";
import { SectionPainter } from "./SectionPainter";

/**
 * The layer that always draws: the pad, the lane, and every cell's material, damage and
 * ignition (UI spec 4, overlay 1).
 *
 * Cells outside the drawn cross-section are never hidden. A tester needs to know that the
 * wall they are looking through has three more of itself behind it, and hiding them would
 * make a 5-wide turret look 1-wide. What that costs differs by mode: the flat view ghosts
 * them all into the same place, and the depth view gives each section its own place and
 * applies the peel rule of depth view spec 3 -- solid and dimmed behind the working plane,
 * cut back to an outline in front of it.
 *
 * The order the sections composite in comes from `DepthOrder`; what each one looks like
 * comes from `SectionPainter`. This file is the ground, the framing and the marks that
 * belong to no section in particular.
 */
export class BaseLayer implements Layer {
  public readonly id: string = "base";

  public draw(context: DrawContext): void {
    this.drawGround(context);
    this.drawSections(context);
    this.drawInspection(context);
  }

  private drawGround(context: DrawContext): void {
    const ctx = context.ctx;
    const projection = context.projection;
    const design = context.frame.design;
    const bounds = design.viewBounds;
    const scale = projection.scale;
    const nearest = projection.axis.isFlat ? context.view.slice : design.sliceMin;

    ctx.fillStyle = Palette.sky;
    ctx.fillRect(0, 0, projection.widthPx, projection.heightPx);

    // The ground line the lane and the pad both sit on. In the depth view it is the nearest
    // section's line: nothing may appear to float, so the fill starts at the front.
    const groundY = projection.screenYAt(nearest, design.pad.level - 1);
    ctx.fillStyle = Palette.background;
    ctx.fillRect(0, groundY, projection.widthPx, projection.heightPx - groundY);
    BaseLayer.drawRecedingGround(context, nearest);

    // The marked pad: the footprint the turret is allowed to stand on (spec 2).
    BaseLayer.drawPad(context);
    ctx.strokeStyle = Palette.padLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(groundY) + 0.5);
    ctx.lineTo(projection.widthPx, Math.round(groundY) + 0.5);
    ctx.stroke();

    // A faint voxel grid, so a tester can count reach without measuring pixels. Drawn in the
    // working plane only: a grid per section would be five grids and no reference.
    if (scale >= 12) {
      const planeGroundY = projection.screenY(design.pad.level - 1);
      ctx.strokeStyle = Palette.grid;
      ctx.beginPath();
      for (let z = bounds.min.z; z <= bounds.min.z + bounds.size.z; z++) {
        const x = Math.round(projection.screenX(z)) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, planeGroundY);
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

  /**
   * The floor between the nearest section and the farthest, as one receding band.
   *
   * Without it the depth view's sections stand on nothing and the projection reads as a
   * stack of flat cards. Nothing in the flat view, where the two sections coincide.
   */
  private static drawRecedingGround(context: DrawContext, nearest: number): void {
    const projection = context.projection;
    if (projection.axis.isFlat) {
      return;
    }
    const design = context.frame.design;
    const bounds = design.viewBounds;
    const farthest = design.sliceMax + 1;
    const level = design.pad.level - 1;
    const leftZ = bounds.min.z;
    const rightZ = bounds.min.z + bounds.size.z;
    const ctx = context.ctx;
    ctx.fillStyle = Palette.groundPlane;
    ctx.beginPath();
    ctx.moveTo(projection.screenXAt(nearest, leftZ), projection.screenYAt(nearest, level));
    ctx.lineTo(projection.screenXAt(nearest, rightZ), projection.screenYAt(nearest, level));
    ctx.lineTo(projection.screenXAt(farthest, rightZ), projection.screenYAt(farthest, level));
    ctx.lineTo(projection.screenXAt(farthest, leftZ), projection.screenYAt(farthest, level));
    ctx.closePath();
    ctx.fill();
  }

  /** The pad, as the parallelogram its footprint projects to. A rectangle in the flat view. */
  private static drawPad(context: DrawContext): void {
    const projection = context.projection;
    const design = context.frame.design;
    const ctx = context.ctx;
    const near = projection.axis.isFlat ? context.view.slice : design.pad.minX;
    const far = projection.axis.isFlat ? context.view.slice : design.pad.maxX + 1;
    const level = design.pad.level - 1;
    const depthPx = projection.axis.isFlat ? projection.scale * 0.35 : 0;
    const leftZ = design.pad.minZ;
    const rightZ = design.pad.maxZ + 1;
    ctx.fillStyle = Palette.pad;
    ctx.beginPath();
    ctx.moveTo(projection.screenXAt(near, leftZ), projection.screenYAt(near, level) + depthPx);
    ctx.lineTo(projection.screenXAt(near, rightZ), projection.screenYAt(near, level) + depthPx);
    ctx.lineTo(projection.screenXAt(far, rightZ), projection.screenYAt(far, level));
    ctx.lineTo(projection.screenXAt(far, leftZ), projection.screenYAt(far, level));
    ctx.closePath();
    ctx.fill();
    if (!projection.axis.isFlat) {
      // The footprint's outline, so the pad stays a marked area rather than a shade of the
      // floor it is drawn on. The flat view keeps the band it always had.
      ctx.strokeStyle = Palette.padLine;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /** Every cross-section, back to front, each in the treatment its cue asks for. */
  private drawSections(context: DrawContext): void {
    const design = context.frame.design;
    const order = new DepthOrder(design.sliceMin, design.sliceMax, context.view.slice, context.view.mode);
    for (let i = 0; i < order.count; i++) {
      SectionPainter.paint(context, order.cues[i]);
    }
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
    const x = context.projection.screenXAt(cell.x, cell.z);
    const y = context.projection.screenYAt(cell.x, cell.y);
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
    let midX = highPosition.x;
    let midZ = highPosition.z;
    let midY = highPosition.y;
    if (low >= 0) {
      const lowPosition = blueprint.blockAt(low).position;
      midX = (lowPosition.x + highPosition.x) * 0.5;
      midZ = (lowPosition.z + highPosition.z) * 0.5;
      midY = (lowPosition.y + highPosition.y) * 0.5;
    } else {
      midY = highPosition.y - 0.5;
    }
    const x = context.projection.screenXAt(midX, midZ) + scale * 0.5;
    const y = context.projection.screenYAt(midX, midY) + scale * 0.5;
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
