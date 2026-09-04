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
import { ActorPainter } from "../render/ActorPainter";
import { PeelPlane } from "../render/PeelPlane";
import { FieldDesign } from "../render/FieldDesign";
import { FieldFrame, isLoudStatus } from "../render/FieldFrame";
import { FieldRenderer } from "../render/FieldRenderer";
import { FrameBuilder } from "../render/FrameBuilder";
import { PredictAnalysis, PredictOutcome } from "../render/PredictAnalysis";
import { ViewMode } from "../render/ViewMode";
import { ViewYaw } from "../render/ViewYaw";
import { ZoomLadder } from "../render/ZoomLadder";
import { OverlayMode, ViewState } from "../render/ViewState";
import { Projection } from "../render/Projection";
import { Arena } from "../sim/Arena";
import { AttemptOutcome } from "../telemetry/AttemptRecord";
import { BlockStructure } from "../structure/BlockStructure";
import { RunEvent } from "../sim/RunEvent";
import { AttemptExport } from "../telemetry/AttemptExport";
import { LIBRARY_KEY, SEEN_GUIDED_RUN_KEY, SessionId } from "../telemetry/SessionStore";
import { Telemetry } from "../telemetry/Telemetry";
import { DialsTable } from "../data/DialsTable";
import { WorkedExample, WorkedExamples } from "../data/WorkedExamples";
import { AttemptSession } from "./AttemptSession";
import { Dispatcher, FitTarget, SimCommand, SimTarget, ViewCommand } from "./Commands";
import { DesignPanels } from "./DesignPanels";
import { Dom } from "./Dom";
import { EditorModel } from "./EditorModel";
import { LocalSessionStore } from "./LocalSessionStore";
import { FieldControls } from "./FieldControls";
import { GestureIntent, GestureKind } from "./GestureIntent";
import { GesturePhase, GestureRecognizer } from "./GestureRecognizer";
import { LayoutMode, layoutModeName, pointerKindName } from "./LayoutMode";
import { PanelGroup, PanelSheet } from "./PanelSheet";
import { ChainRow, RunPanels } from "./RunPanels";
import { Shell } from "./Shell";
import { ShellState } from "./ShellState";
import { Viewport } from "./Viewport";

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
export class App implements SimTarget, FitTarget {
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
  private readonly controlsRoot: HTMLElement;
  private readonly sheetTabsRoot: HTMLElement;
  private readonly hintRoot: HTMLElement;
  private readonly shell: Shell;
  private readonly viewport: Viewport;
  private readonly sheet: PanelSheet;
  private readonly recognizer: GestureRecognizer;
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
  private lastShellMs: number;
  private lastFrameMs: number;
  /**
   * The corners of a mouse rectangle in progress, and only a mouse's: touch-gestures spec
   * 2.1 makes the rectangle a mouse verb, so nothing on the recognizer path writes these.
   */
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
  private devExpanded: boolean;
  private lastZoomRung: number;
  private slicePickerOpen: boolean;
  /**
   * Whether the tap that opened a double-tap pair actually placed a cell (mobile UI spec
   * 6.2). A gesture the tester meant as a view change must not leave an edit behind.
   */
  private lastTapPlaced: boolean;
  /** The 9.1 device fields. Counted per attempt, and reset when one opens. */
  private keyboardUsed: boolean;
  private gestureTaps: number;
  private gestureDrags: number;
  private gestureLongPresses: number;
  private gesturePinches: number;
  private gestureDoubleTaps: number;
  private orientationBase: number;
  /**
   * The markup the chrome last had.
   *
   * The control bar and the tab bar repaint on the shell's ten-hertz clock, and rewriting
   * them when nothing changed would replace the node under a thumb that is halfway through
   * pressing it. The shell already takes this care with its overlay row; a bar that is only
   * reachable by touch needs it more.
   */
  private lastControlsHtml: string;
  private lastTabsHtml: string;
  private lastHintHtml: string;

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
    this.controlsRoot = Dom.require("field-controls");
    this.sheetTabsRoot = Dom.require("sheet-tabs");
    this.hintRoot = Dom.require("field-hint");
    this.renderer = new FieldRenderer(canvas);
    this.shell = new Shell(shellRoot);
    this.viewport = new Viewport(document.documentElement, (): void => {
      // A mode change repaints everything: the shell condenses, the overlay keys move to
      // the control bar and the sheet appears or goes away (mobile UI spec 4.2-4.4).
      this.panelDirty = true;
    });
    this.sheet = new PanelSheet();
    this.recognizer = new GestureRecognizer();
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
    // Isometric renderer spec 6: the peel default belongs to the screen, and a guided first
    // session opens on Run -- which is the game view, solid, with nothing cut away. Set here
    // as well as in `goTo`, because the first screen is not arrived at through it.
    this.view.peel = this.screen === Screen.Design;
    this.panelDirty = true;
    this.lastPanelMs = 0;
    this.lastShellMs = 0;
    this.lastFrameMs = 0;
    this.dragFrom = null;
    this.dragTo = null;
    this.panning = false;
    this.panFromX = 0;
    this.panFromY = 0;
    this.lastZoomRung = -1;
    this.predictRequestedAtMs = 0;
    this.predictCell = null;
    this.repairDetails = 1;
    this.runners = 2;
    this.banner = "";
    this.importText = "";
    this.devExpanded = false;
    this.slicePickerOpen = false;
    this.lastTapPlaced = false;
    this.keyboardUsed = false;
    this.gestureTaps = 0;
    this.gestureDrags = 0;
    this.gestureLongPresses = 0;
    this.gesturePinches = 0;
    this.gestureDoubleTaps = 0;
    this.orientationBase = this.viewport.orientationChanges;
    this.lastControlsHtml = "";
    this.lastTabsHtml = "";
    this.lastHintHtml = "";

    this.dispatcher = new Dispatcher(this, this.view, this, this, (mode: OverlayMode): void => {
      this.telemetry.noteOverlay(mode, App.now());
      this.panelDirty = true;
    });

    this.wireInput();
    this.viewport.start();
    this.syncSheetTabs();
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
      this.fitView();
    }
    // The long-press hold is the one threshold that fires without an event to hang it on,
    // so the frame clock advances it (mobile UI spec 6.2, 7.3).
    this.recognizer.tick(now);
    this.pumpGestures();

    const attempt = this.attempt;
    if (attempt !== null && this.screen === Screen.Run) {
      attempt.advancePlayback(dt);
      attempt.simulateAhead(AttemptSession.SIM_BUDGET_MS);
      if (attempt.playedOut) {
        this.finishAttempt();
      } else if (attempt.atWaveBoundary) {
        // Spec 4.4: reassignment is inter-wave only, so the loop stops here rather than
        // rolling into the next wave with last wave's allocation.
        // `wave` has already advanced to the wave about to be flown, so it is also the
        // one-based number of the wave that just ended.
        this.banner =
          "Wave " +
          attempt.wave.toString() +
          " is over and the repair window has been worked. Reassign what is left of the crew.";
        this.goTo(Screen.Allocate);
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
    this.noteZoomRung();
    this.renderer.render(frame, this.view);
    // Isometric renderer spec 8: the last rung of the degradation order is a rung down the
    // zoom ladder, and the zoom belongs to the view rather than to the renderer -- so the
    // renderer asks and this applies it, once per level.
    if (this.renderer.detail.takeZoomRequest() && this.view.scale > ZoomLadder.floor) {
      this.zoomBy(0.5);
      this.panelDirty = true;
    }
    this.runPredictIfDue(now, frame);

    // Panels are cheap but not free, and nothing in them changes faster than a tester can
    // read. Ten hertz while a wave is on, on demand otherwise.
    const live = this.screen === Screen.Run || this.screen === Screen.Replay;
    const dirty = this.panelDirty;
    if (dirty || (live && now - this.lastPanelMs > 100)) {
      this.renderPanels(frame);
      this.lastPanelMs = now;
      this.panelDirty = false;
    }
    // The shell is four numbers and a row of buttons, and none of them changes faster than
    // a tester can read. Rewriting it every frame would put sixty DOM writes a second next
    // to a canvas whose whole job is to be measured at sixty frames a second.
    if (dirty || now - this.lastShellMs > 100) {
      const state = this.shellState(frame);
      this.shell.render(state);
      this.renderChrome(state, frame);
      this.lastShellMs = now;
    }
  }

  /**
   * `ViewCommand.fit` (mobile UI spec 7.1): frames the design in the viewport.
   *
   * A view command, never logged, and it exists because a pinch-zoomed tester needs a way
   * back that is not "reload the page".
   */
  public fitView(): void {
    Projection.fit(this.currentDesign(), this.view, this.renderer.width, this.renderer.height);
  }

  /**
   * A quarter turn of the camera (isometric renderer spec 2.2, spec 9).
   *
   * Four states and one key each way, which is what makes this not an orbit camera: there is
   * nothing to reset, no angle to persist and nothing to un-learn. What it buys is the one
   * question a fixed camera cannot answer -- what is behind my turret -- and that is exactly
   * the blind spot UI spec 1.3 needs closed.
   *
   * Refits, unlike everything else that changes the view. The screen extent of a scene
   * differs by yaw, and the alternative to reframing is a turret half off the edge; `fit`
   * picks the largest rung that still fits, so a turn does not zoom a tester out for no
   * reason either (spec 2.4).
   */
  private turnCamera(quarters: number): void {
    this.dispatcher.dispatchView(ViewCommand.yaw(this.view.yaw.turned(quarters).id));
    Projection.fit(this.currentDesign(), this.view, this.renderer.width, this.renderer.height);
    this.telemetry.noteYaw(App.now());
    this.panelDirty = true;
  }

  /**
   * Moves the build plane, and with it the cutaway (spec 6).
   *
   * One control, not two: stepping toward the camera peels one more wall off the front. On
   * Run and Replay the peel starts disengaged -- that is the game view -- so the first step
   * a tester takes there is also the one that opens the turret up, which is what they meant
   * by pressing it.
   */
  private moveBuildPlane(next: number): void {
    this.dispatcher.dispatchView(ViewCommand.slice(next));
    this.telemetry.notePeelMove();
    if (!this.view.peel && (this.screen === Screen.Run || this.screen === Screen.Replay)) {
      this.view.peel = true;
      this.telemetry.notePeel(true, App.now());
    }
    this.panelDirty = true;
  }

  private zoomBy(factor: number): void {
    this.dispatcher.dispatchView(ViewCommand.zoom(factor));
  }

  /**
   * Reports the zoom rung when it changes (isometric renderer spec 11).
   *
   * Once a frame and from one place, because the rung moves for four different reasons -- a
   * wheel, a pinch, a fit, and spec 8's degradation -- and a metric that four call sites have
   * to remember to report is a metric that is silently missing from a third of the records.
   */
  private noteZoomRung(): void {
    const rung = ZoomLadder.rungOf(this.view.scale);
    if (rung === this.lastZoomRung) {
      return;
    }
    this.lastZoomRung = rung;
    this.telemetry.noteZoom(rung, App.now());
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

  /**
   * "Begin the next wave", whichever wave that is.
   *
   * Three cases, and they are all the same command: the first wave of a fresh attempt, the
   * first wave of the attempt the guided first run pre-opened, and the next wave of a run
   * held at an inter-wave boundary. A *finished* attempt is never reused -- flying that
   * again would replay the last attempt's frames while pretending to fly the design the
   * tester just fixed.
   */
  public startWave(): void {
    let attempt = this.attempt;
    const resuming = attempt !== null && attempt.started && !attempt.finished;
    if (!resuming) {
      // A pre-opened attempt is only good for the design it was opened with. The guided
      // first run opens one before the tester has touched anything, and if they visit the
      // editor first, that attempt is a stale copy of the blueprint they just changed.
      const stale =
        attempt === null || attempt.started || attempt.blueprint !== this.editor.blueprint();
      if (stale) {
        this.openAttempt();
        attempt = this.attempt;
      }
    }
    if (attempt === null) {
      return;
    }
    attempt.assign(this.repairDetails, this.runners);
    this.noteDeviceAtWaveStart(attempt);
    if (resuming) {
      attempt.resumeNextWave();
    } else {
      attempt.start();
    }
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
    // 9.1 is per attempt, so the counters start again with the attempt.
    this.keyboardUsed = false;
    this.gestureTaps = 0;
    this.gestureDrags = 0;
    this.gestureLongPresses = 0;
    this.gesturePinches = 0;
    this.gestureDoubleTaps = 0;
    this.orientationBase = this.viewport.orientationChanges;
    this.panelDirty = true;
  }

  /**
   * Closes an attempt's record: the 9.1 device counts first, then everything the run
   * produced.
   *
   * The counts are per attempt and the layout is not among them -- `layoutMode`,
   * `pointerKind` and the viewport are pinned by `noteDeviceAtWaveStart` at the moment 9.1
   * asks for, which is when the wave started, not when it ended.
   */
  private writeAttemptRecord(attempt: AttemptSession): void {
    const device = attempt.record.device;
    device.orientationChanges = this.viewport.orientationChanges - this.orientationBase;
    device.keyboardUsed = this.keyboardUsed;
    device.taps = this.gestureTaps;
    device.drags = this.gestureDrags;
    device.longPresses = this.gestureLongPresses;
    device.pinches = this.gesturePinches;
    device.doubleTaps = this.gestureDoubleTaps;
    attempt.writeRecord(this.renderer.renderP95());
    for (let yaw = 0; yaw < ViewYaw.COUNT; yaw++) {
      attempt.record.renderMsP95ByYaw[yaw] = this.renderer.renderP95OfYaw(yaw);
    }
  }

  /** 9.1: the layout and the pointer as they were at the moment the wave started. */
  private noteDeviceAtWaveStart(attempt: AttemptSession): void {
    const device = attempt.record.device;
    device.layoutMode = layoutModeName(this.viewport.mode);
    device.pointerKind = pointerKindName(this.viewport.pointer);
    device.viewportW = this.viewport.widthPx;
    device.viewportH = this.viewport.heightPx;
    device.devicePixelRatio = this.viewport.devicePixelRatio;
  }

  private finishAttempt(): void {
    const attempt = this.attempt;
    if (attempt === null) {
      return;
    }
    this.writeAttemptRecord(attempt);
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

  /** Gives up on the run in progress and records it as flown and lost. */
  private abandonAttempt(): void {
    const attempt = this.attempt;
    if (attempt !== null && attempt.started && !attempt.finished) {
      this.writeAttemptRecord(attempt);
      this.telemetry.finishAttempt(
        AttemptOutcome.Lost,
        attempt.record.firstFailedJoint,
        App.now()
      );
    }
    this.banner = "";
    this.goTo(Screen.Design);
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
    // 8.4: the replay opens with the chain tab selected and the first-failed-joint callout
    // above the fold. It is the answer the tester came for; it does not get scrolled to.
    this.sheet.select(PanelGroup.Chain);
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
    // 8.4: "fix this blueprint" lands on Design with the sheet open on the inspector and
    // the stress overlay already selected in the control bar.
    this.sheet.select(PanelGroup.Inspector);
  }

  /**
   * Points the tab bar at the current screen's panel groups (mobile UI spec 4.3).
   *
   * The groups are the existing panels, not new ones. Allocate, Summary and Library are one
   * panel each, so they get no tab bar and every panel shows -- a sheet is for choosing
   * between panels, and there is nothing to choose between.
   */
  private syncSheetTabs(): void {
    if (this.screen === Screen.Design) {
      this.sheet.setTabs([
        PanelGroup.Palette,
        PanelGroup.Bill,
        PanelGroup.Validation,
        PanelGroup.Inspector,
      ]);
      return;
    }
    if (this.screen === Screen.Run) {
      this.sheet.setTabs([
        PanelGroup.Wave,
        PanelGroup.Stations,
        PanelGroup.Depots,
        PanelGroup.Crew,
        PanelGroup.Lane,
      ]);
      return;
    }
    if (this.screen === Screen.Replay) {
      this.sheet.setTabs([
        PanelGroup.Wave,
        PanelGroup.Stations,
        PanelGroup.Depots,
        PanelGroup.Crew,
        PanelGroup.Lane,
        PanelGroup.Chain,
      ]);
      return;
    }
    this.sheet.setTabs([]);
  }

  private goTo(screen: Screen): void {
    this.screen = screen;
    this.panelDirty = true;
    this.slicePickerOpen = false;
    this.syncSheetTabs();
    // Isometric renderer spec 6: Design is a workshop and opens on an open cutaway; Run and
    // Replay are the game and open on a solid turret. The loop alternates between the two,
    // and the second half is the half that was worthless when a run was a cross-section.
    const peel = screen === Screen.Design;
    if (peel !== this.view.peel) {
      this.view.peel = peel;
      this.telemetry.notePeel(peel, App.now());
    }
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
          this.renderer.predict.current,
          this.viewport.coarse
        )
      );
      return;
    }
    if (this.screen === Screen.Allocate) {
      const held = this.attempt;
      const interWave = held !== null && held.started && !held.finished;
      const blueprint = interWave ? held.blueprint : this.editor.blueprint();
      Dom.setHtml(
        this.panelRoot,
        RunPanels.allocate(
          interWave ? (held as AttemptSession).crewAlive : this.dials.crewPool,
          interWave ? frame.stations.length : blueprint.countOfKind(BlockKind.Station),
          this.dials.crewPerStation,
          this.dials.crewPerRepairDetail,
          this.repairDetails,
          this.runners,
          interWave
        )
      );
      return;
    }
    const attempt = this.attempt;
    if (attempt === null) {
      Dom.setHtml(
        this.panelRoot,
        '<section class="panel" data-group="always"><p>no attempt open.</p></section>'
      );
      return;
    }
    if (this.screen === Screen.Run) {
      if (!attempt.started) {
        Dom.setHtml(
          this.panelRoot,
          '<section class="panel" data-group="always"><h2>ready</h2><p class="hint">' +
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
          '<section class="panel actions" data-group="always">' +
          '<button class="primary" data-action="fix">' +
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

  /**
   * The chrome the mobile UI spec adds: the field control bar, the sheet's tab bar and the
   * field caption (4.2, 4.3, 6.1, 6.4).
   *
   * All three are filled from the one `ShellState` the shell is filled from, so a value
   * cannot disagree between the two places a phone shows it at once.
   */
  private renderChrome(state: ShellState, frame: FieldFrame): void {
    this.updateBadges(frame);
    // `Wide` is today's layout, unchanged: the overlay keys and the cross-section stay in
    // the shell and there is no bar under the field.
    const controls = state.layout === LayoutMode.Wide ? "" : FieldControls.render(state);
    if (controls !== this.lastControlsHtml) {
      Dom.setHtml(this.controlsRoot, controls);
      this.lastControlsHtml = controls;
    }
    // The tab bar is a `Compact` thing: `Medium` keeps the panels docked at 300 px (4.5)
    // and `Wide` is today's rail, so neither has anything to tab between.
    const tabs = state.compact ? this.sheet.render() : "";
    if (tabs !== this.lastTabsHtml) {
      Dom.setHtml(this.sheetTabsRoot, tabs);
      this.lastTabsHtml = tabs;
    }
    this.panelRoot.setAttribute("data-tab", state.compact ? this.sheet.selectedName : "");
    document.documentElement.setAttribute(
      "data-sheet",
      this.sheet.collapsed ? "collapsed" : "open"
    );
    // Already markup: the caption draws the keys it names as key caps (6.4).
    const hint = FieldControls.caption(state.coarse);
    if (hint !== this.lastHintHtml) {
      Dom.setHtml(this.hintRoot, hint);
      this.lastHintHtml = hint;
    }
  }

  /**
   * The tab bar's badges (mobile UI spec 4.3).
   *
   * §3.2 of the UI spec gives dry and no-path stations "the loudest treatment in the whole
   * build", and a panel behind a tab is the quietest place in it. The badge is that
   * requirement re-stated for a layout where the panel is not always visible.
   */
  private updateBadges(frame: FieldFrame): void {
    this.sheet.clearBadges();
    const geometry = this.editor.geometry;
    this.sheet.setBadge(PanelGroup.Validation, geometry === null ? 0 : geometry.violations.length);
    let loud = 0;
    for (let i = 0; i < frame.stations.length; i++) {
      if (isLoudStatus(frame.stations[i].status)) {
        loud++;
      }
    }
    this.sheet.setBadge(PanelGroup.Stations, loud);
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
    state.viewMode = this.view.mode;
    state.yaw = this.view.yaw.id;
    state.peeling = this.view.peel;
    state.peeledSections = new PeelPlane(
      frame.design.sliceMin,
      frame.design.sliceMax,
      this.view.slice,
      this.view.yaw,
      this.view.mode,
      this.view.peel
    ).peeledCount;
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
    state.renderDetail = this.renderer.detail.describe();
    state.cellCount = frame.aliveBlocks;
    state.tick = frame.tick;
    state.leadSeconds = attempt === null ? 0 : attempt.leadSeconds;
    state.stalled = attempt !== null && attempt.stalled;
    if (!this.store.persistent) {
      state.note = "local storage is blocked: this session will not survive a reload";
    }

    state.layout = this.viewport.mode;
    state.coarse = this.viewport.coarse;
    state.condensed = this.viewport.mode !== LayoutMode.Wide;
    state.compact = this.viewport.mode === LayoutMode.Compact;
    state.useSliceStepper = this.sliceStripWouldOverflow(state);
    state.slicePickerOpen = this.slicePickerOpen;
    state.devExpanded = this.devExpanded;
    state.inDesign = this.screen === Screen.Design;
    state.canUndo = this.editor.canUndo;
    state.canRedo = this.editor.canRedo;
    state.attemptOpen = attempt !== null && attempt.started;
    state.paused = attempt !== null && attempt.paused;
    state.showScrub = attempt !== null && this.screen === Screen.Replay;
    state.scrubIndex = attempt === null ? 0 : attempt.frameIndex();
    state.scrubCount = attempt === null ? 0 : attempt.timeline.length;
    this.fillPrimaryAction(state, attempt);
    return state;
  }

  /**
   * Whether the per-column strip still fits on one row (mobile UI spec 4.5).
   *
   * A width question, not a device question, which is why the answer applies in `Wide` too:
   * at the 48 x 48 grid §5 pins, forty-eight numbered buttons do not fit on any row anyone
   * owns, and the stepper is what keeps the cross-section reachable there.
   */
  private sliceStripWouldOverflow(state: ShellState): boolean {
    const columns = state.sliceMax - state.sliceMin + 1;
    // A slice cell is about 24 px of button plus its gap, and the strip carries a label.
    const stripPx = columns * 30 + 90;
    const availablePx =
      this.viewport.mode === LayoutMode.Compact
        ? this.renderer.width
        : this.viewport.widthPx - this.viewport.widthPx * 0.55;
    return stripPx > availablePx;
  }

  /**
   * The current screen's one action, surfaced outside the sheet (mobile UI spec 8.4).
   *
   * "Start wave 1 is reachable with the panel sheet collapsed. A tester whose first action
   * is behind a tab has been put in the editor, which is the thing §7.2 exists to prevent."
   */
  private fillPrimaryAction(state: ShellState, attempt: AttemptSession | null): void {
    if (this.screen === Screen.Design) {
      state.primaryLabel = "allocate crew →";
      state.primaryAction = "allocate";
      return;
    }
    if (this.screen === Screen.Allocate) {
      const interWave = attempt !== null && attempt.started && !attempt.finished;
      state.primaryLabel = interWave ? "next wave →" : "start wave 1 →";
      state.primaryAction = "start";
      return;
    }
    if (this.screen === Screen.Run && attempt !== null && !attempt.started) {
      state.primaryLabel = "start wave 1";
      state.primaryAction = "start";
      return;
    }
    if (this.screen === Screen.Replay) {
      state.primaryLabel = "fix this blueprint →";
      state.primaryAction = "fix";
      return;
    }
    state.primaryLabel = "";
    state.primaryAction = "";
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
    Dom.onAction(this.shell.devElement, (action: string, value: string): void => {
      this.onAction(action, value);
    });
    Dom.onInput(this.panelRoot, (name: string, value: string): void => {
      this.onFieldInput(name, value);
    });
    // The field control bar and the sheet's tab bar carry the same `data-action` and
    // `data-input` vocabulary the panels do (mobile UI spec 6.1), so they are wired the
    // same way and no gesture needs a command of its own.
    Dom.onAction(this.controlsRoot, (action: string, value: string): void => {
      this.onAction(action, value);
    });
    Dom.onAction(this.sheetTabsRoot, (action: string, value: string): void => {
      this.onAction(action, value);
    });
    Dom.onInput(this.controlsRoot, (name: string, value: string): void => {
      this.onFieldInput(name, value);
    });
    this.wireScrubGrab(this.panelRoot);
    this.wireScrubGrab(this.controlsRoot);
    window.addEventListener("pointerup", (): void => {
      const attempt = this.attempt;
      if (attempt !== null) {
        attempt.setScrubbing(false);
      }
    });

    // Both input modalities stay live in every mode (mobile UI spec 3.2): a mouse keeps
    // today's shift-drag and alt-click exactly as they are, and anything that is not a
    // mouse goes through the recognizer. A tablet with a keyboard case is one person with
    // two hands, and a build that picks one for them is wrong twice.
    this.canvas.addEventListener("pointerdown", (event: PointerEvent): void => {
      this.dismissDrawer();
      if (event.pointerType === "mouse") {
        this.onCanvasDown(event);
        return;
      }
      const before = this.recognizer.phase;
      this.recognizer.down(event.pointerId, event.clientX, event.clientY, App.now());
      if (before !== GesturePhase.Pinching && this.recognizer.phase === GesturePhase.Pinching) {
        this.gesturePinches++;
      }
      this.pumpGestures();
    });
    this.canvas.addEventListener("pointermove", (event: PointerEvent): void => {
      if (event.pointerType === "mouse") {
        this.onCanvasMove(event);
      }
    });
    // Touch moves are read from the window rather than the canvas, and no pointer capture
    // is taken: a finger that slides off the cross-section is still panning it, and the
    // recognizer ignores any pointer it did not see go down on the canvas, so a touch that
    // began on the sheet stays the sheet's.
    window.addEventListener("pointermove", (event: PointerEvent): void => {
      if (event.pointerType === "mouse") {
        return;
      }
      this.recognizer.move(event.pointerId, event.clientX, event.clientY, App.now());
      this.pumpGestures();
    });
    window.addEventListener("pointerup", (event: PointerEvent): void => {
      if (event.pointerType === "mouse") {
        this.onCanvasUp(event);
        return;
      }
      this.recognizer.up(event.pointerId, event.clientX, event.clientY, App.now());
      this.pumpGestures();
    });
    // 6.2: when the browser takes the gesture over -- a back-swipe, a notification, a call
    // -- the placement is discarded rather than committed.
    this.canvas.addEventListener("pointercancel", (event: PointerEvent): void => {
      this.recognizer.cancel(event.pointerId, App.now());
      this.pumpGestures();
    });
    this.canvas.addEventListener(
      "wheel",
      (event: WheelEvent): void => {
        event.preventDefault();
        this.zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
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

  private wireScrubGrab(root: HTMLElement): void {
    root.addEventListener(
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
  }

  // ---------------------------------------------------------------- gestures

  /**
   * Drains the recognizer and turns each intent into a command (mobile UI spec 7.1).
   *
   * **No new `SimCommand`. Not one.** Every gesture below resolves either to an existing
   * `SimCommand` -- the same `placeBlueprint`, `focus`, `startWave` a mouse produces -- or
   * to a `ViewCommand`. That is what makes an attempt flown on a phone export a command log
   * that replays bit-identically in the desktop build and in the headless runner; if a
   * gesture could reach sim state, phone attempts would become a second, unverifiable
   * population of data.
   */
  private pumpGestures(): void {
    const intents = this.recognizer.drain();
    for (let i = 0; i < intents.length; i++) {
      this.applyGesture(intents[i]);
    }
  }

  private applyGesture(intent: GestureIntent): void {
    const kind = intent.kind;
    if (kind === GestureKind.Cancel) {
      // 6.2's cancel rules, with less left to cancel: touch-gestures spec 2.4. A touch drag
      // no longer places, so what a pinch or a `pointercancel` discards here is a mouse
      // rectangle caught mid-drag by a cancelled pointer. Kept, because a silent
      // uncommanded edit is still worse than a lost gesture.
      this.dragFrom = null;
      this.dragTo = null;
      return;
    }
    if (kind === GestureKind.Zoom) {
      this.zoomBy(intent.scale);
      return;
    }
    if (kind === GestureKind.Pan) {
      this.dispatcher.dispatchView(ViewCommand.pan(intent.dx, intent.dy));
      return;
    }
    if (kind === GestureKind.DoubleTap) {
      this.gestureDoubleTaps++;
      // The tap that opened the pair has already placed a cell. A double tap is a view
      // change, so it takes that placement back before framing (6.2).
      if (this.screen === Screen.Design && this.lastTapPlaced && this.editor.undo(App.now())) {
        this.refreshDesignFrame();
      }
      this.lastTapPlaced = false;
      this.dispatcher.dispatchView(ViewCommand.fit());
      this.panelDirty = true;
      return;
    }
    if (kind === GestureKind.Tap) {
      this.onTap(intent.x, intent.y);
      return;
    }
    if (kind === GestureKind.LongPress || kind === GestureKind.Sweep) {
      if (kind === GestureKind.LongPress) {
        this.gestureLongPresses++;
      }
      // Inspect, place nothing (6.2). On a coarse pointer the selection is what predict
      // reads, so a sweep is hover, performed deliberately (6.3).
      this.dragFrom = null;
      this.dragTo = null;
      this.dispatcher.dispatchView(ViewCommand.select(this.inspectCellAt(intent.x, intent.y)));
      this.panelDirty = true;
      return;
    }
    this.onDrag(intent);
  }

  private onTap(clientX: number, clientY: number): void {
    this.gestureTaps++;
    this.lastTapPlaced = false;
    const cell = this.cellAtClient(clientX, clientY);
    if (this.screen === Screen.Design) {
      if (this.editor.applyRect(cell, cell, App.now())) {
        this.refreshDesignFrame();
        this.lastTapPlaced = true;
      }
      this.dispatcher.dispatchView(ViewCommand.select(cell));
      this.panelDirty = true;
      return;
    }
    // 6.2: focus-fire the attacker under the tap, else inspect the cell. The same `focus`
    // a click already is.
    const target = this.screen === Screen.Run ? this.attackerAt(clientX, clientY) : -1;
    if (target >= 0) {
      this.dispatcher.dispatchSim(SimCommand.focus(target));
    } else {
      this.dispatcher.dispatchView(ViewCommand.select(this.inspectCellAt(clientX, clientY)));
    }
    this.panelDirty = true;
  }

  /**
   * A one-finger drag pans, on every screen (touch-gestures spec 2).
   *
   * This routine only ever sees a finger or a stylus: a mouse goes to `onCanvasDown` and
   * never reaches the recognizer (mobile UI spec 3.2), which is why the rectangle can stay
   * a mouse verb while this one is a pan. Nothing here writes to the blueprint, so on touch
   * the tap is the only gesture that edits, one cell at a time (2.1).
   */
  private onDrag(intent: GestureIntent): void {
    if (intent.kind === GestureKind.DragStart) {
      this.panFromX = intent.x;
      this.panFromY = intent.y;
      return;
    }
    if (intent.kind === GestureKind.DragMove) {
      this.dispatcher.dispatchView(
        ViewCommand.pan(intent.x - this.panFromX, intent.y - this.panFromY)
      );
      this.panFromX = intent.x;
      this.panFromY = intent.y;
      return;
    }
    if (intent.kind !== GestureKind.DragEnd) {
      return;
    }
    this.gestureDrags++;
  }

  /**
   * 4.4: the landscape drawer is dismissed by tapping the field.
   *
   * Only in that layout. Everywhere else the sheet is stacked below the field rather than
   * overlaid on it, and closing it because the tester touched the canvas would be a
   * design that jumps under their finger -- which 4.4 says costs more than the 300 px does.
   */
  private dismissDrawer(): void {
    if (this.viewport.compactLandscape && !this.sheet.collapsed) {
      this.sheet.setCollapsed(true);
      this.panelDirty = true;
    }
  }

  private cellAtClient(clientX: number, clientY: number): IVec3 {
    return this.renderer.cellAt(this.frame(), this.view, clientX, clientY);
  }

  /**
   * The cell an inspect addresses (isometric renderer spec 5.2, spec 5.3).
   *
   * Two rules, and the split is the spec's: **placement lands in the build plane and only
   * ever there**, so on Design a hover has to predict where the click will go and therefore
   * reads the plane too. Everywhere else there is nothing to place, so an inspect addresses
   * the frontmost visible block instead -- which is what a tester means when they point at a
   * wall four sections back during a replay.
   */
  private inspectCellAt(clientX: number, clientY: number): IVec3 {
    if (this.screen === Screen.Design) {
      return this.cellAtClient(clientX, clientY);
    }
    const picked = this.renderer.pickAt(this.frame(), this.view, clientX, clientY);
    return picked === null ? this.cellAtClient(clientX, clientY) : picked;
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
    this.dispatcher.dispatchView(
      ViewCommand.select(this.inspectCellAt(event.clientX, event.clientY))
    );
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
    this.dispatcher.dispatchView(
      ViewCommand.inspect(this.inspectCellAt(event.clientX, event.clientY))
    );
    if (this.dragFrom !== null) {
      this.dragTo = this.cellAtClient(event.clientX, event.clientY);
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

  /**
   * Hit-tests the lane for a focus-fire click.
   *
   * Against the projected centre of each unit's body rather than against a ground line: the
   * units stand in the world now (isometric renderer spec 7.4), so where they are on screen
   * is a question for the projection and not for a screen-space rule about lanes.
   */
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
    const level = frame.design.pad.level;
    let best = -1;
    let bestDistance = projection.scale;
    for (let i = 0; i < frame.attackers.length; i++) {
      const unit = frame.attackers[i];
      const x = projection.screenX(unit.laneX + 0.5, unit.laneZ + 0.5);
      const y = projection.screenY(
        unit.laneX + 0.5,
        level + ActorPainter.ATTACKER_HEIGHT * 0.5,
        unit.laneZ + 0.5
      );
      const dx = x - localX;
      const dy = y - localY;
      const distance = Math.sqrt(dx * dx + dy * dy);
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
    // 9.1: whether any shortcut fired. Pooled with the gesture counts it answers the one
    // question 9.2 says pooling destroys -- was the overlay unreadable, or was the control
    // not where the tester's thumb was.
    if (App.isBoundKey(key)) {
      this.keyboardUsed = true;
    }
    if (key >= "1" && key <= "5") {
      this.dispatcher.dispatchView(ViewCommand.overlay(Number(key) as OverlayMode));
      return;
    }
    if (key === "[" || key === "]") {
      const design = this.currentDesign();
      this.moveBuildPlane(design.clampSlice(this.view.slice + (key === "[" ? -1 : 1)));
      return;
    }
    if (key === "q" || key === "e") {
      this.turnCamera(key === "q" ? 1 : -1);
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

  /** The keys `onKey` acts on, kept beside it so the 9.1 flag cannot drift from them. */
  private static isBoundKey(key: string): boolean {
    if (key >= "1" && key <= "5") {
      return true;
    }
    return (
      key === "[" ||
      key === "]" ||
      key === "v" ||
      key === "z" ||
      key === "y" ||
      key === " " ||
      key === "," ||
      key === "." ||
      key === "Escape"
    );
  }

  private onFieldInput(name: string, value: string): void {
    if (name === "name") {
      // Deliberately does not mark the panel dirty: rebuilding it would replace the input
      // the tester is typing into. Nothing else on screen shows the name.
      this.editor.rename(value);
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
      this.moveBuildPlane(Number(value));
      this.slicePickerOpen = false;
      this.panelDirty = true;
      return;
    }
    // Mobile UI spec 6.1: the on-screen half of the verb table. Every one of these resolves
    // to a command the keyboard already fires -- nothing is moved off the keyboard, and
    // nothing here is a new `SimCommand` (7.1).
    if (action === "slice-step") {
      const design = this.currentDesign();
      this.moveBuildPlane(design.clampSlice(this.view.slice + Number(value)));
      return;
    }
    if (action === "slice-picker") {
      this.slicePickerOpen = !this.slicePickerOpen;
      this.panelDirty = true;
      return;
    }
    if (action === "yaw") {
      this.turnCamera(Number(value));
      return;
    }
    if (action === "fit") {
      this.dispatcher.dispatchView(ViewCommand.fit());
      this.panelDirty = true;
      return;
    }
    if (action === "deselect") {
      this.dispatcher.dispatchView(ViewCommand.select(null));
      this.panelDirty = true;
      return;
    }
    if (action === "sheet-tab") {
      this.sheet.select(PanelSheet.byName(value));
      this.panelDirty = true;
      return;
    }
    if (action === "sheet-toggle") {
      this.sheet.toggle();
      this.panelDirty = true;
      return;
    }
    if (action === "projection") {
      // Isometric renderer spec 9: the flat cross-section, from the dev readout only. Kept
      // because it is the clearest possible picture of one slice and costs nothing to keep;
      // out of the tester's control bar because the build no longer validates it.
      const next = this.view.mode === ViewMode.Iso ? ViewMode.Flat : ViewMode.Iso;
      this.dispatcher.dispatchView(ViewCommand.mode(next));
      Projection.fit(this.currentDesign(), this.view, this.renderer.width, this.renderer.height);
      this.panelDirty = true;
      return;
    }
    if (action === "dev-expand") {
      // 4.2: the chip expands to the full §6 readout. It is never off -- a tester's "it
      // stuttered" has to arrive with numbers, and that is stronger on a phone, not weaker.
      this.devExpanded = !this.devExpanded;
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
    if (action === "abandon") {
      // Leaving a run half-flown is a legitimate thing for a tester to do, and
      // "attempts to abandonment" is one of the numbers §7.3 wants.
      this.abandonAttempt();
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
    this.writeAttemptRecord(attempt);
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
