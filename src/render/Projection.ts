import { IVec3 } from "../core/IVec3";
import { DepthAxis } from "./DepthAxis";
import { FieldDesign } from "./FieldDesign";
import { ViewMode } from "./ViewMode";
import { ViewState } from "./ViewState";

/**
 * World to screen, for the side-on cross-section P0 renders (UI spec 2) and for the 2.5D
 * depth view over it (depth view spec 2).
 *
 * The horizontal screen axis is **z**, the lane axis: attackers walk in from the left, and
 * the turret stands on the right. The vertical axis is **y**, up. The third axis, x, is the
 * cross-section: in the flat view one slice is drawn solid and the rest are ghosted behind
 * it; in the depth view it becomes a constant screen offset per section, right and up.
 *
 * That choice is what makes interiors free. Everything P0 tests -- load paths under
 * gravity, fire running down through contiguous wood, a runner walking a corridor and that
 * corridor being cut -- lives in this plane, and there is no camera for a tester to learn.
 *
 * The depth offset is measured **from the active cross-section**, not from the world origin
 * (depth view spec 2.2). Two things follow, and both are the reason for it: toggling the
 * mode leaves the section the tester is working in exactly where it was, and the inverse
 * below stays exact, because screen-to-world resolves in the active section's plane and
 * nowhere else. A click still means one unambiguous cell with five sections on screen.
 */
export class Projection {
  private readonly design: FieldDesign;
  private readonly view: ViewState;
  public readonly widthPx: number;
  public readonly heightPx: number;
  /** The screen offset one section carries. Zero on both axes in the flat view. */
  public readonly axis: DepthAxis;

  public constructor(design: FieldDesign, view: ViewState, widthPx: number, heightPx: number) {
    this.design = design;
    this.view = view;
    this.widthPx = widthPx;
    this.heightPx = heightPx;
    this.axis = view.mode === ViewMode.Depth ? DepthAxis.forScale(view.scale) : DepthAxis.flat();
  }

  public get scale(): number {
    return this.view.scale;
  }

  public get mode(): ViewMode {
    return this.view.mode;
  }

  /** Screen x of a world z coordinate, in the active cross-section. */
  public screenX(z: number): number {
    const bounds = this.design.viewBounds;
    return (z - bounds.min.z) * this.view.scale + this.view.panX;
  }

  /** Screen y of a world y coordinate, in the active cross-section. Note the flip: world up is screen up. */
  public screenY(y: number): number {
    const bounds = this.design.viewBounds;
    const top = bounds.min.y + bounds.size.y;
    return (top - y - 1) * this.view.scale + this.view.panY;
  }

  /**
   * The same pair, for content that lives in some other cross-section.
   *
   * Every layer that draws an off-slice block, runner, joint or route uses these, so a mark
   * sits on the thing it describes rather than on a projection of it (depth view spec 4.2).
   * `x` may be fractional: a joint normal to the cross-section is drawn at the midpoint
   * between the two sections it joins.
   */
  public screenXAt(x: number, z: number): number {
    return this.screenX(z) + this.axis.offsetX(x - this.view.slice);
  }

  public screenYAt(x: number, y: number): number {
    return this.screenY(y) + this.axis.offsetY(x - this.view.slice);
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

  /**
   * The cell under a screen point, in the currently drawn cross-section.
   *
   * Unchanged by the depth view on purpose (depth view spec 5): the pointer always
   * addresses the working plane, so placement and inspection never become a picking
   * problem and a mis-click can never contaminate what the attempt records.
   */
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

  /**
   * Fit, in both modes.
   *
   * The depth view spreads the design over the sections in front of and behind the active
   * one (depth view spec 5), so the box being fitted is wider and taller by that spread and
   * the pan is biased by the part of it that hangs off the near side. In the flat view the
   * spread is zero on both axes and every line below reduces to the framing UI spec 2
   * described.
   */
  public static fit(design: FieldDesign, view: ViewState, widthPx: number, heightPx: number): void {
    const bounds = design.viewBounds;
    const depth = view.mode === ViewMode.Depth;
    // Clamped, because a slice outside the design's own range has nothing on that side to
    // frame and a negative spread would shrink the box rather than widen it.
    const front = depth ? Projection.atLeastZero(view.slice - design.sliceMin) : 0;
    const back = depth ? Projection.atLeastZero(design.sliceMax - view.slice) : 0;
    const spreadZ = DepthAxis.RUN * (front + back);
    const spreadY = DepthAxis.RISE * (front + back);
    const scaleX = widthPx / (bounds.size.z + 1 + spreadZ);
    const scaleY = heightPx / (bounds.size.y + 1 + spreadY);
    const scale = scaleX < scaleY ? scaleX : scaleY;
    view.scale = scale < 6 ? 6 : scale;
    const nearOverhang = DepthAxis.RUN * front * view.scale;
    const span = (bounds.size.z + spreadZ) * view.scale;
    view.panX = (widthPx - span) * 0.5 + nearOverhang;
    // Put the pad's ground line at the anchor rather than centring the whole box.
    const top = bounds.min.y + bounds.size.y;
    const groundRow = top - design.pad.level;
    view.panY = heightPx * Projection.GROUND_ANCHOR - groundRow * view.scale;
  }

  private static atLeastZero(value: number): number {
    return value < 0 ? 0 : value;
  }
}
