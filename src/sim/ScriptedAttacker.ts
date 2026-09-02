import { AttackerController, SpawnRequest } from "./AttackerController";
import { Wave, WaveScript } from "./WaveScript";

/**
 * The P0 controller: reads a fixed script.
 *
 * Spec 4.5 makes determinism a requirement, so there is no randomness here at all -- the
 * same script produces the same spawns at the same times on every run, which is what lets
 * the replay be an input log rather than a state capture.
 */
export class ScriptedAttacker implements AttackerController {
  private readonly script: WaveScript;
  private wave: Wave | null;
  private cursor: number;
  private elapsed: number;

  public constructor(script: WaveScript) {
    this.script = script;
    this.wave = null;
    this.cursor = 0;
    this.elapsed = 0;
  }

  public beginWave(waveIndex: number): void {
    this.wave = this.script.waveAt(waveIndex);
    this.cursor = 0;
    this.elapsed = 0;
  }

  public update(waveTime: number, seconds: number): readonly SpawnRequest[] {
    this.elapsed = waveTime + seconds;
    const requests: SpawnRequest[] = [];
    if (this.wave === null) {
      return requests;
    }
    while (this.cursor < this.wave.spawnCount) {
      const order = this.wave.spawnAt(this.cursor);
      if (order.timeSeconds > this.elapsed) {
        break;
      }
      requests.push(new SpawnRequest(order.kind, order.laneX));
      this.cursor++;
    }
    return requests;
  }

  public isWaveExhausted(waveTime: number): boolean {
    if (this.wave === null) {
      return true;
    }
    return this.cursor >= this.wave.spawnCount;
  }

  public get currentWave(): Wave | null {
    return this.wave;
  }
}
