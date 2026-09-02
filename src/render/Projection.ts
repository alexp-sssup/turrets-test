import { IVec3 } from "../core/IVec3";
import { FieldDesign } from "./FieldDesign";
import { ViewState } from "./ViewState";

/**
 * World to screen, for the side-on cross-section P0 renders (UI spec 2).
 *
 * The horizontal screen axis is **z**, the lane axis: attackers walk in from the left, and
 * the turret stands on the right. The vertical axis is **y**, up. The third axis, x, is the
 * cross-section: one slice is drawn solid and the rest are ghosted behind it.
 *
 * That choice is what makes interiors free. Everything P0 tests -- load paths under
 * gravity, fire running down through contiguous wood, a runner walking a corridor and that
 * corridor being cut -- lives in this plane, and there is no camera for a tester to learn.
 */
export class Projection {
  private readonly design: FieldDesign;
  private readonly view: ViewState;
  public readonly widthPx: number;
  public readonly heightPx: number;

  public constructor(design: FieldDesign, view: ViewState, widthPx: number, heightPx: number) {
    this.design = design;
    this.view = view;
    this.widthPx = widthPx;
    this.heightPx = heightPx;
  }

  public get scale(): number {
    return this.view.scale;
  }

  /** Screen x of a world z coordinate. */
  public screenX(z: number): number {
    const bounds = this.design.viewBounds;
    return (z - bounds.min.z) * this.view.scale + this.view.panX;
  }

  /** Screen y of a world y coordinate. Note the flip: world up is screen up. */
  public screenY(y: number): number {
    const bounds = this.design.viewBounds;
    const top = bounds.min.y + bounds.size.y;
    return (top - y - 1) * this.view.scale + this.view.panY;
  }

  public worldZ(screenX: number): number {
    const bounds = this.design.viewBounds;
    return (screenX - this.view.panX) / this.view.scale + bounds.min.z;
  }

  public worldY(screenY: number): number {
    const bounds = this.design.viewBounds;
    const top = bounds.min.y + bounds.size.y;
    return top - 1 - (screenY - this.view.panY) / this.view.scale;
  }

  /** The cell under a screen point, in the currently drawn cross-section. */
  public cellAt(screenX: number, screenY: number): IVec3 {
    return new IVec3(this.view.slice, Math.round(this.worldY(screenY)), Math.round(this.worldZ(screenX)));
  }

  /**
   * Frames the lane and the turret, with the ground line low in the viewport.
   *
   * A side-on view of a three-voxel turret in a viewport eight voxels tall is mostly sky if
   * it is centred, so the ground is anchored near the bottom instead. Nothing is ever drawn
   * below it, and everything that grows -- a taller design, a lobbed firepot's arc -- grows
   * upward, so the slack belongs above the ground line and not under it.
   */
  public static readonly GROUND_ANCHOR: number = 0.88;

  public static fit(design: FieldDesign, view: ViewState, widthPx: number, heightPx: number): void {
    const bounds = design.viewBounds;
    const scaleX = widthPx / (bounds.size.z + 1);
    const scaleY = heightPx / (bounds.size.y + 1);
    const scale = scaleX < scaleY ? scaleX : scaleY;
    view.scale = scale < 6 ? 6 : scale;
    view.panX = (widthPx - bounds.size.z * view.scale) * 0.5;
    // Put the pad's ground line at the anchor rather than centring the whole box.
    const top = bounds.min.y + bounds.size.y;
    const groundRow = top - design.pad.level;
    view.panY = heightPx * Projection.GROUND_ANCHOR - groundRow * view.scale;
  }
}
