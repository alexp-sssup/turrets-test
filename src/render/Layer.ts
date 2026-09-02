import { FieldFrame } from "./FieldFrame";
import { Projection } from "./Projection";
import { ViewState } from "./ViewState";

/** What a layer is handed. The frame is read-only by contract; layers never write to it. */
export class DrawContext {
  public readonly ctx: CanvasRenderingContext2D;
  public readonly frame: FieldFrame;
  public readonly view: ViewState;
  public readonly projection: Projection;

  public constructor(
    ctx: CanvasRenderingContext2D,
    frame: FieldFrame,
    view: ViewState,
    projection: Projection
  ) {
    this.ctx = ctx;
    this.frame = frame;
    this.view = view;
    this.projection = projection;
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
