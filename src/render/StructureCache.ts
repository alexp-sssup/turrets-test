import { FieldFrame } from "./FieldFrame";
import { DrawContext } from "./Layer";
import { PeelPlane } from "./PeelPlane";
import { ViewState } from "./ViewState";

/**
 * The static pass, kept between frames (isometric renderer spec 8).
 *
 * The ground, the pad, the build plane and the structure are expensive to build and change
 * only when something a tester did changed them, so they are composited once into an
 * offscreen canvas and blitted after that. In the editor -- where a tester spends most of
 * their attention, and where the solver is already chewing a re-solve -- a frame becomes one
 * blit plus the marks.
 *
 * **What it cannot do, and why.** The actors are not a layer above the structure; they are
 * items *inside* its depth sort, which is what puts a runner behind the wall they walk
 * behind (spec 4). Caching the structure and drawing the actors over it would draw every
 * runner in front of every wall and give away the read the projection exists for. So the
 * cache is used only for frames that carry no actors and no rounds in flight -- the editor,
 * allocation, and a wave that has not started -- and a live wave pays the full sort every
 * frame. Spec 3.3's occlusion rule and spec 8's culling are what make that affordable, and
 * the dev readout's per-yaw p95 is what decides whether it is.
 *
 * The signature is a plain integer hash over everything that can change a cached pixel. It
 * costs one pass over the blocks, which is cheap next to building their paths, and getting it
 * wrong shows up as a stale frame -- so it errs toward including things (the whole view
 * geometry, every block's damage byte) rather than toward being clever.
 */
export class StructureCache {
  private surface: HTMLCanvasElement | null;
  private target: CanvasRenderingContext2D | null;
  private signature: number;
  private widthPx: number;
  private heightPx: number;
  private ratio: number;
  private capturing: boolean;

  public constructor() {
    this.surface = null;
    this.target = null;
    this.signature = 0;
    this.widthPx = 0;
    this.heightPx = 0;
    this.ratio = 1;
    this.capturing = false;
  }

  /** Frames with anything moving in them are never cached: the sort forbids it. */
  public static isCacheable(context: DrawContext): boolean {
    const frame = context.frame;
    return frame.attackers.length === 0 && frame.crew.length === 0 && frame.shots.length === 0;
  }

  /**
   * Everything that can change a cached pixel, as one integer.
   *
   * Hover, selection and the joint callout are absent on purpose -- they are marks, drawn
   * live after the blit (spec 4.1), so they must not invalidate anything.
   */
  public static signatureOf(context: DrawContext, peel: PeelPlane): number {
    return StructureCache.signature(
      context.view,
      context.frame,
      peel,
      context.projection.widthPx,
      context.projection.heightPx,
      context.detail.level
    );
  }

  /**
   * The same, from plain values, so the rule can be pinned headlessly -- including the one
   * property that matters most, which is that a mark does *not* invalidate the pass.
   */
  public static signature(
    view: ViewState,
    frame: FieldFrame,
    peel: PeelPlane,
    widthPx: number,
    heightPx: number,
    detail: number
  ): number {
    let hash = 2166136261;
    hash = StructureCache.mix(hash, view.scale);
    hash = StructureCache.mix(hash, Math.round(view.panX));
    hash = StructureCache.mix(hash, Math.round(view.panY));
    hash = StructureCache.mix(hash, view.yaw.id);
    hash = StructureCache.mix(hash, view.mode as number);
    hash = StructureCache.mix(hash, view.slice);
    hash = StructureCache.mix(hash, view.peel ? 1 : 0);
    hash = StructureCache.mix(hash, peel.peeledCount);
    hash = StructureCache.mix(hash, Math.round(widthPx));
    hash = StructureCache.mix(hash, Math.round(heightPx));
    hash = StructureCache.mix(hash, frame.blockCount);
    hash = StructureCache.mix(hash, detail);
    for (let block = 0; block < frame.blockCount; block++) {
      const alive = frame.isAlive(block) ? 1 : 0;
      const burning = frame.isBurning(block) ? 2 : 0;
      hash = StructureCache.mix(hash, alive | burning);
      hash = StructureCache.mix(hash, Math.round(frame.damageFraction(block) * 255));
    }
    for (let i = 0; i < frame.depots.length; i++) {
      hash = StructureCache.mix(hash, Math.round(frame.depots[i].fillFraction * 64));
    }
    return hash;
  }

  private static mix(hash: number, value: number): number {
    let mixed = (hash ^ (value | 0)) >>> 0;
    mixed = Math.imul(mixed, 16777619) >>> 0;
    return mixed;
  }

  public canReuse(context: DrawContext, signature: number): boolean {
    return (
      this.surface !== null &&
      !this.capturing &&
      this.signature === signature &&
      this.widthPx === context.projection.widthPx &&
      this.heightPx === context.projection.heightPx &&
      StructureCache.isCacheable(context)
    );
  }

  /**
   * Opens a capture and returns the context to draw the static pass into, or `null` when
   * this frame is not cacheable and the caller should draw straight to the canvas.
   */
  public begin(context: DrawContext, signature: number): DrawContext | null {
    if (!StructureCache.isCacheable(context)) {
      this.invalidate();
      return null;
    }
    const width = Math.round(context.projection.widthPx);
    const height = Math.round(context.projection.heightPx);
    if (width <= 0 || height <= 0 || typeof document === "undefined") {
      return null;
    }
    if (
      this.surface === null ||
      this.widthPx !== context.projection.widthPx ||
      this.heightPx !== context.projection.heightPx ||
      this.ratio !== context.pixelRatio
    ) {
      const surface = document.createElement("canvas");
      surface.width = Math.round(width * context.pixelRatio);
      surface.height = Math.round(height * context.pixelRatio);
      const target = surface.getContext("2d");
      if (target === null) {
        return null;
      }
      this.surface = surface;
      this.target = target;
      this.widthPx = context.projection.widthPx;
      this.heightPx = context.projection.heightPx;
      this.ratio = context.pixelRatio;
    }
    const target = this.target;
    if (target === null) {
      return null;
    }
    target.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    target.clearRect(0, 0, width, height);
    this.signature = signature;
    this.capturing = true;
    return new DrawContext(
      target,
      context.frame,
      context.view,
      context.projection,
      context.pixelRatio,
      context.detail
    );
  }

  public end(): void {
    this.capturing = false;
  }

  /** Puts the cached pass on the canvas, in CSS pixels, one device pixel to one. */
  public blit(context: DrawContext): void {
    const surface = this.surface;
    if (surface === null) {
      return;
    }
    context.ctx.drawImage(surface, 0, 0, this.widthPx, this.heightPx);
  }

  public invalidate(): void {
    this.signature = 0;
    this.capturing = false;
    this.surface = null;
    this.target = null;
  }
}
