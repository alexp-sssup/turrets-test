/**
 * What the renderer drops when it cannot hold the frame budget (isometric renderer spec 8).
 *
 * The order is fixed and it is spent from the cheapest read to the dearest: the silhouette
 * edges first, then the ground's tile accents, and only then a rung down the zoom ladder.
 * **The timestep is never touched** -- playback degrades, the
 * timestep does not (mobile UI spec 8.3), because dropping ticks to make a phone feel smooth
 * would break the prototype's determinism and with it the replay.
 *
 * Degradation is announced in the dev readout rather than being silent. A tester who says
 * "it looked different on my phone" and a reader of their attempt record should both be able
 * to see that the renderer gave something up, and which thing.
 *
 * Recovery has hysteresis, and needs a sustained margin rather than one cheap frame: a level
 * that oscillated with the noise would be worse than either of the levels it sat between.
 */
export class DetailLevel {
  /** Everything drawn. */
  public static readonly FULL: number = 0;
  /** No silhouette or crease edges (spec 3.1). */
  public static readonly NO_EDGES: number = 1;
  /** No ground tile accents (spec 7.1). */
  public static readonly NO_GROUND_DETAIL: number = 2;
  /** A rung down the zoom ladder, which the view owns and the renderer only asks for. */
  public static readonly ZOOM_OUT: number = 3;
  public static readonly WORST: number = 3;

  /** The frame budget the levels are measured against: 60 fps, in milliseconds. */
  public static readonly BUDGET_MS: number = 16;
  /** How far under budget a sustained p95 has to sit before a level is given back. */
  public static readonly RECOVERY: number = 0.55;
  /** Frames of margin required before recovering, and before degrading again. */
  public static readonly PATIENCE: number = 90;

  private levelValue: number;
  private streak: number;
  private zoomAsked: boolean;

  public constructor() {
    this.levelValue = DetailLevel.FULL;
    this.streak = 0;
    this.zoomAsked = false;
  }

  public get level(): number {
    return this.levelValue;
  }

  public get edges(): boolean {
    return this.levelValue < DetailLevel.NO_EDGES;
  }

  public get groundDetail(): boolean {
    return this.levelValue < DetailLevel.NO_GROUND_DETAIL;
  }

  /** True once, when the level reaches the rung-down the view has to apply. */
  public takeZoomRequest(): boolean {
    if (this.levelValue < DetailLevel.ZOOM_OUT || this.zoomAsked) {
      return false;
    }
    this.zoomAsked = true;
    return true;
  }

  /** Called once a frame with the current render p95. */
  public observe(renderP95: number): void {
    if (renderP95 > DetailLevel.BUDGET_MS) {
      this.streak = this.streak > 0 ? 0 : this.streak - 1;
      if (this.streak <= -DetailLevel.PATIENCE) {
        this.degrade();
        this.streak = 0;
      }
      return;
    }
    if (renderP95 < DetailLevel.BUDGET_MS * DetailLevel.RECOVERY) {
      this.streak = this.streak < 0 ? 0 : this.streak + 1;
      if (this.streak >= DetailLevel.PATIENCE) {
        this.recover();
        this.streak = 0;
      }
      return;
    }
    this.streak = 0;
  }

  private degrade(): void {
    if (this.levelValue < DetailLevel.WORST) {
      this.levelValue += 1;
    }
  }

  private recover(): void {
    if (this.levelValue > DetailLevel.FULL) {
      this.levelValue -= 1;
      this.zoomAsked = false;
    }
  }

  /** What the dev readout says it gave up. */
  public describe(): string {
    if (this.levelValue === DetailLevel.FULL) {
      return "full";
    }
    const names: readonly string[] = ["edges", "ground detail", "build grid", "zoom"];
    let text = "";
    for (let i = 0; i < this.levelValue && i < names.length; i++) {
      text += (text.length > 0 ? ", " : "") + names[i];
    }
    return "dropped " + text;
  }
}
