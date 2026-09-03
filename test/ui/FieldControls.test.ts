import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
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

    assert.ok(fine.indexOf("drag to place") >= 0);
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
