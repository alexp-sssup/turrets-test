import { JointRef } from "../structure/CollapseResolver";
import { OverlayMode } from "../render/ViewState";
import { DesignMetrics } from "./DesignMetrics";
import { DeviceProfile } from "./DeviceProfile";

/** Seconds spent with each overlay open, split by whether a wave was on the lane. */
export class OverlayDwell {
  public readonly beforeRun: Float64Array;
  public readonly duringRun: Float64Array;
  /** True when the overlay was opened at least once before the wave started. */
  public readonly openedBeforeRun: Uint8Array;

  public constructor() {
    this.beforeRun = new Float64Array(6);
    this.duringRun = new Float64Array(6);
    this.openedBeforeRun = new Uint8Array(6);
  }

  public add(overlay: OverlayMode, seconds: number, running: boolean): void {
    const index = overlay as number;
    if (running) {
      this.duringRun[index] += seconds;
      return;
    }
    this.beforeRun[index] += seconds;
    this.openedBeforeRun[index] = 1;
  }

  /**
   * The §1.1 readability signal: did the tester consult the two overlays that explain the
   * structure *before* flying the attempt, rather than only afterwards.
   */
  public get consultedSolverBeforeRun(): boolean {
    return (
      this.openedBeforeRun[OverlayMode.Stress as number] === 1 ||
      this.openedBeforeRun[OverlayMode.Predict as number] === 1
    );
  }

  public get solverDwellBeforeRun(): number {
    return (
      this.beforeRun[OverlayMode.Stress as number] + this.beforeRun[OverlayMode.Predict as number]
    );
  }
}

/** How an attempt ended, in the terms the metrics table is written in. */
export enum AttemptOutcome {
  /** Designed but never flown. Still recorded: abandonment is a number too. */
  NotFlown = 0,
  Survived = 1,
  Lost = 2,
}

/**
 * Everything one attempt produced, and the whole of the export format (UI spec 7.5).
 *
 * The fields are chosen from the metrics table in §7.3 rather than from what happened to be
 * easy to collect, because the point of the tester build is that testers cannot tell you
 * *why* the heatmap failed them -- they can only tell you it was confusing. So the record
 * has to answer the three hypotheses on its own.
 *
 * One artifact, three uses: it is the export a tester pastes into feedback, it is the
 * replay format, and it is the input to a headless batch re-run.
 */
export class AttemptRecord {
  public readonly sessionId: string;
  public readonly attemptIndex: number;
  public readonly blueprintName: string;
  public readonly blueprintHash: string;
  /** The design itself, in the persistence codec's format. */
  public readonly blueprintText: string;
  public readonly seed: number;
  /** The ordered command log. Replay is seed + blueprint + this. Filled when the run ends. */
  public commandLog: readonly AttemptCommand[];
  public events: readonly AttemptEvent[];
  public readonly design: DesignMetrics;

  public outcome: AttemptOutcome;
  public wavesSurvived: number;
  public runSeconds: number;
  /** Seconds a station spent unable to fire, summed over stations. */
  public dryStationSeconds: number;
  /** Seconds a station spent with no route to a depot, summed over stations. */
  public noPathSeconds: number;
  public firstFailedJoint: JointRef | null;
  /** The first failed joint of the *previous* attempt on this design lineage. */
  public previousFirstFailedJoint: JointRef | null;
  public editedAfterReplay: boolean;
  public replayOpened: boolean;
  /** Fraction of the replay's length the tester actually watched or scrubbed over. */
  public replayWatchFraction: number;
  public replayScrubCount: number;
  public readonly overlayDwell: OverlayDwell;
  /**
   * What the tester did with the camera and the cutaway (isometric renderer spec 11).
   *
   * There is one projection now, so "did they use the 2.5D mode" is not a question any more.
   * These are the questions that replace it, and each is here because a tester cannot be
   * asked it directly:
   *
   * * **Yaw changes**, and whether any happened before the first run: is the fourth wall
   *   being looked behind, or is the default view all anyone ever sees? If nobody turns the
   *   camera, the four yaws were scope that should have gone elsewhere.
   * * **Peel moves**, counted separately in Design and in Run: is the cutaway a build tool,
   *   a diagnosis tool, or both?
   * * **Run seconds with a peel engaged**: if this is high, testers are choosing the diagram
   *   over the game, and spec 1's whole argument is wrong.
   * * **Zoom rungs used and seconds at the floor rung**: is a phone tester reading the
   *   turret at a size where spec 3.2 has already dropped the detail?
   */
  public yawChanges: number;
  public yawChangedBeforeRun: boolean;
  public peelMovesInDesign: number;
  public peelMovesInRun: number;
  public runSecondsWithPeel: number;
  public zoomRungsUsed: number;
  public secondsAtFloorRung: number;
  /** Render p95 per yaw, because fill cost differs by silhouette (spec 11). */
  public readonly renderMsP95ByYaw: number[];
  public solverMsP95: number;
  public solverMsMax: number;
  public renderMsP95: number;
  public solveCount: number;
  public cellCount: number;
  public predictOpenedDuringRun: boolean;
  /**
   * What it was flown on (mobile UI spec 9.1). Segmenting by it is 9.2's rule, and reading
   * the compact segment as a question about the layout rather than about the solver is the
   * only thing that makes §10's risk visible.
   */
  public readonly device: DeviceProfile;

  public constructor(
    sessionId: string,
    attemptIndex: number,
    blueprintName: string,
    blueprintHash: string,
    blueprintText: string,
    seed: number,
    commandLog: readonly AttemptCommand[],
    events: readonly AttemptEvent[],
    design: DesignMetrics
  ) {
    this.sessionId = sessionId;
    this.attemptIndex = attemptIndex;
    this.blueprintName = blueprintName;
    this.blueprintHash = blueprintHash;
    this.blueprintText = blueprintText;
    this.seed = seed;
    this.commandLog = commandLog;
    this.events = events;
    this.design = design;

    this.outcome = AttemptOutcome.NotFlown;
    this.wavesSurvived = 0;
    this.runSeconds = 0;
    this.dryStationSeconds = 0;
    this.noPathSeconds = 0;
    this.firstFailedJoint = null;
    this.previousFirstFailedJoint = null;
    this.editedAfterReplay = false;
    this.replayOpened = false;
    this.replayWatchFraction = 0;
    this.replayScrubCount = 0;
    this.overlayDwell = new OverlayDwell();
    this.yawChanges = 0;
    this.yawChangedBeforeRun = false;
    this.peelMovesInDesign = 0;
    this.peelMovesInRun = 0;
    this.runSecondsWithPeel = 0;
    this.zoomRungsUsed = 0;
    this.secondsAtFloorRung = 0;
    this.renderMsP95ByYaw = [0, 0, 0, 0];
    this.solverMsP95 = 0;
    this.solverMsMax = 0;
    this.renderMsP95 = 0;
    this.solveCount = 0;
    this.cellCount = 0;
    this.predictOpenedDuringRun = false;
    this.device = new DeviceProfile();
  }

  /**
   * "Did the replay cause a fix that worked" -- the whole prototype in one field
   * (UI spec 7.3).
   *
   * True when this attempt sheared the *same* joint the previous one did, which is the
   * failure case: the tester watched the replay, changed something, and the design broke in
   * exactly the same place. False with a previous joint present is the success case.
   */
  public get sameJointFailedAgain(): boolean {
    const previous = this.previousFirstFailedJoint;
    const current = this.firstFailedJoint;
    if (previous === null || current === null) {
      return false;
    }
    return previous.equals(current);
  }

  public get survived(): boolean {
    return this.outcome === AttemptOutcome.Survived;
  }
}

/** One logged player decision, flattened for export. */
export class AttemptCommand {
  public readonly timeSeconds: number;
  public readonly kind: string;
  public readonly value: number;
  public readonly secondary: number;

  public constructor(timeSeconds: number, kind: string, value: number, secondary: number) {
    this.timeSeconds = timeSeconds;
    this.kind = kind;
    this.value = value;
    this.secondary = secondary;
  }
}

/** One line of the run's story, flattened for export. */
export class AttemptEvent {
  public readonly timeSeconds: number;
  public readonly wave: number;
  public readonly kind: string;
  public readonly subject: number;
  public readonly object: number;
  public readonly value: number;
  public readonly detail: string;

  public constructor(
    timeSeconds: number,
    wave: number,
    kind: string,
    subject: number,
    object: number,
    value: number,
    detail: string
  ) {
    this.timeSeconds = timeSeconds;
    this.wave = wave;
    this.kind = kind;
    this.subject = subject;
    this.object = object;
    this.value = value;
    this.detail = detail;
  }
}
