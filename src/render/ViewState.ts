import { IVec3 } from "../core/IVec3";
import { ViewYaw } from "./ViewYaw";
import { ZoomLadder } from "./ZoomLadder";

/**
 * The five overlays, numbered to match the keys that select them (UI spec 4).
 *
 * `Base` is not one of them: the base layer always draws, and an overlay composes on top
 * rather than replacing it. Losing sight of the structure to read its stress defeats the
 * purpose.
 */
export enum OverlayMode {
  Material = 1,
  Stress = 2,
  Predict = 3,
  Logistics = 4,
  Arcs = 5,
}

export const OVERLAY_COUNT: number = 5;

export function overlayName(mode: OverlayMode): string {
  if (mode === OverlayMode.Material) {
    return "material";
  }
  if (mode === OverlayMode.Stress) {
    return "stress";
  }
  if (mode === OverlayMode.Predict) {
    return "predict";
  }
  if (mode === OverlayMode.Logistics) {
    return "logistics";
  }
  return "arcs";
}

export function overlayLegend(mode: OverlayMode): string {
  if (mode === OverlayMode.Material) {
    return "cell material, damage and ignition";
  }
  if (mode === OverlayMode.Stress) {
    return "per-joint utilization: colour ramp plus hatch bands";
  }
  if (mode === OverlayMode.Predict) {
    return "select a cell: what collapses if it dies";
  }
  if (mode === OverlayMode.Logistics) {
    return "station-to-depot routes, round trips, runners";
  }
  return "firing arcs and the shadows your own blocks cast";
}

/**
 * Everything about the *view* that no `SimCommand` may touch (UI spec 5.2).
 *
 * The type split is load-bearing rather than tidy: if a view change could reach sim state,
 * a replay would diverge from the run it recorded and the whole loop would break. So this
 * object is the only place pan, zoom, the yaw, the overlay and the inspected cell live, and
 * the simulation never sees it.
 */
export class ViewState {
  public overlay: OverlayMode;
  /** Which quarter turn the camera is at (spec 2.2). Four states, `q` and `e`. */
  public yaw: ViewYaw;
  /** Zoom, in screen pixels per voxel edge. Always a rung of `ZoomLadder` (spec 2.3). */
  public scale: number;
  /** Pan, in screen pixels. */
  public panX: number;
  public panY: number;
  /** Cell under the pointer, or null. Drives the predict overlay's hover reading. */
  public hover: IVec3 | null;
  /** Cell the player clicked to inspect. Sticky, unlike hover. */
  public selected: IVec3 | null;
  /** Joint the replay is pointing at, as a pair of block indices. -1 when none. */
  public highlightJointLow: number;
  public highlightJointHigh: number;

  public constructor() {
    this.overlay = OverlayMode.Material;
    this.yaw = ViewYaw.initial;
    this.scale = ZoomLadder.initial;
    this.panX = 0;
    this.panY = 0;
    this.hover = null;
    this.selected = null;
    this.highlightJointLow = -1;
    this.highlightJointHigh = -1;
  }

  public get hasJointHighlight(): boolean {
    return this.highlightJointHigh >= 0;
  }

  public clearJointHighlight(): void {
    this.highlightJointLow = -1;
    this.highlightJointHigh = -1;
  }

  /** The cell the panels should describe: the click wins over the hover. */
  public focusCell(): IVec3 | null {
    if (this.selected !== null) {
      return this.selected;
    }
    return this.hover;
  }
}
