import { InputKind, ReplayInput } from "./ReplayRecorder";

/**
 * Where a run's player decisions come from.
 *
 * Spec 4.5 makes a replay an input log rather than a state capture, which only works if
 * *every* route into the simulation is the same list of timestamped decisions. A scripted
 * run (`InputScript`) and a live player (`LiveInputQueue`) are therefore the same thing to
 * the run loop, and the log it records is identical either way.
 */
export interface InputSource {
  /** Decisions whose time has come, in order. Consumed: each is returned once. */
  drain(nowSeconds: number): ReplayInput[];
}

/**
 * A player's clicks, waiting for the next tick.
 *
 * Commands are stamped with the simulation time at which the loop actually consumes them,
 * not with wall-clock time. That is what makes a live attempt reproducible: replaying the
 * recorded log re-applies each decision on the same tick it originally landed on, and no
 * part of the run depends on how fast the browser was running.
 */
export class LiveInputQueue implements InputSource {
  private kinds: InputKind[];
  private values: number[];
  private secondaries: number[];

  public constructor() {
    this.kinds = [];
    this.values = [];
    this.secondaries = [];
  }

  public push(kind: InputKind, value: number, secondary: number): void {
    this.kinds.push(kind);
    this.values.push(value);
    this.secondaries.push(secondary);
  }

  public get pendingCount(): number {
    return this.kinds.length;
  }

  public drain(nowSeconds: number): ReplayInput[] {
    const due: ReplayInput[] = [];
    for (let i = 0; i < this.kinds.length; i++) {
      due.push(new ReplayInput(nowSeconds, this.kinds[i], this.values[i], this.secondaries[i]));
    }
    this.kinds = [];
    this.values = [];
    this.secondaries = [];
    return due;
  }
}
