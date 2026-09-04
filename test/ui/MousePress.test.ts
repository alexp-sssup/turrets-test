import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { GestureRecognizer } from "../../src/ui/GestureRecognizer";
import { MousePress } from "../../src/ui/MousePress";

describe("MousePress (mouse-gestures spec 2)", () => {
  // 2.3: a press that does not move is a click, and the line is mobile UI spec 6.2's tap
  // slop so that a click and a tap draw it in the same place.
  it("calls a still press a click, at the same slop a tap uses", () => {
    assert.equal(MousePress.SLOP_PX, GestureRecognizer.TAP_SLOP_PX);

    const press = new MousePress();
    press.begin(100, 100, false);
    press.move(103, 104); // 5 px, inside the slop
    assert.equal(press.dragging, false);
    // The click acts where the button went down, not where it came up: a press released off
    // the canvas edge must not place a cell the tester never saw.
    assert.equal(press.startX, 100);
    assert.equal(press.startY, 100);
    assert.equal(press.end(), true);
  });

  // 2.3 again: there is no timeout, because the mouse has no long-press verb to be
  // separated from. A press held still for any length of time still places.
  it("has no timeout: the same still press is a click however many moves it takes", () => {
    const press = new MousePress();
    press.begin(50, 50, false);
    for (let i = 0; i < 200; i++) {
      press.move(50 + (i % 2), 50);
    }
    assert.equal(press.dragging, false);
    assert.equal(press.end(), true);
  });

  // 2.4: past the slop it is a pan, and no click action runs at all.
  it("becomes a drag past the slop, and then is not a click", () => {
    const press = new MousePress();
    press.begin(0, 0, false);
    press.move(20, 0);
    assert.equal(press.dragging, true);
    assert.equal(press.end(), false);
  });

  /**
   * The slop is measured from where the press began, not from the last move: a slow circle
   * back to the origin has already dragged the view, so calling it a click at the end would
   * place a block the tester never asked for.
   */
  it("stays a drag after wandering back to where it started", () => {
    const press = new MousePress();
    press.begin(0, 0, false);
    press.move(30, 0);
    press.move(0, 0);
    assert.equal(press.dragging, true);
    assert.equal(press.end(), false);
  });

  it("reports movement since the previous move, which is what a pan is applied from", () => {
    const press = new MousePress();
    press.begin(10, 10, false);
    press.move(40, 10);
    assert.equal(press.deltaX, 30);
    assert.equal(press.deltaY, 0);
    press.move(40, 25);
    assert.equal(press.deltaX, 0);
    assert.equal(press.deltaY, 15);
  });

  // 2.5: shift, middle and right are a drag from the moment they begin, so they pan without
  // waiting for the slop and never place even if the hand is perfectly still.
  it("treats a modifier press as a drag from the first pixel", () => {
    const press = new MousePress();
    press.begin(0, 0, true);
    assert.equal(press.dragging, true);
    press.move(1, 0);
    assert.equal(press.deltaX, 1);
    assert.equal(press.end(), false);
  });

  it("is not a click when no press was in flight, so a stray up does nothing", () => {
    const press = new MousePress();
    assert.equal(press.end(), false);

    press.begin(0, 0, false);
    assert.equal(press.end(), true);
    assert.equal(press.end(), false, "the press is spent, and cannot fire a second click");
  });

  it("cancels: the browser took the gesture and nothing happened", () => {
    const press = new MousePress();
    press.begin(0, 0, false);
    press.cancel();
    assert.equal(press.active, false);
    assert.equal(press.end(), false);
  });

  it("ignores a move it never saw a press for", () => {
    const press = new MousePress();
    press.move(500, 500);
    assert.equal(press.dragging, false);
    assert.equal(press.deltaX, 0);
  });
});
