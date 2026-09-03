import { DetailLevel } from "./DetailLevel";
import { FieldFrame } from "./FieldFrame";
import { Projection } from "./Projection";
import { ViewState } from "./ViewState";

/** What a layer is handed. The frame is read-only by contract; layers never write to it. */
export class DrawContext {
  public readonly ctx: CanvasRenderingContext2D;
  public readonly frame: FieldFrame;
  public readonly view: ViewState;
  public readonly projection: Projection;
  /**
   * The backing store's device-pixel ratio, capped as the mobile UI spec 8.3 requires.
   *
   * Layers never need it -- they draw in CSS pixels and the canvas transform does the rest --
   * but an offscreen render target has to match the store it will be blitted onto, so the
   * structure cache of the isometric renderer spec 8 does.
   */
  public readonly pixelRatio: number;
  /** What this frame is allowed to draw, when the budget is tight (spec 8). */
  public readonly detail: DetailLevel;

  public constructor(
    ctx: CanvasRenderingContext2D,
    frame: FieldFrame,
    view: ViewState,
    projection: Projection,
    pixelRatio: number,
    detail: DetailLevel
  ) {
    this.ctx = ctx;
    this.frame = frame;
    this.view = view;
    this.projection = projection;
    this.pixelRatio = pixelRatio;
    this.detail = detail;
  }
}

/**
 * One composited pass over the field (UI spec 5.4).
 *
 * A registry of these draws in order, so adding an overlay -- corrosion, blast radius, mass
 * distribution -- is one registration and nothing else changes. `id` is the overlay the
 * layer belongs to, or `'base'` for the layer that always draws.
 */
export interface Layer {
  readonly id: string;
  draw(context: DrawContext): void;
}
