/**
 * What the attempt was flown on (mobile UI spec 9.1).
 *
 * Collected per attempt with no tester action, and it exists for 9.2's reporting rule:
 * every §7.3 metric is reported segmented by `layoutMode`, and a compact-device attempt is
 * never pooled into a single overall readability number.
 *
 * The gesture counts and `keyboardUsed` answer one question that pooling destroys. When a
 * `compact` tester never opens the stress overlay, was the overlay unreadable, or was the
 * control not where their thumb was? The first is a finding about the solver, the second is
 * a finding about the mobile UI spec, they have opposite consequences for the project, and
 * they are indistinguishable without the counts.
 *
 * Plain strings and numbers rather than the `LayoutMode` enum: the layout classifier lives
 * above this layer in `ui/`, and the export is read by a batch runner with no browser and
 * no UI code compiled into it.
 */
export class DeviceProfile {
  /** `wide` / `medium` / `compact`, sampled at the moment the wave started (9.1). */
  public layoutMode: string;
  /** `fine` / `coarse`. */
  public pointerKind: string;
  public viewportW: number;
  public viewportH: number;
  /** As the browser reported it, before the 8.3 backing-store cap. */
  public devicePixelRatio: number;
  public orientationChanges: number;
  public keyboardUsed: boolean;

  /** The 6.2 gesture set, counted. */
  public taps: number;
  public drags: number;
  public longPresses: number;
  public pinches: number;
  public doubleTaps: number;

  public constructor() {
    this.layoutMode = "wide";
    this.pointerKind = "fine";
    this.viewportW = 0;
    this.viewportH = 0;
    this.devicePixelRatio = 1;
    this.orientationChanges = 0;
    this.keyboardUsed = false;
    this.taps = 0;
    this.drags = 0;
    this.longPresses = 0;
    this.pinches = 0;
    this.doubleTaps = 0;
  }
}
