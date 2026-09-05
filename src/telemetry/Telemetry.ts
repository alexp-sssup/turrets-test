import { Blueprint } from "../blueprint/Blueprint";
import { BlueprintCodec } from "../persistence/BlueprintCodec";
import { JointRef } from "../structure/CollapseResolver";
import { OverlayMode } from "../render/ViewState";
import { AttemptOutcome, AttemptRecord } from "./AttemptRecord";
import { DesignMetrics } from "./DesignMetrics";

/** What a session can tell you across attempts, which is where §1.2 lives. */
export class SessionSummary {
  public readonly attempts: number;
  public readonly flown: number;
  /** Attempts taken before the first surviving run, or -1 when there has not been one. */
  public readonly attemptsToFirstSurvival: number;
  /** Attempts on the current design lineage since the last survival. */
  public readonly attemptsSinceSurvival: number;
  /** How many times the tester edited the blueprint after watching a replay. */
  public readonly fixesAfterReplay: number;
  /** Of those, how many broke in the same place again. */
  public readonly repeatedFailures: number;

  public constructor(
    attempts: number,
    flown: number,
    attemptsToFirstSurvival: number,
    attemptsSinceSurvival: number,
    fixesAfterReplay: number,
    repeatedFailures: number
  ) {
    this.attempts = attempts;
    this.flown = flown;
    this.attemptsToFirstSurvival = attemptsToFirstSurvival;
    this.attemptsSinceSurvival = attemptsSinceSurvival;
    this.fixesAfterReplay = fixesAfterReplay;
    this.repeatedFailures = repeatedFailures;
  }
}

/**
 * The session: an id, a list of attempts, and the bookkeeping that turns what a tester did
 * into the numbers in UI spec 7.3.
 *
 * Deliberately free of I/O and of any clock. Wall-clock times arrive as arguments, and
 * persistence is somebody else's job (`TelemetryStore`), so the whole of this can be tested
 * headlessly -- which matters, because a metric that is silently never recorded is worse
 * than no metric at all.
 *
 * Note what is *not* here: the note box of UI spec 7.4. It was cut from this build on
 * request, so nothing collects free text and the export carries none.
 */
export class Telemetry {
  public readonly sessionId: string;
  private readonly attemptList: AttemptRecord[];
  private currentAttempt: AttemptRecord | null;
  private overlay: OverlayMode;
  private overlaySinceMs: number;
  /** The zoom rung on screen, and which rungs have been visited, as a bitmask. */
  private zoomRung: number;
  private zoomRungsSeen: number;
  private running: boolean;
  private replayWatchedAtMs: number;
  private lastFirstFailedJoint: JointRef | null;
  private lastReplayWasOpened: boolean;

  public constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.attemptList = [];
    this.currentAttempt = null;
    this.overlay = OverlayMode.Material;
    // -1 rather than 0: a clock that legitimately starts at zero must not be mistaken for
    // an unset one, or the first interval of every session goes uncharged.
    this.overlaySinceMs = -1;
    this.zoomRung = -1;
    this.zoomRungsSeen = 0;
    this.running = false;
    this.replayWatchedAtMs = 0;
    this.lastFirstFailedJoint = null;
    this.lastReplayWasOpened = false;
  }

  public get attempts(): readonly AttemptRecord[] {
    return this.attemptList;
  }

  public get current(): AttemptRecord | null {
    return this.currentAttempt;
  }

  public get attemptCount(): number {
    return this.attemptList.length;
  }

  /**
   * Opens a record for an attempt about to be flown.
   *
   * The previous attempt's first failed joint is carried across here, because the field
   * that matters most -- did the fix work, or did the same joint go again -- is a
   * comparison between consecutive attempts and nothing else in the build remembers it.
   */
  public beginAttempt(blueprint: Blueprint, cost: number, seed: number, nowMs: number): AttemptRecord {
    const record = new AttemptRecord(
      this.sessionId,
      this.attemptList.length,
      blueprint.name,
      BlueprintCodec.hash(blueprint),
      BlueprintCodec.encode(blueprint),
      seed,
      [],
      [],
      DesignMetrics.of(blueprint, cost)
    );
    record.previousFirstFailedJoint = this.lastFirstFailedJoint;
    record.editedAfterReplay = this.lastReplayWasOpened;
    record.cellCount = blueprint.blockCount;
    this.attemptList.push(record);
    this.currentAttempt = record;
    this.overlaySinceMs = nowMs;
    this.lastReplayWasOpened = false;
    return record;
  }

  /** Closes the current attempt, and remembers what broke so the next one can be compared. */
  public finishAttempt(outcome: AttemptOutcome, firstFailedJoint: JointRef | null, nowMs: number): void {
    const record = this.currentAttempt;
    if (record === null) {
      return;
    }
    this.chargeDwell(nowMs);
    record.outcome = outcome;
    record.firstFailedJoint = firstFailedJoint;
    if (firstFailedJoint !== null) {
      this.lastFirstFailedJoint = firstFailedJoint;
    }
    this.running = false;
  }

  /** Charges dwell to the outgoing overlay and starts the clock on the incoming one. */
  public noteOverlay(overlay: OverlayMode, nowMs: number): void {
    this.chargeDwell(nowMs);
    this.overlay = overlay;
    if (this.running && overlay === OverlayMode.Predict && this.currentAttempt !== null) {
      // §4: "predict is live during a run". Whether testers actually use it there is the
      // difference between an overlay that anticipates and one that only explains.
      this.currentAttempt.predictOpenedDuringRun = true;
    }
  }

  public noteRunning(running: boolean, nowMs: number): void {
    this.chargeDwell(nowMs);
    this.running = running;
  }

  /**
   * A quarter turn (isometric renderer spec 2.2, spec 11).
   *
   * Counted rather than timed, because the question is whether the camera is turned at all
   * and whether it is turned *before* the wave -- a camera turned only after the turret has
   * fallen over is a sightseeing tool, not a diagnosis one.
   */
  public noteYaw(nowMs: number): void {
    this.chargeDwell(nowMs);
    const record = this.currentAttempt;
    if (record === null) {
      return;
    }
    record.yawChanges += 1;
    if (!this.running) {
      record.yawChangedBeforeRun = true;
    }
  }

  /**
   * The zoom rung on screen (spec 2.3, spec 11).
   *
   * `rung` is an index into the ladder, so "was this read at the floor rung" is a comparison
   * rather than a float test, and the set of rungs a tester visited is a bitmask.
   */
  public noteZoom(rung: number, nowMs: number): void {
    this.chargeDwell(nowMs);
    this.zoomRung = rung;
    this.zoomRungsSeen |= 1 << rung;
    const record = this.currentAttempt;
    if (record !== null) {
      record.zoomRungsUsed = Telemetry.bitCount(this.zoomRungsSeen);
    }
  }

  private static bitCount(mask: number): number {
    let count = 0;
    let bits = mask;
    while (bits !== 0) {
      count += bits & 1;
      bits >>>= 1;
    }
    return count;
  }

  public noteReplayOpened(nowMs: number): void {
    const record = this.currentAttempt;
    if (record === null) {
      return;
    }
    record.replayOpened = true;
    this.lastReplayWasOpened = true;
    this.replayWatchedAtMs = nowMs;
  }

  /** Scrubbing counts: how hard the tester had to work to find the moment. */
  public noteScrub(watchedFraction: number): void {
    const record = this.currentAttempt;
    if (record === null) {
      return;
    }
    record.replayScrubCount++;
    if (watchedFraction > record.replayWatchFraction) {
      record.replayWatchFraction = watchedFraction;
    }
  }

  public noteReplayProgress(watchedFraction: number): void {
    const record = this.currentAttempt;
    if (record === null) {
      return;
    }
    if (watchedFraction > record.replayWatchFraction) {
      record.replayWatchFraction = watchedFraction;
    }
  }

  public summary(): SessionSummary {
    let flown = 0;
    let toFirstSurvival = -1;
    let sinceSurvival = 0;
    let fixes = 0;
    let repeats = 0;
    for (let i = 0; i < this.attemptList.length; i++) {
      const record = this.attemptList[i];
      if (record.outcome !== AttemptOutcome.NotFlown) {
        flown++;
      }
      if (record.survived) {
        if (toFirstSurvival < 0) {
          toFirstSurvival = i + 1;
        }
        sinceSurvival = 0;
      } else {
        sinceSurvival++;
      }
      if (record.editedAfterReplay) {
        fixes++;
        if (record.sameJointFailedAgain) {
          repeats++;
        }
      }
    }
    return new SessionSummary(
      this.attemptList.length,
      flown,
      toFirstSurvival,
      sinceSurvival,
      fixes,
      repeats
    );
  }

  /** Charges the interval since the last boundary to the overlay and the zoom. */
  private chargeDwell(nowMs: number): void {
    const record = this.currentAttempt;
    if (record !== null && this.overlaySinceMs >= 0 && nowMs > this.overlaySinceMs) {
      const seconds = (nowMs - this.overlaySinceMs) / 1000;
      record.overlayDwell.add(this.overlay, seconds, this.running);
      if (this.zoomRung === 0) {
        record.secondsAtFloorRung += seconds;
      }
    }
    this.overlaySinceMs = nowMs;
  }
}
