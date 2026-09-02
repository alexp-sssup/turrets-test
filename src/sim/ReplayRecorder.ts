import { JointRef } from "../structure/CollapseResolver";
import { RunEvent, RunEventKind } from "./RunEvent";

/** A player decision, recorded so the run can be re-driven from it. */
export enum InputKind {
  /** Spec 4.6: "the player may click a target to focus fire." */
  FocusTarget = 0,
  /** Clearing the focus, back to auto-fire. */
  ClearFocus = 1,
  /** Switching a station's load between waves. */
  SelectLoad = 2,
}

export class ReplayInput {
  public readonly timeSeconds: number;
  public readonly kind: InputKind;
  /** Unit id, station block, or load id, depending on the kind. */
  public readonly value: number;
  public readonly secondary: number;

  public constructor(timeSeconds: number, kind: InputKind, value: number, secondary: number) {
    this.timeSeconds = timeSeconds;
    this.kind = kind;
    this.value = value;
    this.secondary = secondary;
  }
}

/**
 * The replay.
 *
 * Spec 4.5: determinism "lets the replay be an input log rather than a state capture, which
 * is much cheaper". So this holds the *inputs* (seed, blueprint, assignment, the player's
 * clicks) plus an event log for narration. Re-running the simulation with the same inputs
 * reproduces the events exactly, which is what makes the second half of the core loop --
 * watch the replay, see the joint that sheared -- possible at all.
 */
export class Replay {
  public readonly seed: number;
  public readonly blueprintName: string;
  private readonly inputList: readonly ReplayInput[];
  private readonly eventList: readonly RunEvent[];
  public readonly firstFailedJoint: JointRef | null;

  public constructor(
    seed: number,
    blueprintName: string,
    inputs: readonly ReplayInput[],
    events: readonly RunEvent[],
    firstFailedJoint: JointRef | null
  ) {
    this.seed = seed;
    this.blueprintName = blueprintName;
    this.inputList = inputs;
    this.eventList = events;
    this.firstFailedJoint = firstFailedJoint;
  }

  public get inputs(): readonly ReplayInput[] {
    return this.inputList;
  }

  public get events(): readonly RunEvent[] {
    return this.eventList;
  }

  public eventsOfKind(kind: RunEventKind): RunEvent[] {
    const found: RunEvent[] = [];
    for (let i = 0; i < this.eventList.length; i++) {
      if (this.eventList[i].kind === kind) {
        found.push(this.eventList[i]);
      }
    }
    return found;
  }

  public countOf(kind: RunEventKind): number {
    let count = 0;
    for (let i = 0; i < this.eventList.length; i++) {
      if (this.eventList[i].kind === kind) {
        count++;
      }
    }
    return count;
  }

  /** Every line, in order. What the replay view reads out. */
  public transcript(): string[] {
    const lines: string[] = [];
    for (let i = 0; i < this.eventList.length; i++) {
      lines.push(this.eventList[i].describe());
    }
    return lines;
  }
}

/** Accumulates the log during a run. */
export class ReplayRecorder {
  private readonly events: RunEvent[];
  private readonly inputs: ReplayInput[];
  private firstFailed: JointRef | null;

  public constructor() {
    this.events = [];
    this.inputs = [];
    this.firstFailed = null;
  }

  public record(
    timeSeconds: number,
    wave: number,
    kind: RunEventKind,
    subject: number,
    object: number,
    value: number,
    detail: string
  ): void {
    this.events.push(new RunEvent(timeSeconds, wave, kind, subject, object, value, detail));
  }

  public recordInput(input: ReplayInput): void {
    this.inputs.push(input);
  }

  /** The first joint to shear in the whole run. Recorded once and never overwritten. */
  public noteFirstFailedJoint(joint: JointRef): void {
    if (this.firstFailed === null) {
      this.firstFailed = joint;
    }
  }

  public get eventCount(): number {
    return this.events.length;
  }

  public build(seed: number, blueprintName: string): Replay {
    return new Replay(seed, blueprintName, this.inputs, this.events, this.firstFailed);
  }
}
