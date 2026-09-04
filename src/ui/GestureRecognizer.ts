import { GestureIntent, GestureKind } from "./GestureIntent";

/** Where a pointer sequence has got to. Internal to the recognizer, exposed for its tests. */
export enum GesturePhase {
  /** No pointer down. */
  Idle = 0,
  /** One pointer down, still inside the tap slop and inside the long-press hold. */
  Pending = 1,
  /** One pointer down, past the tap slop: a one-finger drag. */
  Dragging = 2,
  /** One pointer down, past the long-press hold, not yet moved. */
  Holding = 3,
  /** Long-press then drag: the sweep of 6.3. */
  Sweeping = 4,
  /** Two pointers down: pinch and two-finger pan. */
  Pinching = 5,
  /** The gesture is over but pointers are still down. Nothing more is recognized. */
  Spent = 6,
}

/**
 * Pointer sequences to intents (mobile UI spec 6.2).
 *
 * It takes `(pointerId, x, y, timeMs)` and returns `GestureIntent`s, and that is the whole
 * of its interface with the browser: no `PointerEvent`, no canvas, no DOM, no clock of its
 * own. That is not tidiness, it is 7.3 -- every threshold in the table below has to be
 * asserted at and either side of its value by `node:test`, and a recognizer that read the
 * clock itself could not be. The long-press timer is therefore driven by `tick`, which the
 * frame clock calls, and which a test calls with whatever millisecond it likes.
 *
 * Intents accumulate and are drained by the caller rather than delivered through a
 * callback, so a test reads a plain array and the app holds no closure over its own state.
 */
export class GestureRecognizer {
  /** The thresholds of 6.2, fixed so they can be tested rather than felt. */
  public static readonly TAP_SLOP_PX: number = 8;
  public static readonly TAP_TIMEOUT_MS: number = 250;
  public static readonly LONG_PRESS_MS: number = 400;
  public static readonly DOUBLE_TAP_MS: number = 300;
  public static readonly DOUBLE_TAP_SLOP_PX: number = 24;

  private phaseValue: GesturePhase;
  private primaryId: number;
  private secondaryId: number;
  private primaryX: number;
  private primaryY: number;
  private secondaryX: number;
  private secondaryY: number;
  private startX: number;
  private startY: number;
  private startMs: number;
  private pinchDistance: number;
  private pinchCentreX: number;
  private pinchCentreY: number;
  private lastTapX: number;
  private lastTapY: number;
  private lastTapMs: number;
  private intents: GestureIntent[];

  public constructor() {
    this.phaseValue = GesturePhase.Idle;
    this.primaryId = -1;
    this.secondaryId = -1;
    this.primaryX = 0;
    this.primaryY = 0;
    this.secondaryX = 0;
    this.secondaryY = 0;
    this.startX = 0;
    this.startY = 0;
    this.startMs = 0;
    this.pinchDistance = 0;
    this.pinchCentreX = 0;
    this.pinchCentreY = 0;
    this.lastTapX = 0;
    this.lastTapY = 0;
    this.lastTapMs = -1;
    this.intents = [];
  }

  public get phase(): GesturePhase {
    return this.phaseValue;
  }

  /** The recognized intents so far, handed over and cleared. */
  public drain(): readonly GestureIntent[] {
    const drained = this.intents;
    this.intents = [];
    return drained;
  }

  public down(pointerId: number, x: number, y: number, timeMs: number): void {
    if (this.phaseValue === GesturePhase.Idle) {
      this.primaryId = pointerId;
      this.primaryX = x;
      this.primaryY = y;
      this.startX = x;
      this.startY = y;
      this.startMs = timeMs;
      this.phaseValue = GesturePhase.Pending;
      return;
    }
    if (this.primaryId >= 0 && this.secondaryId < 0 && pointerId !== this.primaryId) {
      // Pinch entry is the second pointer down (6.2), and it *cancels* rather than
      // committing whatever the first finger had started. Since touch-gestures spec 2.4
      // that is a pan being interrupted rather than a placement being discarded, and the
      // cancel is kept because the first finger's drag must not go on being a pan.
      this.secondaryId = pointerId;
      this.secondaryX = x;
      this.secondaryY = y;
      this.intents.push(GestureIntent.cancel());
      this.phaseValue = GesturePhase.Pinching;
      this.pinchDistance = this.distanceBetweenPointers();
      this.pinchCentreX = (this.primaryX + this.secondaryX) * 0.5;
      this.pinchCentreY = (this.primaryY + this.secondaryY) * 0.5;
      return;
    }
    // A third finger, or a finger arriving while the gesture is already spent. §11 keeps
    // multi-touch focus fire out of scope, and a hand that has not come off the glass does
    // not get to start a placement, so both are ignored rather than given a meaning.
  }

  public move(pointerId: number, x: number, y: number, timeMs: number): void {
    void timeMs;
    if (pointerId === this.primaryId) {
      this.primaryX = x;
      this.primaryY = y;
    } else if (pointerId === this.secondaryId) {
      this.secondaryX = x;
      this.secondaryY = y;
    } else {
      return;
    }

    if (this.phaseValue === GesturePhase.Pinching) {
      this.trackPinch();
      return;
    }
    if (pointerId !== this.primaryId) {
      return;
    }
    if (this.phaseValue === GesturePhase.Pending) {
      if (this.movedPastTapSlop()) {
        this.phaseValue = GesturePhase.Dragging;
        this.intents.push(GestureIntent.at(GestureKind.DragStart, this.startX, this.startY));
        this.intents.push(GestureIntent.at(GestureKind.DragMove, x, y));
      }
      return;
    }
    if (this.phaseValue === GesturePhase.Dragging) {
      this.intents.push(GestureIntent.at(GestureKind.DragMove, x, y));
      return;
    }
    if (this.phaseValue === GesturePhase.Holding || this.phaseValue === GesturePhase.Sweeping) {
      // 6.3: hover, performed deliberately. The inspected cell follows the finger for as
      // long as it stays down, which is what keeps prediction anticipatory on a phone.
      this.phaseValue = GesturePhase.Sweeping;
      this.intents.push(GestureIntent.at(GestureKind.Sweep, x, y));
    }
  }

  public up(pointerId: number, x: number, y: number, timeMs: number): void {
    if (pointerId === this.secondaryId) {
      this.secondaryId = -1;
      // One finger lifted out of a pinch does not resume placing with the other: the
      // gesture is spent until the hand comes off the glass.
      this.phaseValue = this.primaryId < 0 ? GesturePhase.Idle : GesturePhase.Spent;
      return;
    }
    if (pointerId !== this.primaryId) {
      return;
    }
    this.primaryX = x;
    this.primaryY = y;
    const phase = this.phaseValue;
    this.primaryId = -1;
    if (phase === GesturePhase.Pending) {
      this.finishTap(x, y, timeMs);
    } else if (phase === GesturePhase.Dragging) {
      this.intents.push(GestureIntent.at(GestureKind.DragEnd, x, y));
    }
    // `Holding` and `Sweeping` already delivered their inspection, and both place nothing,
    // so lifting the finger ends them with no further intent.
    this.phaseValue = this.secondaryId < 0 ? GesturePhase.Idle : GesturePhase.Spent;
  }

  /**
   * The browser took the gesture over -- a back-swipe, a notification, a call.
   *
   * 6.2 makes this correctness rather than feel: the placement is discarded, because a
   * silent, uncommanded edit is worse than a lost gesture.
   */
  public cancel(pointerId: number, timeMs: number): void {
    void timeMs;
    if (pointerId !== this.primaryId && pointerId !== this.secondaryId) {
      return;
    }
    this.intents.push(GestureIntent.cancel());
    if (pointerId === this.primaryId) {
      this.primaryId = -1;
    } else {
      this.secondaryId = -1;
    }
    this.phaseValue =
      this.primaryId < 0 && this.secondaryId < 0 ? GesturePhase.Idle : GesturePhase.Spent;
  }

  /**
   * Advances the long-press hold. Called by the frame clock, and by tests with a chosen
   * millisecond, because the recognizer has no clock of its own (7.3).
   */
  public tick(timeMs: number): void {
    if (this.phaseValue !== GesturePhase.Pending) {
      return;
    }
    if (timeMs - this.startMs < GestureRecognizer.LONG_PRESS_MS) {
      return;
    }
    if (this.movedPastTapSlop()) {
      return;
    }
    this.phaseValue = GesturePhase.Holding;
    this.intents.push(GestureIntent.at(GestureKind.LongPress, this.primaryX, this.primaryY));
  }

  private finishTap(x: number, y: number, timeMs: number): void {
    if (this.movedPastTapSlop() || timeMs - this.startMs > GestureRecognizer.TAP_TIMEOUT_MS) {
      // Past the slop it was a drag that the caller has already been told about; past the
      // timeout but short of the long-press hold it is neither, and stays deliberately
      // silent rather than being guessed at.
      return;
    }
    if (this.isDoubleTap(x, y, timeMs)) {
      this.intents.push(GestureIntent.at(GestureKind.DoubleTap, x, y));
      // A third tap starts a fresh pair rather than firing a second fit.
      this.lastTapMs = -1;
      return;
    }
    this.intents.push(GestureIntent.at(GestureKind.Tap, x, y));
    this.lastTapX = x;
    this.lastTapY = y;
    this.lastTapMs = timeMs;
  }

  private isDoubleTap(x: number, y: number, timeMs: number): boolean {
    if (this.lastTapMs < 0) {
      return false;
    }
    if (timeMs - this.lastTapMs > GestureRecognizer.DOUBLE_TAP_MS) {
      return false;
    }
    const dx = x - this.lastTapX;
    const dy = y - this.lastTapY;
    return Math.sqrt(dx * dx + dy * dy) <= GestureRecognizer.DOUBLE_TAP_SLOP_PX;
  }

  private movedPastTapSlop(): boolean {
    const dx = this.primaryX - this.startX;
    const dy = this.primaryY - this.startY;
    return Math.sqrt(dx * dx + dy * dy) > GestureRecognizer.TAP_SLOP_PX;
  }

  private distanceBetweenPointers(): number {
    const dx = this.secondaryX - this.primaryX;
    const dy = this.secondaryY - this.primaryY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Pinch is a zoom and a two-finger drag is a pan, and a pinch is usually both at once. */
  private trackPinch(): void {
    const centreX = (this.primaryX + this.secondaryX) * 0.5;
    const centreY = (this.primaryY + this.secondaryY) * 0.5;
    const dx = centreX - this.pinchCentreX;
    const dy = centreY - this.pinchCentreY;
    if (dx !== 0 || dy !== 0) {
      this.intents.push(GestureIntent.pan(centreX, centreY, dx, dy));
    }
    this.pinchCentreX = centreX;
    this.pinchCentreY = centreY;

    const distance = this.distanceBetweenPointers();
    if (this.pinchDistance > 0 && distance > 0 && distance !== this.pinchDistance) {
      this.intents.push(GestureIntent.zoom(centreX, centreY, distance / this.pinchDistance));
    }
    this.pinchDistance = distance;
  }
}
