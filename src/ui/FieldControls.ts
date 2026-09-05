import { ViewMode } from "../render/ViewMode";
import { OVERLAY_COUNT, OverlayMode, overlayName } from "../render/ViewState";
import { Dom } from "./Dom";
import { ShellState } from "./ShellState";

/**
 * One row of the verb table behind mobile UI spec 6.1 and 6.4.
 *
 * 6.4 asks for the hints to be "generated from one table so a binding cannot drift from its
 * caption", and this is that table's row type: the verb, the key that fires it, and how the
 * caption describes it to each pointer kind. The control bar's buttons take their keyboard
 * chips from the same rows the caption is built from, so there is one place to change when
 * a binding moves.
 */
export class InputHint {
  public readonly verb: string;
  /** The keyboard binding, as the shell prints it. Empty when the verb has none. */
  public readonly keyboard: string;
  /** How the field caption says it on a fine pointer. Empty to leave it out of the caption. */
  public readonly fine: string;
  /** How the field caption says it on a coarse pointer. */
  public readonly coarse: string;

  public constructor(verb: string, keyboard: string, fine: string, coarse: string) {
    this.verb = verb;
    this.keyboard = keyboard;
    this.fine = fine;
    this.coarse = coarse;
  }
}

/**
 * The field control bar (mobile UI spec 4.2, 6.1).
 *
 * Pinned to the field's bottom edge, **where a thumb is, rather than the top of the screen,
 * where it is not**. Its job is 6.1's one hard requirement: every verb reachable without a
 * keyboard. Nothing is *moved* off the keyboard -- the bindings all keep working and this
 * bar is added alongside them, because a tester on a tablet with a keyboard case is one
 * person with two hands (3.2).
 *
 * Every control here is padded to a 44 x 44 CSS px target on a coarse pointer (8.1); the
 * padding is in the stylesheet, keyed on `data-pointer`, so the markup is the same markup
 * a mouse gets.
 */
export class FieldControls {
  /**
   * The one table of 6.4. The `fine` column is today's caption, unchanged, and the `coarse`
   * column is the 6.2 gesture set.
   *
   * The note box of 6.1's last row has no entry: §7.4 note capture was cut from this build
   * (see `AttemptExport`), so there is no verb to put on screen. When it lands it gets a
   * row here and a button in the dev chip, and the caption follows from the row.
   */
  public static readonly HINTS: readonly InputHint[] = [
    // Mouse-gestures spec 4: one gesture model on both pointers. Placement is single-cell
    // and a drag pans, so neither column promises a rectangle any more. Face-placement spec
    // 2.1: it lands against the face it was aimed at, so the copy says which face -- it is
    // the only place the rule is written down where a tester will read it.
    new InputHint("place", "", "click a face to build on it", "tap a face to build on it"),
    new InputHint("inspect", "alt-click", "alt-click to inspect", "long-press to inspect, drag to sweep"),
    new InputHint("pan", "", "drag to pan, or shift-drag", "drag to pan, or two fingers"),
    new InputHint("zoom", "", "wheel to zoom", "pinch to zoom"),
    new InputHint("fit", "", "", "double-tap to fit"),
    new InputHint("overlay", "1–5", "1–5 overlays", "overlay row below"),
    new InputHint("cross-section", "[ ]", "[ ] cross-section", "slice stepper below"),
    // Isometric renderer spec 9: one new verb. `[` and `]` move the reach plane, and the
    // peel follows it rather than sitting beside it (face-placement spec 3.2).
    new InputHint("yaw-left", "q", "q e turn the camera", "compass below"),
    new InputHint("yaw-right", "e", "", ""),
    new InputHint("undo", "z", "", ""),
    new InputHint("redo", "y", "", ""),
    new InputHint("pause", "space", "", ""),
    new InputHint("frame step", ", .", "", ""),
    new InputHint("deselect", "escape", "", ""),
  ];

  /**
   * The field caption, for the pointer that arrived with the viewport (6.4).
   *
   * Returns markup rather than text so a key named in a phrase is drawn as a key cap -- and
   * it is drawn from the row's own `keyboard` column, so a caption cannot show a chip for a
   * binding the table does not have.
   */
  public static caption(coarse: boolean): string {
    let html = "";
    for (let i = 0; i < FieldControls.HINTS.length; i++) {
      const hint = FieldControls.HINTS[i];
      const phrase = coarse ? hint.coarse : hint.fine;
      if (phrase.length === 0) {
        continue;
      }
      html += (html.length > 0 ? " · " : "") + FieldControls.withKeyCaps(hint, phrase);
    }
    return html;
  }

  private static withKeyCaps(hint: InputHint, phrase: string): string {
    const key = hint.keyboard;
    const at = key.length === 0 ? -1 : phrase.indexOf(key);
    if (at < 0) {
      return Dom.escape(phrase);
    }
    return (
      Dom.escape(phrase.substring(0, at)) +
      "<kbd>" +
      Dom.escape(key) +
      "</kbd>" +
      Dom.escape(phrase.substring(at + key.length))
    );
  }

  /** How the caption describes one verb to one pointer kind. Same table, same words. */
  public static hintFor(verb: string, coarse: boolean): string {
    for (let i = 0; i < FieldControls.HINTS.length; i++) {
      if (FieldControls.HINTS[i].verb === verb) {
        return coarse ? FieldControls.HINTS[i].coarse : FieldControls.HINTS[i].fine;
      }
    }
    return "";
  }

  /** The key a verb is bound to, taken from the same table the caption is built from. */
  public static keyFor(verb: string): string {
    for (let i = 0; i < FieldControls.HINTS.length; i++) {
      if (FieldControls.HINTS[i].verb === verb) {
        return FieldControls.HINTS[i].keyboard;
      }
    }
    return "";
  }

  /**
   * The bar itself, in the priority order of 4.1.
   *
   * The overlay switcher, the cross-section and the transport share one horizontally
   * scrollable row rather than stacking, and the dev chip rides at its end. Three stacked
   * rows of 44 px targets is a third of a phone's height, and 4.1 ranks the cross-section
   * above every one of them: when space runs out it is spent from the bottom of that list
   * up, and this is what spending it looks like.
   */
  public static render(state: ShellState): string {
    return (
      '<div class="field-bar">' +
      FieldControls.primary(state) +
      '<div class="field-row control-row">' +
      FieldControls.overlayRow(state) +
      FieldControls.transportRow(state) +
      "</div>" +
      "</div>" +
      FieldControls.slicePicker(state)
    );
  }

  /**
   * The one action the current screen is for, kept out of the sheet (8.4).
   *
   * "Start wave 1 is reachable with the panel sheet collapsed. A tester whose first action
   * is behind a tab has been put in the editor, which is the thing §7.2 exists to prevent."
   */
  private static primary(state: ShellState): string {
    // `Medium` still docks the panels, so its primary button is already on screen and a
    // second copy of it would be noise. This row exists for the layout that hides panels.
    if (!state.compact || state.primaryAction.length === 0) {
      return "";
    }
    return (
      '<div class="field-row primary-row"><button class="field-primary" data-action="' +
      Dom.escape(state.primaryAction) +
      '">' +
      Dom.escape(state.primaryLabel) +
      "</button></div>"
    );
  }

  /**
   * 6.1: overlays 1-5, **the active one named**. The keys keep working alongside it.
   *
   * On `Compact` the four that are not active are their number and nothing else, which is
   * what 6.1 asks for and what leaves room in one row for the transport beside them. Every
   * one of them is still a 44 px target (8.1), and the name of the one that is on is the
   * only name a tester needs while they are looking at it.
   */
  private static overlayRow(state: ShellState): string {
    let html = '<span class="overlay-group">';
    for (let i = 1; i <= OVERLAY_COUNT; i++) {
      const mode = i as OverlayMode;
      const active = mode === state.overlay;
      html +=
        '<button class="field-key' +
        (active ? " active" : "") +
        '" data-action="overlay" data-value="' +
        i.toString() +
        '"><span class="key">' +
        i.toString() +
        '</span><span class="field-key-name">' +
        Dom.escape(overlayName(mode)) +
        "</span></button>";
    }
    html += "</span>";
    return html;
  }

  /** Transport, cross-section and the editor's undo pair: 6.1's table, minus the keyboard. */
  private static transportRow(state: ShellState): string {
    let html = '<span class="transport-group">';
    html += FieldControls.sliceControl(state);
    if (state.inDesign) {
      html +=
        '<button class="field-button" data-action="undo"' +
        (state.canUndo ? "" : " disabled") +
        ' title="' +
        FieldControls.keyFor("undo") +
        '">undo</button>' +
        '<button class="field-button" data-action="redo"' +
        (state.canRedo ? "" : " disabled") +
        ' title="' +
        FieldControls.keyFor("redo") +
        '">redo</button>';
    }
    if (state.attemptOpen) {
      // 6.1: the frame steppers sit beside the scrub bar, and the scrub bar rides in the
      // same row rather than claiming one of its own -- another 44 px row here is 44 px off
      // the cross-section, and 4.1 does not rank the transport above the field.
      html +=
        '<button class="field-button" data-action="frame-back" title="' +
        FieldControls.keyFor("frame step") +
        '">◀◀</button>' +
        FieldControls.scrub(state) +
        '<button class="field-button" data-action="frame-forward" title="' +
        FieldControls.keyFor("frame step") +
        '">▶▶</button>' +
        '<button class="field-button" data-action="pause" title="' +
        FieldControls.keyFor("pause") +
        '">' +
        (state.paused ? "play" : "pause") +
        "</button>";
    }
    html += FieldControls.yawControl(state);
    html += '<button class="field-button" data-action="fit">fit</button>';
    html += FieldControls.devChip(state);
    html += "</span>";
    return html;
  }

  /**
   * The compass: which way the camera faces, and a quarter turn either way (isometric
   * renderer spec 9).
   *
   * Four states and two buttons. It names the yaw that is *on* rather than the one a press
   * would reach, for the reason 6.1 gives the overlay row: a control that names a state the
   * tester cannot see is a control they have to press in order to read.
   */
  public static yawControl(state: ShellState): string {
    return (
      '<span class="yaw-control">' +
      '<button class="field-button" data-action="yaw" data-value="1" title="' +
      FieldControls.keyFor("yaw-left") +
      '">↺</button>' +
      '<span class="yaw-readout" title="camera">' +
      Dom.escape(FieldControls.COMPASS[state.yaw % 4]) +
      "</span>" +
      '<button class="field-button" data-action="yaw" data-value="-1" title="' +
      FieldControls.keyFor("yaw-right") +
      '">↻</button>' +
      "</span>"
    );
  }

  /** The four yaws, as the corner of the pad the camera is looking from. */
  private static readonly COMPASS: readonly string[] = ["◤", "◥", "◢", "◣"];

  private static scrub(state: ShellState): string {
    if (!state.showScrub) {
      return "";
    }
    return (
      '<input class="field-scrub" type="range" min="0" max="' +
      Math.max(0, state.scrubCount - 1).toString() +
      '" value="' +
      state.scrubIndex.toString() +
      '" data-input="scrub" />'
    );
  }

  /**
   * The cross-section control: the per-column strip when it fits, the stepper when it does
   * not (4.5, 6.2).
   *
   * A width question, not a device question, which is why the stepper applies in `Wide` too
   * and why the caller decides with `useSliceStepper` rather than with the layout mode.
   */
  public static sliceControl(state: ShellState): string {
    if (!state.useSliceStepper) {
      return FieldControls.sliceStrip(state);
    }
    const count = FieldControls.blocksInSlice(state, state.slice);
    return (
      '<span class="slice-stepper">' +
      '<button class="field-button" data-action="slice-step" data-value="-1">◀</button>' +
      '<button class="slice-readout" data-action="slice-picker">x = ' +
      state.slice.toString() +
      " · " +
      count.toString() +
      " block" +
      (count === 1 ? "" : "s") +
      FieldControls.peelNote(state) +
      "</button>" +
      '<button class="field-button" data-action="slice-step" data-value="1">▶</button>' +
      "</span>"
    );
  }

  /**
   * How many sections the cutaway has taken off the front of the turret (isometric renderer
   * spec 6).
   *
   * A cutaway a tester has not noticed reads as a missing wall, and a tester who thinks they
   * have lost a wall will go and rebuild one they already have.
   */
  public static peelNote(state: ShellState): string {
    if (state.viewMode !== ViewMode.Iso || !state.peeling || state.peeledSections <= 0) {
      return "";
    }
    return " · " + state.peeledSections.toString() + " peeled";
  }

  /**
   * The full picker the stepper's readout opens: every cross-section with its block count.
   *
   * 6.2 asks for it by name, and the reason is that the strip's "an empty section reads as
   * empty" property is the thing the shrink would otherwise cost.
   */
  private static slicePicker(state: ShellState): string {
    if (!state.slicePickerOpen) {
      return "";
    }
    let html = '<div class="slice-picker"><h2>cross-sections</h2><ul>';
    for (let x = state.sliceMin; x <= state.sliceMax; x++) {
      const count = FieldControls.blocksInSlice(state, x);
      html +=
        '<li class="' +
        (x === state.slice ? "active" : "") +
        (count === 0 ? " empty" : "") +
        '" data-action="slice" data-value="' +
        x.toString() +
        '"><span class="mono">x = ' +
        x.toString() +
        '</span><span class="dim">' +
        count.toString() +
        " block" +
        (count === 1 ? "" : "s") +
        "</span></li>";
    }
    html += '</ul><button class="field-button" data-action="slice-picker">close</button></div>';
    return html;
  }

  /** Today's per-column strip, unchanged. */
  private static sliceStrip(state: ShellState): string {
    let html = '<span class="slice-strip"><span class="shell-label">slice x</span>';
    for (let x = state.sliceMin; x <= state.sliceMax; x++) {
      const count = FieldControls.blocksInSlice(state, x);
      html +=
        '<button class="slice-cell' +
        (x === state.slice ? " active" : "") +
        (count === 0 ? " empty" : "") +
        '" data-action="slice" data-value="' +
        x.toString() +
        '" title="' +
        count.toString() +
        ' block(s) in this cross-section">' +
        x.toString() +
        "</button>";
    }
    html +=
      '<span class="shell-sub">' +
      Dom.escape(FieldControls.keyFor("cross-section")) +
      " to move" +
      Dom.escape(FieldControls.peelNote(state)) +
      "</span></span>";
    return html;
  }

  private static blocksInSlice(state: ShellState, x: number): number {
    const index = x - state.sliceMin;
    return index >= 0 && index < state.sliceCounts.length ? state.sliceCounts[index] : 0;
  }

  /**
   * The dev readout, collapsed to one chip (4.2).
   *
   * It shows the worse of solver p95 and render p95 and expands to the full §6 readout on
   * tap. It stays on by default: §6's argument that a tester's "it stuttered" must arrive
   * with numbers is *stronger* on a phone, not weaker.
   */
  private static devChip(state: ShellState): string {
    const worst = state.solverP95 > state.renderP95 ? state.solverP95 : state.renderP95;
    const label = state.solverP95 > state.renderP95 ? "solver" : "render";
    return (
      '<button class="dev-chip' +
      (worst > FieldControls.mobileBudgetMs(state, label) ? " warn" : "") +
      (state.stalled ? " bad" : "") +
      '" data-action="dev-expand">' +
      Dom.escape(label) +
      " p95 " +
      Dom.number(worst, 1) +
      " ms</button>"
    );
  }

  /**
   * The 8.3 budget the chip warns against: a phone has a slower core and up to nine times
   * the fill cost per CSS pixel, so the solver gets 32 ms there against the desktop's 16.
   * Render is 60 fps on both.
   */
  private static mobileBudgetMs(state: ShellState, label: string): number {
    if (label !== "solver") {
      return 16;
    }
    return state.coarse ? 32 : 16;
  }
}
