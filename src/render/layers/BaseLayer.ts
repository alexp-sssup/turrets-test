import { IVec3 } from "../../core/IVec3";
import { CellSilhouette } from "../CellSilhouette";
import { FieldComposition } from "../FieldComposition";
import { DrawContext, Layer } from "../Layer";
import { Palette } from "../Palette";
import { PeelPlane } from "../PeelPlane";
import { ScenePainter } from "../ScenePainter";
import { StructureCache } from "../StructureCache";
import { FieldFrame } from "../FieldFrame";

/**
 * The layer that always draws: the scene, the structure, and everything standing in it
 * (isometric renderer spec 4, spec 7; UI spec 4, overlay 1).
 *
 * Three passes, in this order and for this reason:
 *
 * 1. **The scene** -- ground, pad, reach plane, range marker. Nothing in it can occlude a
 *    voxel, so it goes down first and never enters the sort.
 * 2. **The composition** -- every voxel, actor, shadow and round in one back-to-front pass
 *    (`FieldComposition`). Cells outside the reach plane are never hidden: a tester needs to
 *    know the wall they are looking at has three more of itself behind it, and hiding them
 *    would make a five-wide turret look one-wide. What that costs differs by projection --
 *    the isometric view gives every section its own place and applies the peel rule of spec
 *    6, and the flat dev view ghosts them all into one place.
 * 3. **The marks** -- hover, selection, the first-failed-joint callout. Marks draw after the
 *    sorted list and are occluded by nothing (spec 4.1): a mark hidden behind the geometry it
 *    describes is a measurement lost, and spec 1.1 is the measurement.
 */
export class BaseLayer implements Layer {
  public readonly id: string = "base";
  private readonly composition: FieldComposition;
  private readonly cache: StructureCache;

  public constructor() {
    this.composition = new FieldComposition();
    this.cache = new StructureCache();
  }

  public draw(context: DrawContext): void {
    const design = context.frame.design;
    const peel = new PeelPlane(
      design.sliceMin,
      design.sliceMax,
      context.view.slice,
      context.view.yaw,
      context.view.mode
    );
    // Spec 8: the static pass is composited once and blitted after that, for the frames it
    // is sound to cache -- which is every frame with nothing moving in it. A live wave pays
    // the full sort, because the actors are inside it and not above it.
    const signature = StructureCache.signatureOf(context, peel);
    if (this.cache.canReuse(context, signature)) {
      this.cache.blit(context);
    } else {
      const capture = this.cache.begin(context, signature);
      const into = capture === null ? context : capture;
      ScenePainter.paint(into, peel);
      this.composition.draw(into, peel);
      if (capture !== null) {
        this.cache.end();
        this.cache.blit(context);
      }
    }
    this.drawInspection(context);
  }

  private drawInspection(context: DrawContext): void {
    const ctx = context.ctx;
    const hover = context.view.hover;
    if (hover !== null) {
      this.outline(context, hover, "rgba(219,228,240,0.45)", 1);
    }
    const selected = context.view.selected;
    if (selected !== null) {
      this.outline(context, selected, Palette.accent, 2);
    }
    if (context.view.hasJointHighlight) {
      BaseLayer.drawJointHighlight(context);
    }
    ctx.lineWidth = 1;
  }

  private outline(context: DrawContext, cell: IVec3, colour: string, width: number): void {
    const ctx = context.ctx;
    CellSilhouette.trace(context, cell.x, cell.y, cell.z);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
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
    let midX = highPosition.x + 0.5;
    let midZ = highPosition.z + 0.5;
    let midY = highPosition.y + 0.5;
    if (low >= 0) {
      const lowPosition = blueprint.blockAt(low).position;
      midX = (lowPosition.x + highPosition.x) * 0.5 + 0.5;
      midZ = (lowPosition.z + highPosition.z) * 0.5 + 0.5;
      midY = (lowPosition.y + highPosition.y) * 0.5 + 0.5;
    } else {
      midY = highPosition.y;
    }
    const x = context.projection.screenX(midX, midZ);
    const y = context.projection.screenY(midX, midY, midZ);
    ctx.strokeStyle = Palette.danger;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, scale * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, scale * 1.1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,92,92,0.4)";
    ctx.stroke();
    ctx.fillStyle = Palette.danger;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("first failure", x + scale * 1.2, y - scale * 0.8);
  }

  /** True when a cell holds a live block, whatever section it stands in. */
  public static liveBlockAt(frame: FieldFrame, cell: IVec3): number {
    return frame.liveBlockAt(cell.x, cell.y, cell.z);
  }
}
