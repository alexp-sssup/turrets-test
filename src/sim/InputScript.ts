import { InputSource } from "./InputSource";
import { InputKind, ReplayInput } from "./ReplayRecorder";

/**
 * The player's side of a run, as a list of timestamped decisions.
 *
 * P0 has no live player, so a run is driven from one of these -- which is also exactly what
 * a replay stores (spec 4.5). Feeding a replay's inputs back in re-drives the run, and that
 * is the only mechanism needed for "watch the replay".
 */
export class InputScript implements InputSource {
  private readonly inputs: readonly ReplayInput[];
  private cursor: number;

  public constructor(inputs: readonly ReplayInput[]) {
    const sorted: ReplayInput[] = [];
    for (let i = 0; i < inputs.length; i++) {
      sorted.push(inputs[i]);
    }
    sorted.sort((a: ReplayInput, b: ReplayInput): number => {
      if (a.timeSeconds !== b.timeSeconds) {
        return a.timeSeconds < b.timeSeconds ? -1 : 1;
      }
      if (a.kind !== b.kind) {
        return (a.kind as number) - (b.kind as number);
      }
      return a.value - b.value;
    });
    this.inputs = sorted;
    this.cursor = 0;
  }

  public static empty(): InputScript {
    return new InputScript([]);
  }

  public static focusAt(timeSeconds: number, unitId: number): InputScript {
    return new InputScript([new ReplayInput(timeSeconds, InputKind.FocusTarget, unitId, -1)]);
  }

  public reset(): void {
    this.cursor = 0;
  }

  /** Inputs whose time has come, in order. */
  public drain(nowSeconds: number): ReplayInput[] {
    const due: ReplayInput[] = [];
    while (this.cursor < this.inputs.length && this.inputs[this.cursor].timeSeconds <= nowSeconds) {
      due.push(this.inputs[this.cursor]);
      this.cursor++;
    }
    return due;
  }

  public get count(): number {
    return this.inputs.length;
  }
}
