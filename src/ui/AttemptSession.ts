import { Dials } from "../config/Dials";
import { AmmoLoadId } from "../materials/AmmoTable";
import { Blueprint } from "../blueprint/Blueprint";
import { BlockStructure } from "../structure/BlockStructure";
import { FieldDesign } from "../render/FieldDesign";
import { FieldFrame, StationStatus } from "../render/FieldFrame";
import { FrameBuilder } from "../render/FrameBuilder";
import { FrameTimeline } from "../render/FrameTimeline";
import { Arena } from "../sim/Arena";
import { InputKind, inputKindName } from "../sim/ReplayRecorder";
import { LiveInputQueue } from "../sim/InputSource";
import { RunLoop, RunPhase } from "../sim/RunLoop";
import { RunSimulation } from "../sim/RunSimulation";
import { ScriptedAttacker } from "../sim/ScriptedAttacker";
import { WaveScript } from "../sim/WaveScript";
import { RunOutcome } from "../sim/RunResult";
import { runEventKindName } from "../sim/RunEvent";
import { AttemptCommand, AttemptEvent, AttemptOutcome, AttemptRecord } from "../telemetry/AttemptRecord";
import { SampleSet } from "../telemetry/SampleSet";

/**
 * One attempt: the simulation, the frames it has produced, and the playback clock that
 * decides which of them the tester is looking at.
 *
 * **Why playback and simulation are separate clocks.** A structural re-solve costs about
 * 100 ms at P0 sizes, and it happens a hundred-odd times across a five-wave run. Stepping
 * the simulation in lockstep with the frame clock would therefore drop six frames every
 * couple of seconds, and a tester cannot tell a stutter caused by the solver from a stutter
 * caused by a renderer -- which would put a confound straight through §1.1, the one
 * question this build exists to answer.
 *
 * So the simulation runs *ahead* of playback, in whatever slice of each animation frame is
 * left over, keeping a small buffer of finished ticks. Playback then reads finished frames
 * at a steady 1x. When a collapse cascade costs more than the buffer holds, playback stalls
 * rather than tearing, the shell says so, and the dev readout reports the solve that did
 * it. Nothing is smoothed over: §6 exists so that "it stuttered" arrives with numbers.
 *
 * The cost is honest and bounded: a focus-fire click lands at the simulation's leading
 * edge, which is at most `LEAD_TARGET_SECONDS` ahead of what the tester is watching. The
 * lead is shown in the dev readout for exactly that reason.
 */
export class AttemptSession {
  /** How far ahead of playback the simulation tries to stay. */
  public static readonly LEAD_TARGET_SECONDS: number = 1.25;
  /** Milliseconds per animation frame the simulation may take. Leaves the rest to drawing. */
  public static readonly SIM_BUDGET_MS: number = 9;

  public readonly blueprint: Blueprint;
  public readonly design: FieldDesign;
  public readonly record: AttemptRecord;
  public readonly timeline: FrameTimeline;
  public readonly solverMs: SampleSet;
  public readonly tickMs: SampleSet;

  private readonly loop: RunLoop;
  private readonly queue: LiveInputQueue;
  private readonly builder: FrameBuilder;
  private readonly dials: Dials;
  private playbackSeconds: number;
  private pausedValue: boolean;
  private startedValue: boolean;
  private lastSolveCount: number;
  private dryAccumulator: number;
  private noPathAccumulator: number;
  private scrubbing: boolean;
  private waveHeld: boolean;

  public constructor(
    blueprint: Blueprint,
    design: FieldDesign,
    arena: Arena,
    dials: Dials,
    seed: number,
    record: AttemptRecord
  ) {
    this.blueprint = blueprint;
    this.design = design;
    this.dials = dials;
    this.record = record;
    this.queue = new LiveInputQueue();
    const script = WaveScript.p0(arena.laneCentreX);
    this.loop = RunSimulation.withDefaults(dials, arena).begin(
      blueprint,
      new ScriptedAttacker(script),
      script,
      this.queue,
      seed
    );
    this.builder = new FrameBuilder(design);
    this.timeline = new FrameTimeline();
    this.solverMs = new SampleSet(400);
    this.tickMs = new SampleSet(400);
    this.playbackSeconds = 0;
    this.pausedValue = false;
    this.startedValue = false;
    this.lastSolveCount = 0;
    this.dryAccumulator = 0;
    this.noPathAccumulator = 0;
    this.scrubbing = false;
    this.waveHeld = false;
    // A frame for tick zero, so the Run screen has something to draw before the first
    // step and the Allocate screen can show the design as it will be flown.
    this.captureFrame();
  }

  // ---------------------------------------------------------------- state

  public get started(): boolean {
    return this.startedValue;
  }

  public get paused(): boolean {
    return this.pausedValue;
  }

  public get finished(): boolean {
    return this.loop.finished;
  }

  /** True once the tester has seen every tick the simulation produced. */
  public get playedOut(): boolean {
    return this.loop.finished && this.playbackSeconds >= this.timeline.durationSeconds - 1e-6;
  }

  /** Seconds of finished simulation waiting to be shown. Negative never happens. */
  public get leadSeconds(): number {
    const lead = this.timeline.durationSeconds - this.playbackSeconds;
    return lead < 0 ? 0 : lead;
  }

  /** True when playback has caught up with the solver and is waiting on it. */
  public get stalled(): boolean {
    return (
      this.startedValue &&
      !this.pausedValue &&
      !this.waveHeld &&
      !this.loop.finished &&
      this.leadSeconds <= 0
    );
  }

  /**
   * True once a wave has ended, its repairs are done, and the tester has seen it happen.
   *
   * Spec 4.4 makes reassignment inter-wave only, so the run has to actually stop there --
   * and because the simulation runs ahead of playback it would otherwise have started the
   * next wave before the tester finished watching the last one. So the loop is held at the
   * boundary until playback drains to it, and then until the tester says go.
   */
  public get atWaveBoundary(): boolean {
    return this.waveHeld && this.leadSeconds <= 1e-6 && !this.loop.finished;
  }

  public get held(): boolean {
    return this.waveHeld;
  }

  /** Lets the simulation open the next wave. The other half of `atWaveBoundary`. */
  public resumeNextWave(): void {
    this.waveHeld = false;
    this.pausedValue = false;
  }

  public get wave(): number {
    return this.loop.waveIndex;
  }

  public get waveTotal(): number {
    return this.loop.waveTotal;
  }

  public get wavesSurvived(): number {
    return this.loop.wavesSurvived;
  }

  public get waveTitle(): string {
    return this.loop.waveTitle;
  }

  public get phase(): RunPhase {
    return this.loop.phase;
  }

  public get solveCount(): number {
    return this.loop.solveCount;
  }

  public get outcome(): RunOutcome {
    return this.loop.result().outcome;
  }

  public get crewAlive(): number {
    return this.loop.crew.aliveCount;
  }

  /**
   * The live structure, as damaged as the simulation has got.
   *
   * Handed out so the predictive overlay can ask its question of the turret as it stands
   * rather than of the blueprint as drawn -- §4 requires predict to be live during a run,
   * and after two waves those are not the same structure. It is the simulation's own
   * object, so callers speculate on `clone()` and never on this.
   */
  public get liveStructure(): BlockStructure {
    return this.loop.structure;
  }

  public frame(): FieldFrame {
    return this.timeline.frameAt(this.timeline.indexAtTime(this.playbackSeconds));
  }

  public frameIndex(): number {
    return this.timeline.indexAtTime(this.playbackSeconds);
  }

  // ---------------------------------------------------------------- commands

  public start(): void {
    this.startedValue = true;
    this.pausedValue = false;
  }

  public setPaused(paused: boolean): void {
    this.pausedValue = paused;
  }

  public togglePaused(): void {
    this.pausedValue = !this.pausedValue;
  }

  /** Spec 4.6: click a target to focus fire. Applied at the simulation's leading edge. */
  public focus(target: number): void {
    if (target < 0) {
      this.queue.push(InputKind.ClearFocus, -1, -1);
      return;
    }
    this.queue.push(InputKind.FocusTarget, target, -1);
  }

  public selectLoad(station: number, load: AmmoLoadId): void {
    this.queue.push(InputKind.SelectLoad, station, load as number);
  }

  public assign(repairDetails: number, runners: number): void {
    this.queue.push(InputKind.SetAllocation, repairDetails, runners);
  }

  /**
   * Applies an allocation now and re-derives the tick-zero frame (crew-visible spec 2.3).
   *
   * The Allocate screen draws that frame, so this is what makes the crew on the field move
   * as the steppers move. A screen that shows a fixed default while the tester edits away
   * from it is worse than one that shows nothing, because it looks right.
   *
   * Refused once the run has started, where reassignment is inter-wave only (spec 4.4) and
   * arrives on a tick like every other command. Returns whether it applied.
   */
  public previewAllocation(repairDetails: number, runners: number): boolean {
    if (!this.loop.previewAllocation(repairDetails, runners)) {
      return false;
    }
    // A correction of the frame nobody has watched yet, not a second tick zero -- and it
    // deliberately does not run `captureFrame`'s accumulators, which have already charged
    // this tick once.
    this.timeline.replaceLast(this.builder.fromRun(this.loop));
    return true;
  }

  public get focusedTarget(): number {
    return this.loop.focusedTarget;
  }

  // ---------------------------------------------------------------- clocks

  /**
   * Steps the simulation until the lead buffer is full or the time budget is spent.
   *
   * Always takes at least one tick when the buffer is empty, so a solve longer than the
   * whole budget cannot deadlock playback -- it just costs that frame, visibly.
   */
  public simulateAhead(budgetMs: number): void {
    if (!this.startedValue || this.loop.finished) {
      return;
    }
    if (this.waveHeld) {
      return;
    }
    const deadline = AttemptSession.now() + budgetMs;
    let stepped = 0;
    while (!this.loop.finished) {
      const starving = this.leadSeconds <= 0;
      if (!starving && this.leadSeconds >= AttemptSession.LEAD_TARGET_SECONDS) {
        break;
      }
      if (stepped > 0 && AttemptSession.now() >= deadline) {
        break;
      }
      const started = AttemptSession.now();
      this.loop.step();
      const elapsed = AttemptSession.now() - started;
      if (this.loop.solveCount > this.lastSolveCount) {
        // The tick that paid for a structural analysis. Charged to the solver, because
        // that is what §6's p95 target is about.
        this.solverMs.push(elapsed);
        this.lastSolveCount = this.loop.solveCount;
      } else {
        this.tickMs.push(elapsed);
      }
      this.captureFrame();
      stepped++;
      if (this.loop.phase === RunPhase.BetweenWaves) {
        // The wave is over and the repair window has been resolved. Stop here: the tester
        // is owed the chance to reassign before the next one walks in.
        this.waveHeld = true;
        return;
      }
    }
  }

  /** Advances the playback clock. `dtSeconds` is real time, clamped against long stalls. */
  public advancePlayback(dtSeconds: number): void {
    if (!this.startedValue || this.pausedValue || this.scrubbing) {
      return;
    }
    const capped = dtSeconds > 0.25 ? 0.25 : dtSeconds;
    const next = this.playbackSeconds + capped;
    const available = this.timeline.durationSeconds;
    this.playbackSeconds = next > available ? available : next;
  }

  /** Replay seeking. A view command: it moves the clock and never the simulation. */
  public seekToTick(tick: number): void {
    const frame = this.timeline.frameAt(tick);
    this.playbackSeconds = frame.timeSeconds;
  }

  public seekToFraction(fraction: number): void {
    this.playbackSeconds = this.timeline.durationSeconds * fraction;
  }

  public stepFrames(delta: number): void {
    this.seekToTick(this.frameIndex() + delta);
  }

  /** Freezes the playback clock while a scrub is in progress. */
  public setScrubbing(scrubbing: boolean): void {
    this.scrubbing = scrubbing;
  }

  public get watchedFraction(): number {
    const duration = this.timeline.durationSeconds;
    return duration > 0 ? this.playbackSeconds / duration : 0;
  }

  // ---------------------------------------------------------------- recording

  private captureFrame(): void {
    const frame = this.builder.fromRun(this.loop);
    this.timeline.append(frame);
    this.timeline.setEvents(this.loop.events());
    // Dry and no-path seconds, accumulated off the frames rather than the simulation: the
    // renderer's own reading of station status is the one the tester saw, so the metric and
    // the picture cannot disagree (§7 resupply legibility).
    for (let i = 0; i < frame.stations.length; i++) {
      const status = frame.stations[i].status;
      if (status === StationStatus.Dry) {
        this.dryAccumulator += this.dials.tickSeconds;
      } else if (status === StationStatus.NoPath) {
        this.noPathAccumulator += this.dials.tickSeconds;
      }
    }
  }

  /** Fills the attempt record from the finished run. Safe to call more than once. */
  public writeRecord(renderMsP95: number): void {
    const result = this.loop.result();
    this.record.outcome = result.won ? AttemptOutcome.Survived : AttemptOutcome.Lost;
    this.record.wavesSurvived = result.wavesSurvived;
    this.record.runSeconds = result.elapsedSeconds;
    this.record.dryStationSeconds = this.dryAccumulator;
    this.record.noPathSeconds = this.noPathAccumulator;
    this.record.firstFailedJoint = result.replay.firstFailedJoint;
    this.record.solverMsP95 = this.solverMs.p95;
    this.record.solverMsMax = this.solverMs.max;
    this.record.renderMsP95 = renderMsP95;
    this.record.solveCount = result.structuralSolves;
    this.record.cellCount = this.blueprint.blockCount;

    const commands: AttemptCommand[] = [];
    const inputs = result.replay.inputs;
    for (let i = 0; i < inputs.length; i++) {
      commands.push(
        new AttemptCommand(
          inputs[i].timeSeconds,
          inputKindName(inputs[i].kind),
          inputs[i].value,
          inputs[i].secondary
        )
      );
    }
    this.record.commandLog = commands;

    const events: AttemptEvent[] = [];
    const log = result.replay.events;
    for (let i = 0; i < log.length; i++) {
      const event = log[i];
      events.push(
        new AttemptEvent(
          event.timeSeconds,
          event.wave,
          runEventKindName(event.kind),
          event.subject,
          event.object,
          event.value,
          event.detail
        )
      );
    }
    this.record.events = events;
  }

  public get firstFailedJoint(): { blockLow: number; blockHigh: number } | null {
    return this.loop.firstFailedJoint;
  }

  private static now(): number {
    if (typeof performance !== "undefined") {
      return performance.now();
    }
    return 0;
  }
}
