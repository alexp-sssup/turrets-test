/**
 * Where one step along x lands on screen (depth view spec 2).
 *
 * The whole of the 2.5D projection is these two numbers. A section step is a constant
 * screen offset -- right by `RUN` voxels and up by `RISE` voxels -- which makes the
 * projection linear, invertible in the active section's plane, and free of camera state.
 *
 * `RUN` equals `RISE` deliberately: at 45 degrees the depth axis is visibly neither the
 * lane axis nor the vertical one. A shallower angle reads as a lane offset, and mistaking
 * "two sections back" for "two cells down the lane" is the one confusion this projection
 * can create. Four tenths of a cell is far enough to separate five sections inside a
 * viewport and near enough that a wall still reads as one wall.
 */
export class DepthAxis {
  /** Screen pixels right, per section farther from the viewer. */
  public readonly runPx: number;
  /** Screen pixels up, per section farther from the viewer. */
  public readonly risePx: number;

  public constructor(runPx: number, risePx: number) {
    this.runPx = runPx;
    this.risePx = risePx;
  }

  /** Voxels of screen offset per section. Scale-free, so the framing maths can use it. */
  public static readonly RUN: number = 0.42;
  public static readonly RISE: number = 0.42;

  /** The flat view's axis: x has no place on screen at all. */
  public static flat(): DepthAxis {
    return new DepthAxis(0, 0);
  }

  public static forScale(scale: number): DepthAxis {
    return new DepthAxis(DepthAxis.RUN * scale, DepthAxis.RISE * scale);
  }

  public get isFlat(): boolean {
    return this.runPx === 0 && this.risePx === 0;
  }

  /** Screen x offset for a section `sections` farther from the viewer than the active one. */
  public offsetX(sections: number): number {
    return sections * this.runPx;
  }

  /** Screen y offset for the same. Negative, because farther is up the screen. */
  public offsetY(sections: number): number {
    return -sections * this.risePx;
  }
}
