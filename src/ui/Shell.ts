import { OVERLAY_COUNT, OverlayMode, overlayLegend, overlayName } from "../render/ViewState";
import { Palette } from "../render/Palette";
import { Dom } from "./Dom";

/** What the shell needs to know each time it repaints. Assembled by the app. */
export class ShellState {
  public phase: string;
  public phaseDetail: string;
  public cost: number;
  public budget: number;
  public crewTotal: number;
  public crewGunners: number;
  public crewRepair: number;
  public crewRunners: number;
  /** Load factor to show. The editor's before a run starts, the frame's once it has. */
  public margin: number;
  public overlay: OverlayMode;
  public slice: number;
  public sliceMin: number;
  public sliceMax: number;
  /** Blocks in each cross-section from `sliceMin` up, so empty sections read as empty. */
  public sliceCounts: readonly number[];
  public sessionId: string;
  public attemptNumber: number;
  /** Solver milliseconds: the last one and the p95, per UI spec 6. */
  public solverMs: number;
  public solverP95: number;
  public renderMs: number;
  public renderP95: number;
  public cellCount: number;
  public tick: number;
  public leadSeconds: number;
  public stalled: boolean;
  public note: string;

  public constructor() {
    this.phase = "design";
    this.phaseDetail = "";
    this.cost = 0;
    this.budget = 0;
    this.crewTotal = 0;
    this.crewGunners = 0;
    this.crewRepair = 0;
    this.crewRunners = 0;
    this.margin = Number.POSITIVE_INFINITY;
    this.overlay = OverlayMode.Material;
    this.slice = 0;
    this.sliceMin = 0;
    this.sliceMax = 0;
    this.sliceCounts = [];
    this.sessionId = "";
    this.attemptNumber = 1;
    this.solverMs = 0;
    this.solverP95 = 0;
    this.renderMs = 0;
    this.renderP95 = 0;
    this.cellCount = 0;
    this.tick = 0;
    this.leadSeconds = 0;
    this.stalled = false;
    this.note = "";
  }
}

/**
 * The persistent shell: phase, budget, crew tally, overlay switcher, session id and the dev
 * readout (UI spec 3).
 *
 * The dev readout is on by default in the tester build, and that is a deliberate choice
 * rather than a debug leftover. §6 puts the frame budget at the centre of §1.1, and the
 * only way a tester's "it stuttered" arrives with numbers attached is if the numbers were
 * on screen while it stuttered.
 */
export class Shell {
  private readonly root: HTMLElement;
  private readonly overlayBar: HTMLElement;
  private readonly statusBar: HTMLElement;
  private readonly devBar: HTMLElement;
  private lastOverlay: number;

  public constructor(root: HTMLElement) {
    this.root = root;
    this.statusBar = Dom.require("shell-status");
    this.overlayBar = Dom.require("shell-overlays");
    this.devBar = Dom.require("shell-dev");
    this.lastOverlay = -1;
  }

  public get element(): HTMLElement {
    return this.root;
  }

  public render(state: ShellState): void {
    this.renderStatus(state);
    if (state.overlay !== this.lastOverlay) {
      this.renderOverlays(state);
      this.lastOverlay = state.overlay as number;
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
      '<div class="shell-block">' +
        '<span class="shell-label">phase</span>' +
        '<span class="shell-value">' +
        Dom.escape(state.phase) +
        "</span>" +
        (state.phaseDetail.length > 0
          ? '<span class="shell-sub">' + Dom.escape(state.phaseDetail) + "</span>"
          : "") +
        "</div>" +
        '<div class="shell-block">' +
        '<span class="shell-label">material</span>' +
        '<span class="shell-value ' +
        (overBudget ? "bad" : "") +
        '">' +
        state.cost.toString() +
        " / " +
        state.budget.toString() +
        "</span>" +
        '<span class="shell-sub">' +
        (state.budget - state.cost).toString() +
        " left</span>" +
        "</div>" +
        '<div class="shell-block">' +
        '<span class="shell-label">crew</span>' +
        '<span class="shell-value">' +
        state.crewTotal.toString() +
        "</span>" +
        '<span class="shell-sub">' +
        state.crewGunners.toString() +
        "g / " +
        state.crewRepair.toString() +
        "r / " +
        state.crewRunners.toString() +
        "h</span>" +
        "</div>" +
        '<div class="shell-block">' +
        '<span class="shell-label">margin</span>' +
        '<span class="shell-value ' +
        marginClass +
        '">' +
        Dom.number(margin, 2) +
        "</span>" +
        '<span class="shell-sub">load factor</span>' +
        "</div>" +
        '<div class="shell-block right">' +
        '<span class="shell-label">session</span>' +
        '<span class="shell-value mono">' +
        Dom.escape(state.sessionId) +
        "</span>" +
        '<span class="shell-sub">attempt ' +
        state.attemptNumber.toString() +
        "</span>" +
        "</div>"
    );
  }

  private renderOverlays(state: ShellState): void {
    let html = "";
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
    html += '<span class="overlay-legend">' + Dom.escape(overlayLegend(state.overlay)) + "</span>";
    html += Shell.bandLegend(state.overlay);
    html += '<span class="slice-strip" id="shell-slice"></span>';
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

  private renderSlice(state: ShellState): void {
    const strip = document.getElementById("shell-slice");
    if (strip === null) {
      return;
    }
    let html = '<span class="shell-label">slice x</span>';
    for (let x = state.sliceMin; x <= state.sliceMax; x++) {
      const index = x - state.sliceMin;
      const count = index < state.sliceCounts.length ? state.sliceCounts[index] : 0;
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
    html += '<span class="shell-sub">[ ] to move</span>';
    Dom.setHtml(strip, html);
  }

  private renderDev(state: ShellState): void {
    const solverOver = state.solverP95 > 16;
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
        (state.note.length > 0 ? '<span class="dev-note">' + Dom.escape(state.note) + "</span>" : "")
    );
  }
}
