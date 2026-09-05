import { OverlayMode } from "../render/ViewState";
import { LayoutMode } from "./LayoutMode";

/**
 * What the shell and the field control bar need to know each time they repaint. Assembled
 * by the app, once per pass.
 *
 * One object rather than two. The condensed shell (mobile UI spec 4.2) and the field
 * control bar (6.1) show the same overlay, the same cross-section and the same performance
 * numbers in two places at once on a phone, and a value that disagreed between them would
 * be worse than either of them missing.
 */
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
  /** Which quarter turn the camera is at, for the compass (isometric renderer spec 9). */
  public yaw: number;
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

  // ------------------------------------------------------------ mobile UI spec

  /** The layout the viewport classified into (3.1). */
  public layout: LayoutMode;
  /** True on a coarse pointer (3.2): it selects hit-target size and which hints show. */
  public coarse: boolean;
  /** `Medium` and `Compact`: the shell condenses to one scrollable row (4.2). */
  public condensed: boolean;
  /** `Compact` only: the overlay switcher and the cross-section move to the control bar. */
  public compact: boolean;
  /** 4.5: a width question, not a device question, so it applies in `Wide` too. */
  /** The dev chip's expanded state (4.2). The chip itself is never off. */
  public devExpanded: boolean;
  /** What the renderer gave up to hold the budget, if anything (iso renderer spec 8). */
  public renderDetail: string;
  public inDesign: boolean;
  public canUndo: boolean;
  public canRedo: boolean;
  /** True when there is a run or replay to drive: shows the transport (6.1). */
  public attemptOpen: boolean;
  public paused: boolean;
  public showScrub: boolean;
  public scrubIndex: number;
  public scrubCount: number;
  /** The current screen's one action, kept reachable with the sheet collapsed (8.4). */
  public primaryLabel: string;
  public primaryAction: string;

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
    this.yaw = 0;
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

    this.layout = LayoutMode.Wide;
    this.coarse = false;
    this.condensed = false;
    this.compact = false;
    this.devExpanded = false;
    this.renderDetail = "full";
    this.inDesign = false;
    this.canUndo = false;
    this.canRedo = false;
    this.attemptOpen = false;
    this.paused = false;
    this.showScrub = false;
    this.scrubIndex = 0;
    this.scrubCount = 0;
    this.primaryLabel = "";
    this.primaryAction = "";
  }
}
