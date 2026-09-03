import { OVERLAY_COUNT, OverlayMode, overlayLegend, overlayName } from "../render/ViewState";
import { Palette } from "../render/Palette";
import { Dom } from "./Dom";
import { FieldControls } from "./FieldControls";
import { ShellState } from "./ShellState";

/**
 * The persistent shell: phase, budget, crew tally, overlay switcher, session id and the dev
 * readout (UI spec 3).
 *
 * The dev readout is on by default in the tester build, and that is a deliberate choice
 * rather than a debug leftover. §6 puts the frame budget at the centre of §1.1, and the
 * only way a tester's "it stuttered" arrives with numbers attached is if the numbers were
 * on screen while it stuttered.
 *
 * Mobile UI spec 4.2 condenses rather than cuts. `Medium` and `Compact` collapse the two
 * rows into one scrollable row; `Compact` drops the sub-lines, moves the session id into
 * the dev readout -- §7.1 needs it quotable, not prominent -- and hands the overlay switcher
 * and the cross-section to the field control bar, where a thumb is. Every value is still
 * on screen, and the numbers keep their precision: a phone gets fewer characters per line,
 * not fewer digits (§5).
 */
export class Shell {
  private readonly root: HTMLElement;
  private readonly overlayBar: HTMLElement;
  private readonly statusBar: HTMLElement;
  private readonly devBar: HTMLElement;
  private lastOverlay: number;
  private lastCompact: boolean;

  public constructor(root: HTMLElement) {
    this.root = root;
    this.statusBar = Dom.require("shell-status");
    this.overlayBar = Dom.require("shell-overlays");
    this.devBar = Dom.require("shell-dev");
    this.lastOverlay = -1;
    this.lastCompact = false;
  }

  public get element(): HTMLElement {
    return this.root;
  }

  public render(state: ShellState): void {
    this.renderStatus(state);
    if (state.overlay !== this.lastOverlay || state.compact !== this.lastCompact) {
      this.renderOverlays(state);
      this.lastOverlay = state.overlay as number;
      this.lastCompact = state.compact;
    } else {
      this.renderSlice(state);
    }
    this.renderDev(state);
  }

  private renderStatus(state: ShellState): void {
    const overBudget = state.cost > state.budget;
    const margin = state.margin;
    const marginClass = margin < 1 ? "bad" : margin < 1.3 ? "warn" : "good";
    Dom.setHtml(
      this.statusBar,
      Shell.block("phase", Dom.escape(state.phase), "", Dom.escape(state.phaseDetail), state) +
        Shell.block(
          "material",
          state.cost.toString() + " / " + state.budget.toString(),
          overBudget ? "bad" : "",
          (state.budget - state.cost).toString() + " left",
          state
        ) +
        Shell.block(
          "crew",
          state.crewTotal.toString(),
          "",
          state.crewGunners.toString() +
            "g / " +
            state.crewRepair.toString() +
            "r / " +
            state.crewRunners.toString() +
            "h",
          state
        ) +
        Shell.block("margin", Dom.number(margin, 2), marginClass, "load factor", state) +
        // 4.2: on a condensed shell the session id lives in the dev readout instead.
        (state.condensed
          ? ""
          : '<div class="shell-block right">' +
            '<span class="shell-label">session</span>' +
            '<span class="shell-value mono">' +
            Dom.escape(state.sessionId) +
            "</span>" +
            '<span class="shell-sub">attempt ' +
            state.attemptNumber.toString() +
            "</span>" +
            "</div>")
    );
  }

  /** One status block. The sub-line is the first thing 4.2 spends when space runs out. */
  private static block(
    label: string,
    value: string,
    valueClass: string,
    sub: string,
    state: ShellState
  ): string {
    return (
      '<div class="shell-block">' +
      '<span class="shell-label">' +
      Dom.escape(label) +
      "</span>" +
      '<span class="shell-value ' +
      valueClass +
      '">' +
      value +
      "</span>" +
      (sub.length > 0 && !state.compact ? '<span class="shell-sub">' + sub + "</span>" : "") +
      "</div>"
    );
  }

  /**
   * The overlay switcher and the cross-section, in `Wide` and `Medium`.
   *
   * In `Compact` the keys and the cross-section are in the field control bar (4.2) and what
   * stays here is the legend and, when the stress overlay is up, its band key. §5 forbids
   * cutting either: the greyscale-readable requirement is unchanged and unconditional, so
   * the key follows the overlay onto a small screen rather than being dropped from it.
   */
  private renderOverlays(state: ShellState): void {
    let html = "";
    if (!state.compact) {
      for (let i = 1; i <= OVERLAY_COUNT; i++) {
        const mode = i as OverlayMode;
        const active = mode === state.overlay;
        html +=
          '<button class="overlay-key' +
          (active ? " active" : "") +
          '" data-action="overlay" data-value="' +
          i.toString() +
          '" title="' +
          Dom.escape(overlayLegend(mode)) +
          '"><span class="key">' +
          i.toString() +
          "</span>" +
          Dom.escape(overlayName(mode)) +
          "</button>";
      }
    }
    html += '<span class="overlay-legend">' + Dom.escape(overlayLegend(state.overlay)) + "</span>";
    html += Shell.bandLegend(state.overlay);
    if (!state.compact) {
      html += '<span class="slice-mount" id="shell-slice"></span>';
    }
    Dom.setHtml(this.overlayBar, html);
    this.renderSlice(state);
  }

  /**
   * The stress overlay's key, drawn as swatches with their hatch patterns.
   *
   * Present whenever that overlay is up, because a ramp without a key is a decoration. The
   * band boundaries are the ones in UI spec 4 and the ones the layer draws.
   */
  private static bandLegend(overlay: OverlayMode): string {
    if (overlay !== OverlayMode.Stress) {
      return "";
    }
    let html = '<span class="band-legend">';
    for (let i = 0; i < Palette.bands.length; i++) {
      const band = Palette.bands[i];
      html +=
        '<span class="band"><span class="swatch band' +
        i.toString() +
        '" style="background:' +
        band.fill +
        '"></span>' +
        Dom.escape(band.label) +
        "</span>";
    }
    html += "</span>";
    return html;
  }

  /** The per-column strip, or the stepper when the strip would not fit on one row (4.5). */
  private renderSlice(state: ShellState): void {
    const mount = document.getElementById("shell-slice");
    if (mount === null) {
      return;
    }
    Dom.setHtml(mount, FieldControls.sliceControl(state));
  }

  /**
   * The full dev readout. On a condensed shell it is what the chip expands into (4.2), and
   * it carries the session id, so §7.1 still has something quotable.
   */
  private renderDev(state: ShellState): void {
    if (state.condensed && !state.devExpanded) {
      Dom.setHtml(this.devBar, "");
      return;
    }
    const solverOver = state.solverP95 > (state.coarse ? 32 : 16);
    const renderOver = state.renderP95 > 16;
    Dom.setHtml(
      this.devBar,
      '<span class="dev-item' +
        (solverOver ? " warn" : "") +
        '">solver ' +
        Dom.number(state.solverMs, 1) +
        " ms (p95 " +
        Dom.number(state.solverP95, 1) +
        ")</span>" +
        '<span class="dev-item' +
        (renderOver ? " warn" : "") +
        '">render ' +
        Dom.number(state.renderMs, 1) +
        " ms (p95 " +
        Dom.number(state.renderP95, 1) +
        ")</span>" +
        '<span class="dev-item">cells ' +
        state.cellCount.toString() +
        "</span>" +
        '<span class="dev-item">tick ' +
        state.tick.toString() +
        "</span>" +
        '<span class="dev-item' +
        (state.stalled ? " bad" : "") +
        '">sim lead ' +
        Dom.number(state.leadSeconds, 2) +
        "s" +
        (state.stalled ? " — waiting on the solver" : "") +
        "</span>" +
        (state.condensed
          ? '<span class="dev-item mono">session ' +
            Dom.escape(state.sessionId) +
            " · attempt " +
            state.attemptNumber.toString() +
            "</span>"
          : "") +
        (state.note.length > 0 ? '<span class="dev-note">' + Dom.escape(state.note) + "</span>" : "")
    );
  }
}
