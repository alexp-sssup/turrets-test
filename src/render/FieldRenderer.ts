import { IVec3 } from "../core/IVec3";
import { FaceHit } from "./FaceHit";
import { FieldFrame } from "./FieldFrame";
import { DetailLevel } from "./DetailLevel";
import { FrameCells } from "./FrameCells";
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
  /** The degradation order of spec 8, driven by the render p95 this class already measures. */
  public readonly detail: DetailLevel;
  private widthPx: number;
  private heightPx: number;
  private lastRenderMs: number;
  private ratio: number;
  private renderSamples: number[];
  /**
   * Render samples kept per yaw (isometric renderer spec 11).
   *
   * Fill cost differs by silhouette, so one pooled p95 would hide a yaw that is expensive
   * to draw behind three that are cheap -- and the yaw a tester actually sits in is the one
   * whose budget matters.
   */
  private readonly yawSamples: number[][];

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("this build needs a 2D canvas context");
    }
    this.ctx = ctx;
    this.predict = new PredictLayer();
    this.detail = new DetailLevel();
    this.baseLayers = [new BaseLayer(), new ActorLayer()];
    this.overlays = new Map<number, Layer>();
    this.overlays.set(OverlayMode.Stress as number, new StressLayer());
    this.overlays.set(OverlayMode.Predict as number, this.predict);
    this.overlays.set(OverlayMode.Logistics as number, new LogisticsLayer());
    this.overlays.set(OverlayMode.Arcs as number, new ArcsLayer());
    this.widthPx = 0;
    this.heightPx = 0;
    this.lastRenderMs = 0;
    this.ratio = 1;
    this.renderSamples = [];
    this.yawSamples = [[], [], [], []];
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
    return FieldRenderer.percentile95(this.renderSamples);
  }

  /** The same, for one yaw (spec 11). */
  public renderP95OfYaw(yaw: number): number {
    return FieldRenderer.percentile95(this.yawSamples[yaw]);
  }

  private static percentile95(samples: readonly number[]): number {
    if (samples.length === 0) {
      return 0;
    }
    const sorted: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      sorted.push(samples[i]);
    }
    sorted.sort((a: number, b: number): number => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index >= sorted.length ? sorted.length - 1 : index];
  }

  /**
   * The backing store's ceiling (mobile UI spec 8.3).
   *
   * A phone has a slower core and up to nine times the fill cost per CSS pixel, and a
   * three-times device pixel ratio across a full-bleed canvas is how a 60 fps target
   * quietly becomes a 20 fps one. Capping the ratio at two and the store at 2.2 M pixels
   * holds the render budget without touching the timestep, which 8.3 forbids: playback
   * degrades, the timestep does not.
   */
  public static readonly MAX_PIXEL_RATIO: number = 2;
  public static readonly MAX_BACKING_PIXELS: number = 2_200_000;

  /**
   * The effective device pixel ratio for a canvas of this CSS size.
   *
   * Never below one -- a store smaller than the element would be a blurry field, which
   * costs more than the fill does -- and invisible to the layers, which already never see
   * the ratio (8.3).
   */
  public static effectivePixelRatio(widthPx: number, heightPx: number, reported: number): number {
    let ratio = reported > FieldRenderer.MAX_PIXEL_RATIO ? FieldRenderer.MAX_PIXEL_RATIO : reported;
    const area = widthPx * heightPx;
    if (area > 0 && area * ratio * ratio > FieldRenderer.MAX_BACKING_PIXELS) {
      ratio = Math.sqrt(FieldRenderer.MAX_BACKING_PIXELS / area);
    }
    return ratio < 1 ? 1 : ratio;
  }

  /**
   * Matches the backing store to the element's CSS size and the capped device pixel ratio,
   * so the cross-section stays crisp on a retina display without the layers knowing about
   * it.
   */
  public resize(): boolean {
    const reported = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === this.widthPx && height === this.heightPx) {
      return false;
    }
    const ratio = FieldRenderer.effectivePixelRatio(width, height, reported);
    this.ratio = ratio;
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

  /**
   * The block a click *addresses*, and the face the view ray entered it through: the
   * frontmost visible one under the pointer, wherever it stands in the world (spec 5.2,
   * face-placement spec 2.1). `null` over empty scene.
   */
  public pickAt(
    frame: FieldFrame,
    view: ViewState,
    clientX: number,
    clientY: number
  ): FaceHit | null {
    const rect = this.canvas.getBoundingClientRect();
    const cells = new FrameCells(frame);
    return this.projection(frame, view).pick(
      cells,
      frame.design.viewBounds,
      clientX - rect.left,
      clientY - rect.top
    );
  }

  /**
   * The cell a click *places* into: across the face it was aimed at, or resting on the pad
   * (face-placement spec 2). `null` when there is nowhere to put a block.
   *
   * Takes the hit from `pickAt` rather than repeating it: a hover asks both questions about
   * one pointer position, and the ray is walked once for the pair.
   */
  public placementAt(
    frame: FieldFrame,
    view: ViewState,
    picked: FaceHit | null,
    clientX: number,
    clientY: number
  ): IVec3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const cells = new FrameCells(frame);
    return this.projection(frame, view).placementAt(
      picked,
      cells,
      clientX - rect.left,
      clientY - rect.top
    );
  }

  /** The pad cell under a screen point, or `null` off the pad (face-placement spec 2.2). */
  public groundAt(
    frame: FieldFrame,
    view: ViewState,
    clientX: number,
    clientY: number
  ): IVec3 | null {
    const rect = this.canvas.getBoundingClientRect();
    return this.projection(frame, view).groundAt(clientX - rect.left, clientY - rect.top);
  }

  public render(frame: FieldFrame, view: ViewState): void {
    const started = FieldRenderer.now();
    const projection = this.projection(frame, view);
    const context = new DrawContext(this.ctx, frame, view, projection, this.ratio, this.detail);
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
    this.detail.observe(this.renderP95());
    const perYaw = this.yawSamples[view.yaw.id];
    perYaw.push(this.lastRenderMs);
    if (perYaw.length > 300) {
      perYaw.splice(0, perYaw.length - 300);
    }
  }

  private static now(): number {
    if (typeof performance !== "undefined") {
      return performance.now();
    }
    return 0;
  }
}
