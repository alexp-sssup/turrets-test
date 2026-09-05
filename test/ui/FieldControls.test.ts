import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ViewMode } from "../../src/render/ViewMode";
import { OverlayMode } from "../../src/render/ViewState";
import { FieldControls } from "../../src/ui/FieldControls";
import { ShellState } from "../../src/ui/ShellState";

function stateWithSlices(count: number, stepper: boolean): ShellState {
  const state = new ShellState();
  const counts: number[] = [];
  for (let i = 0; i < count; i++) {
    counts.push(i === 1 ? 0 : 12);
  }
  state.sliceMin = 0;
  state.sliceMax = count - 1;
  state.sliceCounts = counts;
  state.slice = 0;
  state.useSliceStepper = stepper;
  state.overlay = OverlayMode.Stress;
  return state;
}

describe("FieldControls", () => {
  /**
   * Mobile UI spec 6.4: the hints are generated from one table so a binding cannot drift
   * from its caption. This pins that they come from the table rather than from two
   * hand-written strings that happen to agree today.
   */
  it("builds each pointer kind's caption from the one hint table (mobile UI spec 6.4)", () => {
    const fine = FieldControls.caption(false);
    const coarse = FieldControls.caption(true);

    assert.ok(fine.indexOf("click a face to build on it") >= 0);
    assert.ok(fine.indexOf("wheel to zoom") >= 0);
    // The key it names is drawn as a key cap, and only because the table has that binding.
    assert.ok(fine.indexOf("<kbd>[ ]</kbd> cross-section") >= 0);
    assert.equal(fine.indexOf("<kbd>wheel"), -1);

    // 6.3: a finger has no hover and no alt key, so the coarse caption says neither.
    assert.equal(coarse.indexOf("alt-click"), -1);
    assert.equal(coarse.indexOf("wheel"), -1);
    assert.ok(coarse.indexOf("pinch to zoom") >= 0);
    assert.ok(coarse.indexOf("long-press to inspect, drag to sweep") >= 0);
    assert.ok(coarse.indexOf("double-tap to fit") >= 0);
  });

  it("gives every hint phrase back through the same table the caption reads", () => {
    assert.equal(FieldControls.hintFor("zoom", false), "wheel to zoom");
    assert.equal(FieldControls.hintFor("zoom", true), "pinch to zoom");
    assert.equal(FieldControls.hintFor("nothing-is-bound-to-this", true), "");
  });

  /**
   * Touch-gestures spec 2 and 5. The caption is what a tester is told the canvas does, so
   * it is where the rule that a one-finger drag pans is pinned: the coarse column must not
   * promise a rectangle, and it must say that a plain drag pans.
   */
  it("promises a pan and no rectangle on a coarse pointer (touch-gestures spec 5)", () => {
    assert.equal(FieldControls.hintFor("place", true), "tap a face to build on it");
    assert.equal(FieldControls.hintFor("pan", true), "drag to pan, or two fingers");

    const coarse = FieldControls.caption(true);
    assert.equal(coarse.indexOf("rectangle"), -1, "a finger cannot place one (2.1)");
    assert.ok(coarse.indexOf("tap a face to build on it") >= 0);
    assert.ok(coarse.indexOf("drag to pan") >= 0);
  });

  /**
   * Mouse-gestures spec 2.1 and 4: the rectangle is gone from the mouse too, so neither
   * column may promise one and both say the same two things in their own words.
   */
  it("promises a click and no rectangle on a fine pointer (mouse-gestures spec 4)", () => {
    assert.equal(FieldControls.hintFor("place", false), "click a face to build on it");
    assert.equal(FieldControls.hintFor("pan", false), "drag to pan, or shift-drag");

    const fine = FieldControls.caption(false);
    assert.equal(fine.indexOf("rectangle"), -1, "no pointer places one (2.1)");
    assert.ok(fine.indexOf("drag to pan") >= 0);
    // 2.6: alt-click still inspects. The caption draws the binding as a key cap, which is
    // 6.4's rule and the reason this asserts the phrase through the table.
    assert.equal(FieldControls.hintFor("inspect", false), "alt-click to inspect");
    assert.ok(fine.indexOf("<kbd>alt-click</kbd> to inspect") >= 0);
  });

  /**
   * 3.2: a coarse pointer does not remove the keyboard shortcuts. The table still carries
   * every binding, and the control bar's buttons take their chips from it.
   */
  it("keeps every keyboard binding in the table on a coarse pointer (mobile UI spec 3.2)", () => {
    assert.equal(FieldControls.keyFor("overlay"), "1–5");
    assert.equal(FieldControls.keyFor("cross-section"), "[ ]");
    assert.equal(FieldControls.keyFor("undo"), "z");
    assert.equal(FieldControls.keyFor("redo"), "y");
    assert.equal(FieldControls.keyFor("pause"), "space");
    assert.equal(FieldControls.keyFor("frame step"), ", .");
    assert.equal(FieldControls.keyFor("deselect"), "escape");
    assert.equal(FieldControls.keyFor("yaw-left"), "q");
    assert.equal(FieldControls.keyFor("yaw-right"), "e");
  });

  /**
   * Isometric renderer spec 9: one new verb, two buttons, and a compass that names the yaw
   * that is *on* rather than the one a press would reach.
   */
  it("puts the compass and both quarter turns on screen", () => {
    const state = stateWithSlices(4, false);
    const html = FieldControls.render(state);
    assert.ok(html.indexOf('data-action="yaw" data-value="1"') >= 0);
    assert.ok(html.indexOf('data-action="yaw" data-value="-1"') >= 0);
    assert.ok(html.indexOf("yaw-readout") >= 0);
    assert.equal(html.indexOf('data-action="view-mode"'), -1, "there is no mode to toggle");

    // Four yaws, four compass faces, so the readout is never ambiguous about which is on.
    const faces: string[] = [];
    for (let yaw = 0; yaw < 4; yaw++) {
      state.yaw = yaw;
      const rendered = FieldControls.render(state);
      const at = rendered.indexOf('class="yaw-readout"');
      faces.push(rendered.substring(at, at + 60));
    }
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        assert.notEqual(faces[i], faces[j]);
      }
    }

    // The caption is built from the same row, so the binding cannot drift from its caption.
    assert.ok(FieldControls.caption(false).indexOf("<kbd>q</kbd> e turn the camera") >= 0);
    assert.equal(FieldControls.caption(true).indexOf("<kbd>"), -1);
  });

  /**
   * Isometric renderer spec 6: a cutaway a tester has not noticed reads as a missing wall,
   * so the section readout says how many sections the peel has taken off the front.
   */
  it("names the peel in the section readout, and only when something is peeled", () => {
    const stepper = stateWithSlices(48, true);
    stepper.slice = 3;
    stepper.peeling = false;
    stepper.peeledSections = 3;
    assert.equal(FieldControls.sliceControl(stepper).indexOf("peeled"), -1, "solid turret, no note");

    stepper.peeling = true;
    assert.ok(FieldControls.sliceControl(stepper).indexOf("x = 3 · 12 blocks · 3 peeled") >= 0);

    // Nothing in front of the reach plane is nothing to say.
    stepper.peeledSections = 0;
    assert.equal(FieldControls.sliceControl(stepper).indexOf("peeled"), -1);

    // The flat dev view has no peel at all.
    stepper.peeledSections = 2;
    stepper.viewMode = ViewMode.Flat;
    assert.equal(FieldControls.sliceControl(stepper).indexOf("peeled"), -1);

    // The strip carries the same note, from the same helper.
    const strip = stateWithSlices(4, false);
    strip.peeling = true;
    strip.peeledSections = 2;
    assert.ok(FieldControls.sliceControl(strip).indexOf("2 peeled") >= 0);
  });

  /** 4.5: the stepper replaces the strip on a width question, not a device question. */
  it("draws the per-column strip while it fits and the stepper when it does not", () => {
    const strip = FieldControls.sliceControl(stateWithSlices(4, false));
    assert.ok(strip.indexOf("slice-strip") >= 0);
    assert.equal(strip.indexOf("slice-stepper"), -1);

    const stepper = FieldControls.sliceControl(stateWithSlices(48, true));
    assert.ok(stepper.indexOf("slice-stepper") >= 0);
    assert.ok(stepper.indexOf('data-action="slice-step" data-value="-1"') >= 0);
    assert.ok(stepper.indexOf('data-action="slice-step" data-value="1"') >= 0);
    assert.ok(stepper.indexOf("x = 0 · 12 blocks") >= 0);
  });

  /**
   * 6.2: the readout opens a full picker listing every cross-section with its block count,
   * so the strip's "an empty section reads as empty" property survives the shrink.
   */
  it("lists every cross-section with its block count in the picker, empties marked", () => {
    const state = stateWithSlices(4, true);
    state.slicePickerOpen = true;
    const html = FieldControls.render(state);

    assert.ok(html.indexOf("slice-picker") >= 0);
    assert.ok(html.indexOf('data-action="slice" data-value="3"') >= 0);
    // Slice 1 is the empty one, and it is listed rather than omitted.
    assert.ok(html.indexOf('class=" empty" data-action="slice" data-value="1"') >= 0);
    assert.ok(html.indexOf("0 blocks") >= 0);
  });

  /** 6.1: every verb reachable without a keyboard. */
  it("puts the transport, undo/redo and the overlays on screen (mobile UI spec 6.1)", () => {
    const state = stateWithSlices(48, true);
    state.inDesign = true;
    state.canUndo = true;
    state.attemptOpen = true;
    state.paused = true;
    const html = FieldControls.render(state);

    for (let i = 1; i <= 5; i++) {
      assert.ok(html.indexOf('data-action="overlay" data-value="' + i.toString() + '"') >= 0);
    }
    assert.ok(html.indexOf('data-action="undo"') >= 0);
    assert.ok(html.indexOf('data-action="redo"') >= 0);
    assert.ok(html.indexOf('data-action="frame-back"') >= 0);
    assert.ok(html.indexOf('data-action="frame-forward"') >= 0);
    assert.ok(html.indexOf('data-action="pause"') >= 0);
    assert.ok(html.indexOf('data-action="fit"') >= 0);
    // Paused, the transport offers the way out of being paused.
    assert.ok(html.indexOf(">play</button>") >= 0);
  });

  /** 8.4: the screen's one action is reachable with the panel sheet collapsed. */
  it("keeps the screen's primary action out of the sheet (mobile UI spec 8.4)", () => {
    const state = stateWithSlices(4, false);
    state.compact = true;
    state.primaryLabel = "start wave 1";
    state.primaryAction = "start";
    const html = FieldControls.render(state);

    assert.ok(html.indexOf('data-action="start"') >= 0);
    assert.ok(html.indexOf("start wave 1") >= 0);

    // `Medium` still docks the panel that already carries this button (4.5), so the bar
    // does not print a second copy of it.
    state.compact = false;
    assert.equal(FieldControls.render(state).indexOf('data-action="start"'), -1);
  });

  /**
   * 4.2: the dev readout collapses to a chip showing the worse of solver p95 and render
   * p95, and it stays on by default -- a tester's "it stuttered" has to arrive with
   * numbers, which is stronger on a phone, not weaker.
   */
  it("always shows the dev chip, and shows the worse of the two p95s", () => {
    const state = stateWithSlices(4, false);
    state.solverP95 = 41.5;
    state.renderP95 = 9;
    assert.ok(FieldControls.render(state).indexOf("solver p95 41.5 ms") >= 0);

    state.solverP95 = 4;
    state.renderP95 = 18.25;
    assert.ok(FieldControls.render(state).indexOf("render p95 18.3 ms") >= 0);
  });

  /** 8.3: the solver gets 32 ms on a phone against the desktop's 16, and render gets 16. */
  it("warns against the mobile budget on a coarse pointer (mobile UI spec 8.3)", () => {
    const state = stateWithSlices(4, false);
    state.solverP95 = 24;
    state.renderP95 = 1;

    state.coarse = false;
    assert.ok(FieldControls.render(state).indexOf('class="dev-chip warn"') >= 0);

    state.coarse = true;
    assert.equal(FieldControls.render(state).indexOf('class="dev-chip warn"'), -1);

    state.solverP95 = 33;
    assert.ok(FieldControls.render(state).indexOf('class="dev-chip warn"') >= 0);
  });
});
