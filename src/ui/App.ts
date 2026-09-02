import { Dials } from "../config/Dials";
import { IVec3 } from "../core/IVec3";
import { AmmoLoadId, AmmoTable } from "../materials/AmmoTable";
import { MaterialTable } from "../materials/MaterialTable";
import { WeaponTable } from "../materials/WeaponTable";
import { BlockKind } from "../blueprint/BlockKind";
import { Blueprint } from "../blueprint/Blueprint";
import { ConstantBudgetProvider } from "../blueprint/BudgetProvider";
import { CrewRole } from "../crew/CrewMember";
import { BlueprintValidator } from "../editor/BlueprintValidator";
import { BlueprintCodec } from "../persistence/BlueprintCodec";
import { BlueprintLibrary } from "../persistence/BlueprintLibrary";
import { FieldDesign } from "../render/FieldDesign";
import { FieldFrame } from "../render/FieldFrame";
import { FieldRenderer } from "../render/FieldRenderer";
import { FrameBuilder } from "../render/FrameBuilder";
import { PredictAnalysis, PredictOutcome } from "../render/PredictAnalysis";
import { OverlayMode, ViewState } from "../render/ViewState";
import { Projection } from "../render/Projection";
import { Arena } from "../sim/Arena";
import { BlockStructure } from "../structure/BlockStructure";
import { RunEvent } from "../sim/RunEvent";
import { AttemptExport } from "../telemetry/AttemptExport";
import { LIBRARY_KEY, SEEN_GUIDED_RUN_KEY, SessionId } from "../telemetry/SessionStore";
import { Telemetry } from "../telemetry/Telemetry";
import { DialsTable } from "../data/DialsTable";
import { WorkedExample, WorkedExamples } from "../data/WorkedExamples";
import { AttemptSession } from "./AttemptSession";
import { Dispatcher, SimCommand, SimTarget, ViewCommand } from "./Commands";
import { DesignPanels } from "./DesignPanels";
import { Dom } from "./Dom";
import { EditorModel } from "./EditorModel";
import { LocalSessionStore } from "./LocalSessionStore";
import { ChainRow, RunPanels } from "./RunPanels";
import { Shell, ShellState } from "./Shell";

/** The five screens plus the library stub. The loop is design → allocate → run → replay. */
export enum Screen {
  Design = 0,
  Allocate = 1,
  Run = 2,
  Replay = 3,
  Summary = 4,
  Library = 5,
}

/** The seed every attempt is flown with, so two attempts differ only by their design. */
const ATTEMPT_SEED: number = 20260902;

/**
 * The application: screens, the frame clock, and the input dispatcher.
 *
 * Everything a player does funnels through `Dispatcher`, which routes on the
 * `SimCommand` / `ViewCommand` split (UI spec 5.2). The frame clock lives here and does
 * three things in order: advance playback, spend a slice of the frame simulating ahead, and
 * draw. Panels repaint on state changes and at ten hertz at most, never per frame.
 */
export class App implements SimTarget {
  private readonly dials: Dials;
  private readonly arena: Arena;
  private readonly materials: MaterialTable;
  private readonly ammo: AmmoTable;
  private readonly weapons: WeaponTable;
  private readonly validator: BlueprintValidator;
  private readonly budget: ConstantBudgetProvider;
  private readonly store: LocalSessionStore;
  private readonly telemetry: Telemetry;
  private readonly view: ViewState;
  private readonly renderer: FieldRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly panelRoot: HTMLElement;
  private readonly bannerRoot: HTMLElement;
  private readonly shell: Shell;
  private readonly dispatcher: Dispatcher;
  private readonly editor: EditorModel;
  private readonly predictAnalysis: PredictAnalysis;
  private library: BlueprintLibrary;

  private designDesign: FieldDesign;
  private designBuilder: FrameBuilder;
  private designFrame: FieldFrame;
  private attempt: AttemptSession | null;
  private screen: Screen;
  private panelDirty: boolean;
  private lastPanelMs: number;
  private lastFrameMs: number;
  private dragFrom: IVec3 | null;
  private dragTo: IVec3 | null;
  private panning: boolean;
  private panFromX: number;
  private panFromY: number;
  private predictRequestedAtMs: number;
  private predictCell: IVec3 | null;
  private repairDetails: number;
  private runners: number;
  private guided: boolean;
  private banner: string;
  private importText: string;

  public constructor(canvas: HTMLCanvasElement, panelRoot: HTMLElement, shellRoot: HTMLElement) {
    this.dials = DialsTable.load();
    this.arena = Arena.p0();
    this.materials = MaterialTable.defaults();
    this.ammo = AmmoTable.defaults(this.materials);
    this.weapons = WeaponTable.defaults(this.dials.stationRackCapacity);
    this.validator = BlueprintValidator.withDefaults(this.materials, this.dials);
    this.budget = new ConstantBudgetProvider(this.dials.materialBudget);
    this.store = new LocalSessionStore();
    this.telemetry = new Telemetry(SessionId.resolve(this.store, Math.random));
    this.canvas = canvas;
    this.panelRoot = panelRoot;
    this.bannerRoot = Dom.require("banner");
    this.renderer = new FieldRenderer(canvas);
    this.shell = new Shell(shellRoot);
    this.predictAnalysis = new PredictAnalysis(this.materials, this.dials, this.arena.pad);
    this.library = App.readLibrary(this.store);

    const opening = this.openingBlueprint();
    this.editor = new EditorModel(
      opening,
      this.validator,
      this.materials,
      this.arena.pad,
      this.budget,
      this.dials
    );
    this.view = new ViewState(App.sliceOfInterest(opening, this.arena.laneCentreX));
    this.designDesign = this.buildDesign(opening);
    this.designBuilder = new FrameBuilder(this.designDesign);
    this.designFrame = this.designBuilder.fromDesign(this.editor.structure(), null, this.editor.geometry);

    this.attempt = null;
    this.guided = this.store.read(SEEN_GUIDED_RUN_KEY) === null;
    this.screen = this.guided ? Screen.Run : Screen.Design;
    this.panelDirty = true;
    this.lastPanelMs = 0;
    this.lastFrameMs = 0;
    this.dragFrom = null;
    this.dragTo = null;
    this.panning = false;
    this.panFromX = 0;
    this.panFromY = 0;
    this.predictRequestedAtMs = 0;
    this.predictCell = null;
    this.repairDetails = 1;
    this.runners = 2;
    this.banner = "";
    this.importText = "";

    this.dispatcher = new Dispatcher(this, this.view, this, (mode: OverlayMode): void => {
      this.telemetry.noteOverlay(mode, App.now());
      this.panelDirty = true;
    });

    this.wireInput();
    this.renderer.resize();
    Projection.fit(this.designDesign, this.view, this.renderer.width, this.renderer.height);
    if (this.guided) {
      this.beginGuidedFirstRun();
    }
  }

  // ---------------------------------------------------------------- boot

  /**
   * What the tester sees first (UI spec 7.2).
   *
   * The first session does not open on an empty grid and does not open on the editor. It
   * opens mid-loop, on a preloaded, deliberately flawed design, with one thing to do: start
   * wave 1 and watch it come apart. The hypothesis under test is the loop, not the editor.
   */
  private openingBlueprint(): Blueprint {
    const names = this.library.names();
    if (names.length > 0) {
      const saved = this.library.load(names[names.length - 1]);
      if (saved !== null) {
        return saved;
      }
    }
    return WorkedExamples.guidedFirstRun().blueprint;
  }

  private beginGuidedFirstRun(): void {
    this.store.write(SEEN_GUIDED_RUN_KEY, "1");
    const example = WorkedExamples.guidedFirstRun();
    this.banner =
      "This is " +
      example.title +
      ", already on the pad. " +
      example.lesson +
      " Press start when you are ready.";
    this.openAttempt();
  }

  private static readLibrary(store: LocalSessionStore): BlueprintLibrary {
    const text = store.read(LIBRARY_KEY);
    if (text === null || text.length === 0) {
      return new BlueprintLibrary();
    }
    try {
      return BlueprintLibrary.decode(text);
    } catch (error) {
      // A library that will not decode is a library from an older format. Losing it is
      // better than refusing to start, and the tester keeps the worked examples.
      return new BlueprintLibrary();
    }
  }

  private saveLibrary(): void {
    this.store.write(LIBRARY_KEY, this.library.encode());
  }

  /**
   * The cross-section worth opening on: one with a gun in it.
   *
   * The lane's centre line is the obvious default and it is the wrong one -- a design whose
   * only station is off-centre would open on a slice where nothing happens, and the tester
   * would watch their gun fall off without seeing it.
   */
  private static sliceOfInterest(blueprint: Blueprint, fallback: number): number {
    const stations = blueprint.indicesOfKind(BlockKind.Station);
    if (stations.length > 0) {
      return blueprint.blockAt(stations[0]).position.x;
    }
    return fallback;
  }

  private buildDesign(blueprint: Blueprint): FieldDesign {
    return new FieldDesign(
      blueprint,
      this.arena.pad,
      this.arena,
      this.materials,
      this.ammo,
      this.weapons,
      this.dials
    );
  }

  // ---------------------------------------------------------------- frame clock

  public start(): void {
    const step = (): void => {
      this.tick();
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  private tick(): void {
    const now = App.now();
    const dt = this.lastFrameMs === 0 ? 0 : (now - this.lastFrameMs) / 1000;
    this.lastFrameMs = now;

    if (this.renderer.resize()) {
      Projection.fit(this.currentDesign(), this.view, this.renderer.width, this.renderer.height);
    }

    const attempt = this.attempt;
    if (attempt !== null && this.screen === Screen.Run) {
      attempt.advancePlayback(dt);
      attempt.simulateAhead(AttemptSession.SIM_BUDGET_MS);
      if (attempt.playedOut) {
        this.finishAttempt();
      }
    } else if (attempt !== null && this.screen === Screen.Replay) {
      attempt.advancePlayback(dt);
      this.telemetry.noteReplayProgress(attempt.watchedFraction);
    }

    // The editor's expensive pass, once the tester has stopped typing into the field.
    if ((this.screen === Screen.Design || this.screen === Screen.Allocate) && this.editor.solveDue(now)) {
      this.editor.solve();
      this.refreshDesignFrame();
      this.panelDirty = true;
    }

    const frame = this.frame();
    this.renderer.render(frame, this.view);
    this.runPredictIfDue(now, frame);

    // Panels are cheap but not free, and nothing in them changes faster than a tester can
    // read. Ten hertz while a wave is on, on demand otherwise.
    const live = this.screen === Screen.Run || this.screen === Screen.Replay;
    if (this.panelDirty || (live && now - this.lastPanelMs > 100)) {
      this.renderPanels(frame);
      this.lastPanelMs = now;
      this.panelDirty = false;
    }
    this.shell.render(this.shellState(frame));
  }

  private currentDesign(): FieldDesign {
    const attempt = this.attempt;
    if (attempt !== null && this.screen !== Screen.Design && this.screen !== Screen.Library) {
      return attempt.design;
    }
    return this.designDesign;
  }

  private frame(): FieldFrame {
    const attempt = this.attempt;
    if (attempt !== null && this.screen !== Screen.Design && this.screen !== Screen.Library) {
      return attempt.frame();
    }
    return this.designFrame;
  }

  private refreshDesignFrame(): void {
    const blueprint = this.editor.blueprint();
    if (blueprint !== this.designDesign.blueprint) {
      this.designDesign = this.buildDesign(blueprint);
      this.designBuilder = new FrameBuilder(this.designDesign);
    }
    this.designFrame = this.designBuilder.fromDesign(
      this.editor.structure(),
      this.editor.structural,
      this.editor.geometry
    );
  }

  // ---------------------------------------------------------------- predict

  /**
   * §4: predict is live during a run. The claim in §1.1 is that a player can *anticipate* a
   * collapse, so an overlay that only makes sense in hindsight has already failed the test.
   * The solve is expensive, so it runs after the draw, at most one per debounce window, and
   * against whichever structure the tester is looking at.
   */
  private runPredictIfDue(nowMs: number, frame: FieldFrame): void {
    if (this.view.overlay !== OverlayMode.Predict) {
      return;
    }
    const cell = this.view.focusCell();
    if (cell === null) {
      this.renderer.predict.setOutcome(null);
      this.predictCell = null;
      return;
    }
    const current = this.renderer.predict.current;
    if (current !== null && current.cell.equals(cell)) {
      return;
    }
    if (this.predictCell === null || !this.predictCell.equals(cell)) {
      this.predictCell = cell;
      this.predictRequestedAtMs = nowMs;
      this.renderer.predict.setPending();
      return;
    }
    if (nowMs - this.predictRequestedAtMs < 140) {
      return;
    }
    const structure = this.predictStructure();
    const block = frame.design.blueprint.indexAt(cell);
    const outcome: PredictOutcome = this.predictAnalysis.analyse(structure, cell, block);
    this.renderer.predict.setOutcome(outcome);
    this.panelDirty = true;
  }

  /**
   * Which structure the prediction is about.
   *
   * During a run it is the live one: §4 wants predict to *anticipate* a collapse, and after
   * two waves of damage the blueprint as drawn is not the turret that is standing. Anywhere
   * else -- the editor, the replay, the summary -- it is the design at rest, because there
   * the question a tester is asking is about the blueprint they are deciding how to change.
   */
  private predictStructure(): BlockStructure {
    const attempt = this.attempt;
    if (attempt !== null && this.screen === Screen.Run && attempt.started) {
      return attempt.liveStructure;
    }
    return this.editor.structure();
  }

  // ---------------------------------------------------------------- SimTarget

  public placeBlueprint(name: string): void {
    void name;
    this.openAttempt();
  }

  public assign(repairDetails: number, runners: number): void {
    this.repairDetails = repairDetails;
    this.runners = runners;
    const attempt = this.attempt;
    if (attempt !== null) {
      attempt.assign(repairDetails, runners);
    }
  }

  public focus(target: number): void {
    const attempt = this.attempt;
    if (attempt !== null) {
      attempt.focus(target);
    }
  }

  public selectLoad(station: number, load: number): void {
    const attempt = this.attempt;
    if (attempt !== null) {
      attempt.selectLoad(station, load as AmmoLoadId);
    }
  }

  public startWave(): void {
    let attempt = this.attempt;
    // An attempt is reusable only while it has never been started. The one the guided first
    // run pre-opens qualifies; a finished one does not, and reusing that would replay the
    // last attempt's frames while pretending to fly the design the tester just fixed.
    if (attempt === null || attempt.started) {
      this.openAttempt();
      attempt = this.attempt;
    }
    if (attempt === null) {
      return;
    }
    attempt.assign(this.repairDetails, this.runners);
    attempt.start();
    this.telemetry.noteRunning(true, App.now());
    this.goTo(Screen.Run);
  }

  public seekToTick(tick: number): void {
    const attempt = this.attempt;
    if (attempt === null) {
      return;
    }
    attempt.seekToTick(tick);
    this.telemetry.noteScrub(attempt.watchedFraction);
    this.panelDirty = true;
  }

  // ---------------------------------------------------------------- attempts

  /** Opens a fresh attempt on the design as it currently stands. */
  private openAttempt(): void {
    if (this.editor.structural === null) {
      this.editor.solve();
      this.refreshDesignFrame();
    }
    const blueprint = this.editor.blueprint();
    const design = this.buildDesign(blueprint);
    const record = this.telemetry.beginAttempt(blueprint, this.editor.cost, ATTEMPT_SEED, App.now());
    this.attempt = new AttemptSession(
      blueprint,
      design,
      this.arena,
      this.dials,
      ATTEMPT_SEED,
      record
    );
    this.view.clearJointHighlight();
    this.view.slice = App.sliceOfInterest(blueprint, this.arena.laneCentreX);
    this.panelDirty = true;
  }

  private finishAttempt(): void {
    const attempt = this.attempt;
    if (attempt === null) {
      return;
    }
    attempt.writeRecord(this.renderer.renderP95());
    this.telemetry.finishAttempt(
      attempt.record.outcome,
      attempt.record.firstFailedJoint,
      App.now()
    );
    this.store.write("turrets-p0/attempts", this.telemetry.attemptCount.toString());
    // §7.2: the replay opens itself, and it points at the joint that sheared.
    if (this.guided) {
      this.guided = false;
      this.openReplayAtFirstFailure();
      return;
    }
    this.goTo(Screen.Summary);
  }

  private openReplayAtFirstFailure(): void {
    const attempt = this.attempt;
    if (attempt === null) {
      return;
    }
    this.telemetry.noteReplayOpened(App.now());
    const joint = attempt.record.firstFailedJoint;
    if (joint !== null) {
      this.view.highlightJointLow = joint.blockLow;
      this.view.highlightJointHigh = joint.blockHigh;
      this.view.overlay = OverlayMode.Stress;
      this.telemetry.noteOverlay(OverlayMode.Stress, App.now());
      const frameIndex = this.firstFailureFrame();
      attempt.seekToTick(frameIndex);
      attempt.setPaused(true);
      const position = attempt.design.blueprint.blockAt(joint.blockHigh).position;
      this.view.slice = position.x;
      this.view.selected = position;
    }
    this.banner =
      joint === null
        ? "Nothing sheared this time. Scrub the timeline to see what did happen."
        : "That is the joint that went first. The button out of here is “fix this blueprint”.";
    this.goTo(Screen.Replay);
  }

  /** The frame the first structural failure landed on, or 0. */
  private firstFailureFrame(): number {
    const attempt = this.attempt;
    if (attempt === null) {
      return 0;
    }
    const rows = this.failureRows();
    for (let i = 0; i < rows.length; i++) {
      return rows[i].frameIndex;
    }
    return 0;
  }

  private failureRows(): ChainRow[] {
    const attempt = this.attempt;
    if (attempt === null) {
      return [];
    }
    const rows: ChainRow[] = [];
    const events = attempt.timeline.events;
    for (let i = 0; i < events.length; i++) {
      const event: RunEvent = events[i];
      if (RunPanels.isFailureEvent(event)) {
        rows.push(new ChainRow(event, attempt.timeline.indexOfEvent(event)));
      }
    }
    return rows;
  }

  /** "Fix this blueprint": the editor, with the failed joint selected and stress showing. */
  private fixBlueprint(): void {
    const attempt = this.attempt;
    if (attempt !== null) {
      this.editor.load(attempt.blueprint, App.now());
      this.refreshDesignFrame();
      const joint = attempt.record.firstFailedJoint;
      if (joint !== null) {
        const position = attempt.blueprint.blockAt(joint.blockHigh).position;
        this.view.selected = position;
        this.view.slice = position.x;
        this.view.highlightJointLow = joint.blockLow;
        this.view.highlightJointHigh = joint.blockHigh;
      }
    }
    this.view.overlay = OverlayMode.Stress;
    this.telemetry.noteOverlay(OverlayMode.Stress, App.now());
    this.telemetry.noteRunning(false, App.now());
    this.banner = "";
    this.goTo(Screen.Design);
  }

  private goTo(screen: Screen): void {
    this.screen = screen;
    this.panelDirty = true;
    if (screen === Screen.Design || screen === Screen.Library) {
      this.telemetry.noteRunning(false, App.now());
    }
    if (screen === Screen.Replay) {
      this.telemetry.noteReplayOpened(App.now());
    }
    Projection.fit(this.currentDesign(), this.view, this.renderer.width, this.renderer.height);
  }

  // ---------------------------------------------------------------- panels

  private renderPanels(frame: FieldFrame): void {
    Dom.setHtml(this.bannerRoot, this.banner.length === 0 ? "" : Dom.escape(this.banner));
    this.bannerRoot.className = this.banner.length === 0 ? "banner empty" : "banner";

    if (this.screen === Screen.Library) {
      Dom.setHtml(
        this.panelRoot,
        DesignPanels.library(WorkedExamples.all(), this.library.names(), this.editor.blueprintName)
      );
      return;
    }
    if (this.screen === Screen.Design) {
      Dom.setHtml(
        this.panelRoot,
        DesignPanels.render(
          this.editor,
          frame,
          this.materials,
          this.ammo,
          this.view.selected,
          this.view.overlay,
          this.renderer.predict.current
        )
      );
      return;
    }
    if (this.screen === Screen.Allocate) {
      const stations = this.editor.blueprint().countOfKind(BlockKind.Station);
      Dom.setHtml(
        this.panelRoot,
        RunPanels.allocate(
          this.dials.crewPool,
          stations,
          this.dials.crewPerStation,
          this.dials.crewPerRepairDetail,
          this.repairDetails,
          this.runners,
          false
        )
      );
      return;
    }
    const attempt = this.attempt;
    if (attempt === null) {
      Dom.setHtml(this.panelRoot, '<section class="panel"><p>no attempt open.</p></section>');
      return;
    }
    if (this.screen === Screen.Run) {
      if (!attempt.started) {
        Dom.setHtml(
          this.panelRoot,
          '<section class="panel"><h2>ready</h2><p class="hint">' +
            Dom.escape(attempt.blueprint.name) +
            " is on the pad. five scripted waves, identical every run.</p>" +
            '<div class="button-row"><button class="primary" data-action="start">start wave 1</button>' +
            '<button data-action="design">open the editor first</button></div>' +
            '<p class="hint">the overlays work here. <kbd>2</kbd> shows you the stress field ' +
            "before you commit to anything.</p></section>"
        );
        return;
      }
      Dom.setHtml(
        this.panelRoot,
        RunPanels.run(
          frame,
          this.ammo,
          attempt.paused,
          attempt.stalled,
          attempt.wave,
          attempt.waveTotal,
          attempt.waveTitle,
          this.crewCounts(),
          attempt.focusedTarget
        )
      );
      return;
    }
    const rows = this.failureRows();
    if (this.screen === Screen.Replay) {
      Dom.setHtml(
        this.panelRoot,
        RunPanels.replay(
          frame,
          attempt.frameIndex(),
          attempt.timeline.length,
          rows,
          attempt.record.firstFailedJoint,
          this.firstFailureFrame()
        ) +
          '<section class="panel actions"><button class="primary" data-action="fix">' +
          "fix this blueprint →</button>" +
          '<button data-action="summary">run summary</button></section>'
      );
      return;
    }
    Dom.setHtml(
      this.panelRoot,
      RunPanels.summary(attempt.record, attempt.outcome, rows, this.firstFailureFrame())
    );
  }

  private crewCounts(): number[] {
    const counts: number[] = [0, 0, 0, 0];
    const attempt = this.attempt;
    if (attempt === null) {
      return counts;
    }
    const frame = attempt.frame();
    for (let i = 0; i < frame.crew.length; i++) {
      const role = frame.crew[i].role;
      if (role >= 0 && role < counts.length) {
        counts[role]++;
      }
    }
    return counts;
  }

  private shellState(frame: FieldFrame): ShellState {
    const state = new ShellState();
    const attempt = this.attempt;
    state.phase = App.screenName(this.screen);
    state.phaseDetail =
      attempt !== null && (this.screen === Screen.Run || this.screen === Screen.Replay)
        ? "wave " + (attempt.wave + 1).toString() + " of " + attempt.waveTotal.toString()
        : this.editor.blueprintName;
    state.cost = this.editor.cost;
    state.budget = this.dials.materialBudget;
    state.crewTotal = attempt === null ? this.dials.crewPool : attempt.crewAlive;
    const counts = this.crewCounts();
    state.crewGunners = counts[CrewRole.Gunner as number];
    state.crewRepair = counts[CrewRole.Repair as number];
    state.crewRunners = counts[CrewRole.Runner as number];
    // Before the first wave the margin a tester cares about is the design's own, which the
    // editor already knows; the run has not solved anything yet and would report infinity.
    state.margin =
      attempt !== null && attempt.started
        ? frame.loadFactor
        : this.editor.structural === null
          ? Number.POSITIVE_INFINITY
          : this.editor.structural.loadFactor;
    state.overlay = this.view.overlay;
    state.slice = this.view.slice;
    state.sliceMin = frame.design.sliceMin;
    state.sliceMax = frame.design.sliceMax;
    const sliceCounts: number[] = [];
    for (let x = frame.design.sliceMin; x <= frame.design.sliceMax; x++) {
      sliceCounts.push(frame.design.blocksInSlice(x).length);
    }
    state.sliceCounts = sliceCounts;
    state.sessionId = this.telemetry.sessionId;
    state.attemptNumber = this.telemetry.attemptCount < 1 ? 1 : this.telemetry.attemptCount;
    state.solverMs = attempt === null ? this.editor.solveMs : attempt.solverMs.latest;
    state.solverP95 = attempt === null ? this.editor.solveMs : attempt.solverMs.p95;
    state.renderMs = this.renderer.renderMs;
    state.renderP95 = this.renderer.renderP95();
    state.cellCount = frame.aliveBlocks;
    state.tick = frame.tick;
    state.leadSeconds = attempt === null ? 0 : attempt.leadSeconds;
    state.stalled = attempt !== null && attempt.stalled;
    if (!this.store.persistent) {
      state.note = "local storage is blocked: this session will not survive a reload";
    }
    return state;
  }

  private static screenName(screen: Screen): string {
    if (screen === Screen.Design) {
      return "design";
    }
    if (screen === Screen.Allocate) {
      return "allocate";
    }
    if (screen === Screen.Run) {
      return "run";
    }
    if (screen === Screen.Replay) {
      return "replay";
    }
    if (screen === Screen.Summary) {
      return "run summary";
    }
    return "library";
  }

  // ---------------------------------------------------------------- input

  private wireInput(): void {
    Dom.onAction(this.panelRoot, (action: string, value: string): void => {
      this.onAction(action, value);
    });
    Dom.onAction(this.shell.element, (action: string, value: string): void => {
      this.onAction(action, value);
    });
    Dom.onInput(this.panelRoot, (name: string, value: string): void => {
      this.onFieldInput(name, value);
    });
    this.panelRoot.addEventListener(
      "pointerdown",
      (event: PointerEvent): void => {
        const node = event.target as HTMLElement | null;
        if (node !== null && node.getAttribute("data-input") === "scrub") {
          const attempt = this.attempt;
          if (attempt !== null) {
            attempt.setScrubbing(true);
          }
        }
      },
      true
    );
    window.addEventListener("pointerup", (): void => {
      const attempt = this.attempt;
      if (attempt !== null) {
        attempt.setScrubbing(false);
      }
    });

    this.canvas.addEventListener("pointerdown", (event: PointerEvent): void => {
      this.onCanvasDown(event);
    });
    this.canvas.addEventListener("pointermove", (event: PointerEvent): void => {
      this.onCanvasMove(event);
    });
    window.addEventListener("pointerup", (event: PointerEvent): void => {
      this.onCanvasUp(event);
    });
    this.canvas.addEventListener(
      "wheel",
      (event: WheelEvent): void => {
        event.preventDefault();
        this.dispatcher.dispatchView(ViewCommand.zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1));
      },
      { passive: false }
    );
    this.canvas.addEventListener("contextmenu", (event: MouseEvent): void => {
      event.preventDefault();
    });
    window.addEventListener("keydown", (event: KeyboardEvent): void => {
      this.onKey(event);
    });
  }

  private onCanvasDown(event: PointerEvent): void {
    const cell = this.renderer.cellAt(this.frame(), this.view, event.clientX, event.clientY);
    if (event.button === 1 || event.button === 2 || event.shiftKey) {
      this.panning = true;
      this.panFromX = event.clientX;
      this.panFromY = event.clientY;
      return;
    }
    if (this.screen === Screen.Design) {
      // Alt- or ctrl-click inspects without editing. A plain click places, because
      // placement is the verb the editor is for; without a modifier there would be no way
      // to read a cell's joints without changing the design first.
      if (event.altKey || event.ctrlKey || event.metaKey) {
        this.dispatcher.dispatchView(ViewCommand.select(cell));
        this.panelDirty = true;
        return;
      }
      this.dragFrom = cell;
      this.dragTo = cell;
      return;
    }
    if (this.screen === Screen.Run) {
      const target = this.attackerAt(event.clientX, event.clientY);
      if (target >= 0) {
        this.dispatcher.dispatchSim(SimCommand.focus(target));
        this.panelDirty = true;
        return;
      }
    }
    this.dispatcher.dispatchView(ViewCommand.select(cell));
    this.panelDirty = true;
  }

  private onCanvasMove(event: PointerEvent): void {
    if (this.panning) {
      this.dispatcher.dispatchView(
        ViewCommand.pan(event.clientX - this.panFromX, event.clientY - this.panFromY)
      );
      this.panFromX = event.clientX;
      this.panFromY = event.clientY;
      return;
    }
    const cell = this.renderer.cellAt(this.frame(), this.view, event.clientX, event.clientY);
    this.dispatcher.dispatchView(ViewCommand.inspect(cell));
    if (this.dragFrom !== null) {
      this.dragTo = cell;
    }
  }

  private onCanvasUp(event: PointerEvent): void {
    this.panning = false;
    const from = this.dragFrom;
    const to = this.dragTo;
    this.dragFrom = null;
    this.dragTo = null;
    if (from === null || to === null || this.screen !== Screen.Design) {
      return;
    }
    void event;
    if (this.editor.applyRect(from, to, App.now())) {
      this.refreshDesignFrame();
      this.panelDirty = true;
    }
    this.dispatcher.dispatchView(ViewCommand.select(to));
  }

  /** Hit-tests the lane for a focus-fire click. Attackers are drawn on the ground line. */
  private attackerAt(clientX: number, clientY: number): number {
    const attempt = this.attempt;
    if (attempt === null) {
      return -1;
    }
    const frame = attempt.frame();
    const projection = this.renderer.projection(frame, this.view);
    const rect = this.canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const groundY = projection.screenY(frame.design.pad.level);
    if (localY < groundY - projection.scale * 1.6 || localY > groundY) {
      return -1;
    }
    let best = -1;
    let bestDistance = projection.scale;
    for (let i = 0; i < frame.attackers.length; i++) {
      const unit = frame.attackers[i];
      const x = projection.screenX(unit.laneZ) + projection.scale * 0.5;
      const distance = Math.abs(x - localX);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = unit.id;
      }
    }
    return best;
  }

  private onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }
    const key = event.key;
    if (key >= "1" && key <= "5") {
      this.dispatcher.dispatchView(ViewCommand.overlay(Number(key) as OverlayMode));
      return;
    }
    if (key === "[" || key === "]") {
      const design = this.currentDesign();
      const next = design.clampSlice(this.view.slice + (key === "[" ? -1 : 1));
      this.dispatcher.dispatchView(ViewCommand.slice(next));
      this.panelDirty = true;
      return;
    }
    if (key === "z" && this.screen === Screen.Design) {
      if (this.editor.undo(App.now())) {
        this.refreshDesignFrame();
        this.panelDirty = true;
      }
      return;
    }
    if (key === "y" && this.screen === Screen.Design) {
      if (this.editor.redo(App.now())) {
        this.refreshDesignFrame();
        this.panelDirty = true;
      }
      return;
    }
    if (key === " ") {
      event.preventDefault();
      const attempt = this.attempt;
      if (attempt !== null) {
        attempt.togglePaused();
        this.panelDirty = true;
      }
      return;
    }
    if (key === "," || key === ".") {
      const attempt = this.attempt;
      if (attempt !== null) {
        attempt.setPaused(true);
        attempt.stepFrames(key === "," ? -1 : 1);
        this.telemetry.noteScrub(attempt.watchedFraction);
        this.panelDirty = true;
      }
      return;
    }
    if (key === "Escape") {
      this.dispatcher.dispatchView(ViewCommand.select(null));
      this.panelDirty = true;
    }
  }

  private onFieldInput(name: string, value: string): void {
    if (name === "name") {
      this.editor.rename(value);
      this.panelDirty = false;
      return;
    }
    if (name === "import") {
      this.importText = value;
      return;
    }
    if (name === "scrub") {
      this.dispatcher.dispatchView(ViewCommand.seek(Number(value)));
    }
  }

  private onAction(action: string, value: string): void {
    if (action === "overlay") {
      this.dispatcher.dispatchView(ViewCommand.overlay(Number(value) as OverlayMode));
      return;
    }
    if (action === "slice") {
      this.dispatcher.dispatchView(ViewCommand.slice(Number(value)));
      this.panelDirty = true;
      return;
    }
    if (action === "palette") {
      this.editor.selectPalette(value);
      this.panelDirty = true;
      return;
    }
    if (action === "undo") {
      if (this.editor.undo(App.now())) {
        this.refreshDesignFrame();
      }
      this.panelDirty = true;
      return;
    }
    if (action === "redo") {
      if (this.editor.redo(App.now())) {
        this.refreshDesignFrame();
      }
      this.panelDirty = true;
      return;
    }
    if (action === "locate") {
      this.locateBlock(Number(value));
      return;
    }
    if (action === "library") {
      this.goTo(Screen.Library);
      return;
    }
    if (action === "design") {
      this.banner = "";
      this.goTo(Screen.Design);
      return;
    }
    if (action === "allocate") {
      this.goTo(Screen.Allocate);
      return;
    }
    if (action === "start") {
      this.banner = "";
      this.dispatcher.dispatchSim(SimCommand.startWave());
      return;
    }
    if (action === "pause") {
      const attempt = this.attempt;
      if (attempt !== null) {
        attempt.togglePaused();
      }
      this.panelDirty = true;
      return;
    }
    if (action === "focus") {
      this.dispatcher.dispatchSim(SimCommand.focus(Number(value)));
      this.panelDirty = true;
      return;
    }
    if (action === "load") {
      const parts = value.split(":");
      this.dispatcher.dispatchSim(SimCommand.selectLoad(Number(parts[0]), Number(parts[1])));
      this.panelDirty = true;
      return;
    }
    if (action === "repair-up" || action === "repair-down") {
      const next = this.repairDetails + (action === "repair-up" ? 1 : -1);
      this.dispatcher.dispatchSim(SimCommand.assign(next < 0 ? 0 : next, this.runners));
      this.panelDirty = true;
      return;
    }
    if (action === "runners-up" || action === "runners-down") {
      const next = this.runners + (action === "runners-up" ? 1 : -1);
      this.dispatcher.dispatchSim(SimCommand.assign(this.repairDetails, next < 0 ? 0 : next));
      this.panelDirty = true;
      return;
    }
    if (action === "seek" || action === "seek-and-replay") {
      this.dispatcher.dispatchView(ViewCommand.seek(Number(value)));
      const attempt = this.attempt;
      if (attempt !== null) {
        attempt.setPaused(true);
      }
      if (action === "seek-and-replay") {
        this.goTo(Screen.Replay);
      }
      return;
    }
    if (action === "frame-back" || action === "frame-forward") {
      const attempt = this.attempt;
      if (attempt !== null) {
        attempt.setPaused(true);
        attempt.stepFrames(action === "frame-back" ? -1 : 1);
        this.telemetry.noteScrub(attempt.watchedFraction);
      }
      this.panelDirty = true;
      return;
    }
    if (action === "play") {
      const attempt = this.attempt;
      if (attempt !== null) {
        attempt.setPaused(false);
      }
      this.panelDirty = true;
      return;
    }
    if (action === "replay") {
      this.goTo(Screen.Replay);
      return;
    }
    if (action === "summary") {
      this.goTo(Screen.Summary);
      return;
    }
    if (action === "fix") {
      this.fixBlueprint();
      return;
    }
    if (action === "export") {
      this.exportAttempt();
      return;
    }
    if (action === "save") {
      this.library.save(this.editor.blueprint());
      this.saveLibrary();
      this.panelDirty = true;
      return;
    }
    if (action === "fork-example") {
      const example: WorkedExample | null = WorkedExamples.byKey(value);
      if (example !== null) {
        this.editor.load(example.blueprint, App.now());
        this.refreshDesignFrame();
        this.view.slice = App.sliceOfInterest(example.blueprint, this.arena.laneCentreX);
        this.banner = example.lesson;
        this.goTo(Screen.Design);
      }
      return;
    }
    if (action === "load-saved") {
      const saved = this.library.load(value);
      if (saved !== null) {
        this.editor.load(saved, App.now());
        this.refreshDesignFrame();
        this.view.slice = App.sliceOfInterest(saved, this.arena.laneCentreX);
        this.goTo(Screen.Design);
      }
      return;
    }
    if (action === "delete-saved") {
      this.library.remove(value);
      this.saveLibrary();
      this.panelDirty = true;
      return;
    }
    if (action === "export-blueprint") {
      Dom.downloadText(
        this.editor.blueprintName.replace(/[^a-z0-9-]+/gi, "-") + ".json",
        BlueprintCodec.encode(this.editor.blueprint())
      );
      return;
    }
    if (action === "import-blueprint") {
      this.importBlueprint();
    }
  }

  private locateBlock(block: number): void {
    if (block < 0) {
      return;
    }
    const blueprint = this.frame().design.blueprint;
    if (block >= blueprint.blockCount) {
      return;
    }
    const position = blueprint.blockAt(block).position;
    this.view.slice = position.x;
    this.view.selected = position;
    this.panelDirty = true;
  }

  private exportAttempt(): void {
    const attempt = this.attempt;
    if (attempt === null) {
      return;
    }
    attempt.writeRecord(this.renderer.renderP95());
    Dom.downloadText(
      AttemptExport.fileName(attempt.record),
      AttemptExport.toPrettyJson(attempt.record, this.telemetry.summary())
    );
    this.banner = "Exported " + AttemptExport.fileName(attempt.record) + ".";
    this.panelDirty = true;
  }

  private importBlueprint(): void {
    if (this.importText.length === 0) {
      this.banner = "Paste a blueprint JSON into the box first.";
      this.panelDirty = true;
      return;
    }
    try {
      const blueprint = BlueprintCodec.decode(this.importText);
      this.editor.load(blueprint, App.now());
      this.refreshDesignFrame();
      this.banner = "Imported " + blueprint.name + ".";
      this.goTo(Screen.Design);
    } catch (error) {
      this.banner = "That did not decode as a blueprint.";
      this.panelDirty = true;
    }
  }

  private static now(): number {
    if (typeof performance !== "undefined") {
      return performance.now();
    }
    return Date.now();
  }
}
