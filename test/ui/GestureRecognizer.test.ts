import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { approxEqual } from "../../src/core/Numeric";
import { GestureIntent, GestureKind } from "../../src/ui/GestureIntent";
import { GesturePhase, GestureRecognizer } from "../../src/ui/GestureRecognizer";

/**
 * Every row of the mobile UI spec 6.2 gesture table, every threshold at and either side of
 * its value, and the two cancellation rules asserted as *no placement emitted* (7.3).
 *
 * The recognizer takes plain numbers, so none of this needs a browser: the millisecond a
 * long press fires on is an argument here, not a wall clock.
 */

function kinds(intents: readonly GestureIntent[]): readonly GestureKind[] {
  const found: GestureKind[] = [];
  for (let i = 0; i < intents.length; i++) {
    found.push(intents[i].kind);
  }
  return found;
}

function has(intents: readonly GestureIntent[], kind: GestureKind): boolean {
  for (let i = 0; i < intents.length; i++) {
    if (intents[i].kind === kind) {
      return true;
    }
  }
  return false;
}

/** The one-finger tap of 6.2: down and up, inside the slop and inside the timeout. */
function tap(recognizer: GestureRecognizer, x: number, y: number, atMs: number): void {
  recognizer.down(1, x, y, atMs);
  recognizer.up(1, x, y, atMs + 40);
}

describe("GestureRecognizer", () => {
  it("recognizes a one-finger tap (mobile UI spec 6.2)", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 100, 100, 0);
    recognizer.up(1, 100, 100, 100);

    const intents = recognizer.drain();
    assert.deepEqual(kinds(intents), [GestureKind.Tap]);
    assert.equal(intents[0].x, 100);
    assert.equal(intents[0].y, 100);
    assert.equal(recognizer.phase, GesturePhase.Idle);
  });

  it("recognizes a one-finger drag as start, moves and end (mobile UI spec 6.2)", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 10, 10, 0);
    recognizer.move(1, 40, 10, 30);
    recognizer.move(1, 70, 10, 60);
    recognizer.up(1, 70, 10, 90);

    assert.deepEqual(kinds(recognizer.drain()), [
      GestureKind.DragStart,
      GestureKind.DragMove,
      GestureKind.DragMove,
      GestureKind.DragEnd,
    ]);
  });

  it("starts the drag at the pointer's origin, not at the point that broke the slop", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 10, 10, 0);
    recognizer.move(1, 40, 10, 30);

    const intents = recognizer.drain();
    assert.equal(intents[0].kind, GestureKind.DragStart);
    assert.equal(intents[0].x, 10);
    assert.equal(intents[0].y, 10);
  });

  it("recognizes a long press and places nothing (mobile UI spec 6.2)", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 50, 50, 0);
    recognizer.tick(400);
    recognizer.up(1, 50, 50, 500);

    const intents = recognizer.drain();
    assert.deepEqual(kinds(intents), [GestureKind.LongPress]);
    assert.equal(has(intents, GestureKind.Tap), false);
    assert.equal(has(intents, GestureKind.DragStart), false);
  });

  it("sweeps the inspected cell when a long press then drags (mobile UI spec 6.3)", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 50, 50, 0);
    recognizer.tick(400);
    recognizer.move(1, 62, 50, 420);
    recognizer.move(1, 74, 50, 440);
    recognizer.up(1, 74, 50, 460);

    const intents = recognizer.drain();
    assert.deepEqual(kinds(intents), [
      GestureKind.LongPress,
      GestureKind.Sweep,
      GestureKind.Sweep,
    ]);
    // A sweep is an inspection, so it must never turn into a placement on the way out.
    assert.equal(has(intents, GestureKind.DragStart), false);
    assert.equal(has(intents, GestureKind.DragEnd), false);
    assert.equal(intents[2].x, 74);
  });

  it("recognizes a two-finger drag as a pan (mobile UI spec 6.2)", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 100, 100, 0);
    recognizer.down(2, 200, 100, 10);
    recognizer.drain();

    // Both fingers move twenty pixels right: the centroid moves twenty, the span comes back
    // to where it started. Pointer events arrive one finger at a time, so the span wobbles
    // in between and the zoom has to come out at exactly one over the pair of them.
    recognizer.move(1, 120, 100, 20);
    recognizer.move(2, 220, 100, 20);

    const intents = recognizer.drain();
    assert.equal(has(intents, GestureKind.Pan), true);
    let dx = 0;
    let scale = 1;
    for (let i = 0; i < intents.length; i++) {
      dx += intents[i].kind === GestureKind.Pan ? intents[i].dx : 0;
      scale *= intents[i].kind === GestureKind.Zoom ? intents[i].scale : 1;
    }
    assert.equal(dx, 20);
    assert.equal(approxEqual(scale, 1), true);
  });

  it("recognizes a pinch as a zoom by the ratio of the span (mobile UI spec 6.2)", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 100, 100, 0);
    recognizer.down(2, 200, 100, 10);
    recognizer.drain();

    // The span doubles from 100 px to 200 px about the same centre.
    recognizer.move(1, 50, 100, 20);
    recognizer.move(2, 250, 100, 20);

    const intents = recognizer.drain();
    let scale = 1;
    for (let i = 0; i < intents.length; i++) {
      scale *= intents[i].kind === GestureKind.Zoom ? intents[i].scale : 1;
    }
    assert.equal(scale, 2);
  });

  it("recognizes a double tap (mobile UI spec 6.2)", () => {
    const recognizer = new GestureRecognizer();
    tap(recognizer, 100, 100, 0);
    tap(recognizer, 100, 100, 200);

    assert.deepEqual(kinds(recognizer.drain()), [GestureKind.Tap, GestureKind.DoubleTap]);
  });

  it("does not chain a third tap into a second double tap", () => {
    const recognizer = new GestureRecognizer();
    tap(recognizer, 100, 100, 0);
    tap(recognizer, 100, 100, 200);
    tap(recognizer, 100, 100, 400);

    assert.deepEqual(kinds(recognizer.drain()), [
      GestureKind.Tap,
      GestureKind.DoubleTap,
      GestureKind.Tap,
    ]);
  });

  // ------------------------------------------------------------ thresholds

  it("holds the tap slop at 8 CSS px, at and either side of it (mobile UI spec 6.2)", () => {
    assert.equal(GestureRecognizer.TAP_SLOP_PX, 8);

    const atSlop = new GestureRecognizer();
    atSlop.down(1, 0, 0, 0);
    atSlop.move(1, 8, 0, 20);
    atSlop.up(1, 8, 0, 40);
    assert.deepEqual(kinds(atSlop.drain()), [GestureKind.Tap]);

    const pastSlop = new GestureRecognizer();
    pastSlop.down(1, 0, 0, 0);
    pastSlop.move(1, 9, 0, 20);
    pastSlop.up(1, 9, 0, 40);
    assert.deepEqual(kinds(pastSlop.drain()), [
      GestureKind.DragStart,
      GestureKind.DragMove,
      GestureKind.DragEnd,
    ]);
  });

  it("holds the tap timeout at 250 ms, at and either side of it (mobile UI spec 6.2)", () => {
    assert.equal(GestureRecognizer.TAP_TIMEOUT_MS, 250);

    const atTimeout = new GestureRecognizer();
    atTimeout.down(1, 0, 0, 0);
    atTimeout.up(1, 0, 0, 250);
    assert.deepEqual(kinds(atTimeout.drain()), [GestureKind.Tap]);

    // Past the timeout and short of the long-press hold is neither verb, and the
    // recognizer stays silent rather than guessing which one the tester meant.
    const pastTimeout = new GestureRecognizer();
    pastTimeout.down(1, 0, 0, 0);
    pastTimeout.up(1, 0, 0, 251);
    assert.deepEqual(kinds(pastTimeout.drain()), []);
  });

  it("holds the long-press hold at 400 ms, at and either side of it (mobile UI spec 6.2)", () => {
    assert.equal(GestureRecognizer.LONG_PRESS_MS, 400);

    const justShort = new GestureRecognizer();
    justShort.down(1, 0, 0, 0);
    justShort.tick(399);
    assert.deepEqual(kinds(justShort.drain()), []);
    justShort.tick(400);
    assert.deepEqual(kinds(justShort.drain()), [GestureKind.LongPress]);

    // "within tap slop": a finger that has already wandered is dragging, not holding.
    const wandered = new GestureRecognizer();
    wandered.down(1, 0, 0, 0);
    wandered.move(1, 30, 0, 100);
    wandered.drain();
    wandered.tick(500);
    assert.deepEqual(kinds(wandered.drain()), []);
  });

  it("holds the double-tap window at 300 ms and 24 px (mobile UI spec 6.2)", () => {
    assert.equal(GestureRecognizer.DOUBLE_TAP_MS, 300);
    assert.equal(GestureRecognizer.DOUBLE_TAP_SLOP_PX, 24);

    // The window is measured between the two taps' up events, which the helper puts at
    // `atMs + 40`; 40 and 340 are 300 ms apart.
    const atWindow = new GestureRecognizer();
    tap(atWindow, 0, 0, 0);
    tap(atWindow, 0, 0, 300);
    assert.deepEqual(kinds(atWindow.drain()), [GestureKind.Tap, GestureKind.DoubleTap]);

    const pastWindow = new GestureRecognizer();
    tap(pastWindow, 0, 0, 0);
    tap(pastWindow, 0, 0, 301);
    assert.deepEqual(kinds(pastWindow.drain()), [GestureKind.Tap, GestureKind.Tap]);

    const atSlop = new GestureRecognizer();
    tap(atSlop, 0, 0, 0);
    tap(atSlop, 24, 0, 100);
    assert.deepEqual(kinds(atSlop.drain()), [GestureKind.Tap, GestureKind.DoubleTap]);

    const pastSlop = new GestureRecognizer();
    tap(pastSlop, 0, 0, 0);
    tap(pastSlop, 25, 0, 100);
    assert.deepEqual(kinds(pastSlop.drain()), [GestureKind.Tap, GestureKind.Tap]);
  });

  it("enters a pinch on the second pointer down (mobile UI spec 6.2)", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 100, 100, 0);
    assert.equal(recognizer.phase, GesturePhase.Pending);
    recognizer.down(2, 200, 100, 10);
    assert.equal(recognizer.phase, GesturePhase.Pinching);
  });

  // ------------------------------------------------------------ cancellation

  /**
   * 6.2, stated as correctness rather than feel: a tester zooming in to look at a joint
   * must not find a rectangle of stone where they put their fingers.
   */
  it("cancels an in-progress placement when a drag becomes a pinch, emitting no placement", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 10, 10, 0);
    recognizer.move(1, 60, 10, 30);
    recognizer.down(2, 200, 100, 40);
    recognizer.move(1, 90, 10, 60);
    recognizer.up(1, 90, 10, 90);
    recognizer.up(2, 200, 100, 100);

    const intents = recognizer.drain();
    assert.equal(has(intents, GestureKind.Cancel), true);
    // The drag started before the second finger, so `DragStart` is on the log -- what must
    // not be is anything that commits it.
    assert.equal(has(intents, GestureKind.DragEnd), false);
    assert.equal(has(intents, GestureKind.Tap), false);
    // The cancel arrives before any further movement is reported.
    assert.equal(kinds(intents).indexOf(GestureKind.Cancel), 2);
    assert.equal(recognizer.phase, GesturePhase.Idle);
  });

  it("cancels a pending tap that becomes a pinch, emitting no placement", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 10, 10, 0);
    recognizer.down(2, 200, 100, 20);
    recognizer.up(1, 10, 10, 60);
    recognizer.up(2, 200, 100, 70);

    const intents = recognizer.drain();
    assert.deepEqual(kinds(intents), [GestureKind.Cancel]);
    assert.equal(has(intents, GestureKind.Tap), false);
  });

  it("does not let the finger left on the glass resume placing after a pinch", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 100, 100, 0);
    recognizer.down(2, 200, 100, 10);
    recognizer.up(2, 200, 100, 20);
    recognizer.drain();

    recognizer.move(1, 130, 100, 30);
    recognizer.up(1, 130, 100, 40);
    assert.deepEqual(kinds(recognizer.drain()), []);
    assert.equal(recognizer.phase, GesturePhase.Idle);
  });

  /** 6.2: a silent, uncommanded edit is worse than a lost gesture. */
  it("discards the placement on pointercancel, emitting no placement", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 10, 10, 0);
    recognizer.move(1, 60, 10, 30);
    recognizer.cancel(1, 40);

    const intents = recognizer.drain();
    assert.equal(has(intents, GestureKind.Cancel), true);
    assert.equal(has(intents, GestureKind.DragEnd), false);
    assert.equal(has(intents, GestureKind.Tap), false);
    assert.equal(recognizer.phase, GesturePhase.Idle);
  });

  it("discards a pending tap on pointercancel too", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 10, 10, 0);
    recognizer.cancel(1, 40);

    assert.deepEqual(kinds(recognizer.drain()), [GestureKind.Cancel]);
  });

  it("ignores a third finger, since multi-touch focus fire is out of scope (§11)", () => {
    const recognizer = new GestureRecognizer();
    recognizer.down(1, 100, 100, 0);
    recognizer.down(2, 200, 100, 10);
    recognizer.drain();

    recognizer.down(3, 150, 200, 20);
    recognizer.move(3, 150, 260, 30);
    assert.deepEqual(kinds(recognizer.drain()), []);
    assert.equal(recognizer.phase, GesturePhase.Pinching);
  });
});
