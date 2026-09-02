import { AttackerKindId } from "./AttackerKind";

/** A request from a controller to put a unit on the lane. */
export class SpawnRequest {
  public readonly kind: AttackerKindId;
  public readonly laneX: number;

  public constructor(kind: AttackerKindId, laneX: number) {
    this.kind = kind;
    this.laneX = laneX;
  }
}

/**
 * Spec 6: "the attacker is a controller behind an interface. P0 hands it a script. A second
 * player, or an AI fielding mobile turrets, implements the same interface."
 *
 * Deliberately narrow: a controller decides *what enters the lane and when*, and nothing
 * else. Movement and shooting belong to the simulation, so a second player cannot end up
 * with different physics from the script.
 */
export interface AttackerController {
  /** Called once at the start of each wave. */
  beginWave(waveIndex: number): void;
  /** Units to put on the lane this tick. `waveTime` is seconds since the wave began. */
  update(waveTime: number, seconds: number): readonly SpawnRequest[];
  /** True when the controller has nothing left to send this wave. */
  isWaveExhausted(waveTime: number): boolean;
}
