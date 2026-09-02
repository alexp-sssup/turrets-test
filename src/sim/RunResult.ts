import { Replay } from "./ReplayRecorder";

/** How a run ended. */
export enum RunOutcome {
  /** Spec 5: "core block intact after wave 5". */
  Won = 0,
  /** The core went. */
  CoreLost = 1,
  /** Nothing left standing at all. */
  Wrecked = 2,
}

export function runOutcomeName(outcome: RunOutcome): string {
  if (outcome === RunOutcome.Won) {
    return "won";
  }
  if (outcome === RunOutcome.CoreLost) {
    return "core lost";
  }
  return "wrecked";
}

/**
 * The result of one attempt.
 *
 * Spec 1.2 makes six attempts the bar the core loop has to clear, so what a run returns is
 * shaped for comparison between attempts: the same blueprint plus the same script should
 * produce the same numbers, and a *changed* blueprint should move them.
 */
export class RunResult {
  public readonly outcome: RunOutcome;
  /** Waves fully survived. Five means the run was won. */
  public readonly wavesSurvived: number;
  public readonly replay: Replay;
  public readonly crewLost: number;
  public readonly crewRemaining: number;
  public readonly blocksLost: number;
  public readonly blocksRemaining: number;
  public readonly attackersDestroyed: number;
  public readonly shotsFired: number;
  /** Seconds stations spent unable to fire. The cost of bad depot placement. */
  public readonly stationDrySeconds: number;
  public readonly finalLoadFactor: number;
  public readonly structuralSolves: number;
  public readonly elapsedSeconds: number;

  public constructor(
    outcome: RunOutcome,
    wavesSurvived: number,
    replay: Replay,
    crewLost: number,
    crewRemaining: number,
    blocksLost: number,
    blocksRemaining: number,
    attackersDestroyed: number,
    shotsFired: number,
    stationDrySeconds: number,
    finalLoadFactor: number,
    structuralSolves: number,
    elapsedSeconds: number
  ) {
    this.outcome = outcome;
    this.wavesSurvived = wavesSurvived;
    this.replay = replay;
    this.crewLost = crewLost;
    this.crewRemaining = crewRemaining;
    this.blocksLost = blocksLost;
    this.blocksRemaining = blocksRemaining;
    this.attackersDestroyed = attackersDestroyed;
    this.shotsFired = shotsFired;
    this.stationDrySeconds = stationDrySeconds;
    this.finalLoadFactor = finalLoadFactor;
    this.structuralSolves = structuralSolves;
    this.elapsedSeconds = elapsedSeconds;
  }

  public get won(): boolean {
    return this.outcome === RunOutcome.Won;
  }
}
