import { IVec3 } from "../core/IVec3";
import { FieldFrame } from "./FieldFrame";
import { DrawContext, Layer } from "./Layer";
import { Projection } from "./Projection";
import { ViewState, OverlayMode } from "./ViewState";
import { ActorLayer } from "./layers/ActorLayer";
import { ArcsLayer } from "./layers/ArcsLayer";
import { BaseLayer } from "./layers/BaseLayer";
import { LogisticsLayer } from "./layers/LogisticsLayer";
import { PredictLayer } from "./layers/PredictLayer";
import { StressLayer } from "./layers/StressLayer";

/**
 * The canvas, the layer registry and the frame clock's drawing half.
 *
 * A registry of `Layer`s composited in order (UI spec 5.4): the base pass always draws, and
 * the selected overlay draws on top of it. Adding an overlay in P3 -- corrosion, blast
 * radius, mass distribution -- is one registration here and nothing else changes.
 */
export class FieldRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly baseLayers: readonly Layer[];
  private readonly overlays: Map<number, Layer>;
  public readonly predict: PredictLayer;
  private widthPx: number;
  private heightPx: number;
  private lastRenderMs: number;
  private renderSamples: number[];

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("this build needs a 2D canvas context");
    }
    this.ctx = ctx;
    this.predict = new PredictLayer();
    this.baseLayers = [new BaseLayer(), new ActorLayer()];
    this.overlays = new Map<number, Layer>();
    this.overlays.set(OverlayMode.Stress as number, new StressLayer());
    this.overlays.set(OverlayMode.Predict as number, this.predict);
    this.overlays.set(OverlayMode.Logistics as number, new LogisticsLayer());
    this.overlays.set(OverlayMode.Arcs as number, new ArcsLayer());
    this.widthPx = 0;
    this.heightPx = 0;
    this.lastRenderMs = 0;
    this.renderSamples = [];
  }

  public get width(): number {
    return this.widthPx;
  }

  public get height(): number {
    return this.heightPx;
  }

  public get renderMs(): number {
    return this.lastRenderMs;
  }

  /** 95th percentile render cost, which is the number UI spec 6 asks for. */
  public renderP95(): number {
    if (this.renderSamples.length === 0) {
      return 0;
    }
    const sorted: number[] = [];
    for (let i = 0; i < this.renderSamples.length; i++) {
      sorted.push(this.renderSamples[i]);
    }
    sorted.sort((a: number, b: number): number => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index >= sorted.length ? sorted.length - 1 : index];
  }

  /**
   * Matches the backing store to the element's CSS size and the device pixel ratio, so the
   * cross-section stays crisp on a retina display without the layers knowing about it.
   */
  public resize(): boolean {
    const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === this.widthPx && height === this.heightPx) {
      return false;
    }
    this.widthPx = width;
    this.heightPx = height;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return true;
  }

  public projection(frame: FieldFrame, view: ViewState): Projection {
    return new Projection(frame.design, view, this.widthPx, this.heightPx);
  }

  public cellAt(frame: FieldFrame, view: ViewState, clientX: number, clientY: number): IVec3 {
    const rect = this.canvas.getBoundingClientRect();
    return this.projection(frame, view).cellAt(clientX - rect.left, clientY - rect.top);
  }

  public render(frame: FieldFrame, view: ViewState): void {
    const started = FieldRenderer.now();
    const projection = this.projection(frame, view);
    const context = new DrawContext(this.ctx, frame, view, projection);
    for (let i = 0; i < this.baseLayers.length; i++) {
      this.baseLayers[i].draw(context);
    }
    const overlay = this.overlays.get(view.overlay as number);
    if (overlay !== undefined) {
      overlay.draw(context);
    }
    this.lastRenderMs = FieldRenderer.now() - started;
    this.renderSamples.push(this.lastRenderMs);
    if (this.renderSamples.length > 600) {
      this.renderSamples = this.renderSamples.slice(this.renderSamples.length - 600);
    }
  }

  private static now(): number {
    if (typeof performance !== "undefined") {
      return performance.now();
    }
    return 0;
  }
}
