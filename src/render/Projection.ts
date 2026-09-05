import { GridBounds } from "../core/GridBounds";
import { IVec3 } from "../core/IVec3";
import { CellPick } from "./CellPick";
import { CellPresence } from "./CellPresence";
import { FaceHit } from "./FaceHit";
import { FieldDesign } from "./FieldDesign";
import { GroundPick } from "./GroundPick";
import { IsoProjection } from "./IsoProjection";
import { PlacementRule } from "./PlacementRule";
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

  public screenX(x: number, z: number): number {
    return this.iso.screenX(x, z);
  }

  public screenY(x: number, y: number, z: number): number {
    return this.iso.screenY(x, y, z);
  }

  /** Where a world point sorts in the back-to-front pass (isometric renderer spec 4). */
  public depthKey(x: number, y: number, z: number): number {
    return this.iso.depthKey(x, y, z);
  }

  /**
   * The frontmost visible block under a screen point, and the face the view ray entered it
   * through (spec 5.2, face-placement spec 2.1). `null` when the pointer is over empty scene.
   *
   * One pick serves all three verbs: inspect names the block (pointing spec 2.1), the eraser
   * removes it (pointing spec 2.2), and a placement builds across its face.
   */
  public pick(
    cells: CellPresence,
    bounds: GridBounds,
    screenX: number,
    screenY: number
  ): FaceHit | null {
    return CellPick.pick(this.iso, cells, bounds, screenX, screenY);
  }

  /** The pad cell under a screen point, or `null` off the pad (face-placement spec 2.2). */
  public groundAt(screenX: number, screenY: number): IVec3 | null {
    return GroundPick.at(this.iso, this.design.pad, screenX, screenY);
  }

  /**
   * The cell a placement fills, or `null` when there is nowhere to put one (face-placement
   * spec 2).
   *
   * `occupied` can no longer refuse anything (no-sections spec 2.3): the cell across the face
   * the ray entered by is the cell the ray visited immediately before, and the traversal only
   * reached the block by finding it empty. The guard stays because it is the contract of the
   * rule rather than a branch this caller needs, and because a theorem is worth a test.
   */
  public placementAt(
    picked: FaceHit | null,
    occupied: CellPresence,
    screenX: number,
    screenY: number
  ): IVec3 | null {
    return PlacementRule.target(picked, this.groundAt(screenX, screenY), occupied);
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
}
