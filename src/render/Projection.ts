import { GridBounds } from "../core/GridBounds";
import { IVec3 } from "../core/IVec3";
import { CellPick } from "./CellPick";
import { CellPresence } from "./CellPresence";
import { FieldDesign } from "./FieldDesign";
import { IsoProjection } from "./IsoProjection";
import { ViewMode } from "./ViewMode";
import { ViewState } from "./ViewState";
import { ZoomLadder } from "./ZoomLadder";

/**
 * World to screen for the field, in whichever projection the view is set to.
 *
 * The tester-facing projection is the isometric one of the isometric renderer spec, and the
 * maths for it lives in `IsoProjection` where it can be pinned headlessly. This class is
 * what a layer holds: it knows the design, the viewport and the view state, it frames the
 * scene, and it answers the two questions every layer asks -- where on screen is this world
 * point, and which cell is under this screen point.
 *
 * The flat side-on cross-section survives here as the developer diagnostic of spec 9, and it
 * survives *inside* this class rather than beside it: a layer never branches on the mode, so
 * no overlay can be projection-specific (spec 10.1). In that mode the x argument is ignored
 * and every section lands in the same place, which is exactly what the flat view is.
 *
 * Screen y depends on all three world coordinates in isometric, which is why `screenY` takes
 * z as well. That is the one signature change the projection forces on every layer, and it
 * is not avoidable: a projection where the depth axis has a place on screen cannot separate
 * the axes the way a side-on one can.
 */
export class Projection {
  private readonly design: FieldDesign;
  private readonly view: ViewState;
  public readonly widthPx: number;
  public readonly heightPx: number;
  /** The isometric maths, at this frame's yaw, zoom and origin. */
  public readonly iso: IsoProjection;

  public constructor(design: FieldDesign, view: ViewState, widthPx: number, heightPx: number) {
    this.design = design;
    this.view = view;
    this.widthPx = widthPx;
    this.heightPx = heightPx;
    this.iso = new IsoProjection(view.yaw, view.scale, Math.round(view.panX), Math.round(view.panY));
  }

  public get scale(): number {
    return this.view.scale;
  }

  public get mode(): ViewMode {
    return this.view.mode;
  }

  public get isIso(): boolean {
    return this.view.mode === ViewMode.Iso;
  }

  /** The cross-section a click resolves in, and the peel plane (spec 5.3, spec 6). */
  public get section(): number {
    return this.view.slice;
  }

  public screenX(x: number, z: number): number {
    if (this.isIso) {
      return this.iso.screenX(x, z);
    }
    return (z - this.design.viewBounds.min.z) * this.view.scale + this.view.panX;
  }

  public screenY(x: number, y: number, z: number): number {
    if (this.isIso) {
      return this.iso.screenY(x, y, z);
    }
    const bounds = this.design.viewBounds;
    const top = bounds.min.y + bounds.size.y;
    return (top - y - 1) * this.view.scale + this.view.panY;
  }

  /**
   * Where a world point sorts in the back-to-front pass (isometric renderer spec 4).
   *
   * The flat dev view has no depth to order, but it does have one ordering rule -- the
   * active section draws *last*, so the ghosts stay behind it -- and expressing that as a
   * two-valued key is what lets one composition serve both projections (spec 9).
   */
  public depthKey(x: number, y: number, z: number): number {
    if (this.isIso) {
      return this.iso.depthKey(x, y, z);
    }
    return x === this.view.slice ? 1 : 0;
  }

  /**
   * The cell a click places into: the build plane, and only ever the build plane (spec 5.3).
   *
   * Placement resolving by picking would let a mis-click land a block a section from the one
   * the tester meant, and spec 1.3's anti-blob measurements are measurements of what testers
   * *chose* to build. With the peel engaged nothing stands in front of this plane, so the
   * click is not a guess (spec 6).
   */
  public cellAt(screenX: number, screenY: number): IVec3 {
    if (!this.isIso) {
      const bounds = this.design.viewBounds;
      const top = bounds.min.y + bounds.size.y;
      const z = (screenX - this.view.panX) / this.view.scale + bounds.min.z;
      const y = top - 1 - (screenY - this.view.panY) / this.view.scale;
      return new IVec3(this.view.slice, Math.round(y), Math.round(z));
    }
    const world = this.iso.inSection(screenX, screenY, this.view.slice);
    return new IVec3(this.view.slice, Math.floor(world.y), Math.floor(world.z));
  }

  /**
   * The frontmost visible block under a screen point (spec 5.2), for hover, inspection,
   * focus-fire and the replay's joint locate. `null` when the pointer is over empty scene.
   */
  public pick(cells: CellPresence, bounds: GridBounds, screenX: number, screenY: number): IVec3 | null {
    if (!this.isIso) {
      const cell = this.cellAt(screenX, screenY);
      return cells.isSolid(cell.x, cell.y, cell.z) ? cell : null;
    }
    return CellPick.pick(this.iso, cells, bounds, screenX, screenY);
  }

  /**
   * Frames the lane and the turret, with the ground line low in the viewport.
   *
   * A view of a three-voxel turret in a viewport eight voxels tall is mostly sky if it is
   * centred, so the ground is anchored near the bottom instead. Nothing is ever drawn below
   * it, and everything that grows -- a taller design, a lobbed firepot's arc -- grows
   * upward, so the slack belongs above the ground line and not under it.
   */
  public static readonly GROUND_ANCHOR: number = 0.88;

  /**
   * Fit, in both projections (spec 2.4).
   *
   * The isometric case projects the eight corners of the world box at unit zoom, takes the
   * screen extent, picks the largest rung of the ladder that fits both axes, and puts the
   * pad's ground plane on the anchor. A quarter turn re-fits through the same path, so it
   * never throws the turret off the edge and never zooms a tester out for no reason.
   */
  public static fit(design: FieldDesign, view: ViewState, widthPx: number, heightPx: number): void {
    const bounds = design.viewBounds;
    if (view.mode === ViewMode.Flat) {
      Projection.fitFlat(design, view, widthPx, heightPx);
      return;
    }
    const yaw = view.yaw;
    const minX = bounds.min.x;
    const maxX = bounds.min.x + bounds.size.x;
    const minY = bounds.min.y;
    const maxY = bounds.min.y + bounds.size.y;
    const minZ = bounds.min.z;
    const maxZ = bounds.min.z + bounds.size.z;
    let lowU = 0;
    let highU = 0;
    let lowV = 0;
    let highV = 0;
    let first = true;
    for (let cx = 0; cx < 2; cx++) {
      for (let cy = 0; cy < 2; cy++) {
        for (let cz = 0; cz < 2; cz++) {
          const x = cx === 0 ? minX : maxX;
          const y = cy === 0 ? minY : maxY;
          const z = cz === 0 ? minZ : maxZ;
          const u = yaw.p(x, z) + yaw.r(x, z);
          const v = (yaw.p(x, z) - yaw.r(x, z)) * 0.5 - y;
          if (first) {
            lowU = u;
            highU = u;
            lowV = v;
            highV = v;
            first = false;
            continue;
          }
          lowU = u < lowU ? u : lowU;
          highU = u > highU ? u : highU;
          lowV = v < lowV ? v : lowV;
          highV = v > highV ? v : highV;
        }
      }
    }
    const spanU = highU - lowU;
    const spanV = highV - lowV;
    const byWidth = ZoomLadder.largestFitting(spanU, widthPx);
    const byHeight = ZoomLadder.largestFitting(spanV, heightPx);
    view.scale = byWidth < byHeight ? byWidth : byHeight;
    view.panX = Math.round((widthPx - spanU * view.scale) * 0.5 - lowU * view.scale);
    // The pad's ground plane on the anchor, rather than the whole box centred.
    const padX = (design.pad.minX + design.pad.maxX + 1) * 0.5;
    const padZ = (design.pad.minZ + design.pad.maxZ + 1) * 0.5;
    const groundV = (yaw.p(padX, padZ) - yaw.r(padX, padZ)) * 0.5 - design.pad.level;
    view.panY = Math.round(heightPx * Projection.GROUND_ANCHOR - groundV * view.scale);
  }

  private static fitFlat(
    design: FieldDesign,
    view: ViewState,
    widthPx: number,
    heightPx: number
  ): void {
    const bounds = design.viewBounds;
    const scaleX = widthPx / (bounds.size.z + 1);
    const scaleY = heightPx / (bounds.size.y + 1);
    const scale = scaleX < scaleY ? scaleX : scaleY;
    view.scale = ZoomLadder.snap(scale);
    const span = bounds.size.z * view.scale;
    view.panX = Math.round((widthPx - span) * 0.5);
    const top = bounds.min.y + bounds.size.y;
    const groundRow = top - design.pad.level;
    view.panY = Math.round(heightPx * Projection.GROUND_ANCHOR - groundRow * view.scale);
  }
}
