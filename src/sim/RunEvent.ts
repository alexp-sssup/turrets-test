/** Everything the replay can narrate. */
export enum RunEventKind {
  WaveBegan = 0,
  WaveEnded = 1,
  AttackerSpawned = 2,
  AttackerDestroyed = 3,
  /** A station fired: the burst-and-lull rhythm shows up as the gaps between these. */
  StationFired = 4,
  /** A station could not fire because its rack was empty. */
  StationDry = 5,
  /** A station lost its route to a depot. */
  StationStarved = 6,
  TurretHit = 7,
  BlockDestroyed = 8,
  DepotDetonated = 9,
  BlockIgnited = 10,
  BlockConsumedByFire = 11,
  /** A joint sheared. The one the replay is for. */
  JointSheared = 12,
  StructureCollapsed = 13,
  CrewKilled = 14,
  RepairCompleted = 15,
  /** The load factor crossed below 1, or back above it. */
  MarginChanged = 16,
  /** Loss-conditions spec 4: the last manned station went quiet. Not a loss on its own. */
  TurretSilenced = 17,
  /** Loss-conditions spec 4: a station is manned again, so the silence had an end. */
  TurretRemanned = 18,
  RunWon = 19,
  RunLost = 20,
}

export function runEventKindName(kind: RunEventKind): string {
  const names: readonly string[] = [
    "wave began",
    "wave ended",
    "attacker spawned",
    "attacker destroyed",
    "station fired",
    "station dry",
    "station starved",
    "turret hit",
    "block destroyed",
    "depot detonated",
    "block ignited",
    "block consumed by fire",
    "joint sheared",
    "structure collapsed",
    "crew killed",
    "repair completed",
    "margin changed",
    "turret silenced",
    "turret remanned",
    "run won",
    "run lost",
  ];
  return names[kind as number];
}

/**
 * One timestamped line of the run's story.
 *
 * Spec 3 wants "collapse replay with timestamps + first-failed-joint" as a first-class
 * feature, and spec 1.2 makes the loop -- lose a turret, watch the replay, see the joint
 * that sheared -- the progression system. So events carry the numbers a player would need
 * to act on, not just a message.
 */
export class RunEvent {
  public readonly timeSeconds: number;
  public readonly wave: number;
  public readonly kind: RunEventKind;
  /** Block, unit or crew id, depending on the kind. -1 when not applicable. */
  public readonly subject: number;
  /** Secondary id: the other side of a joint, or the block a unit hit. -1 when unused. */
  public readonly object: number;
  /** A number worth reading: a load factor, a damage total, a count. */
  public readonly value: number;
  public readonly detail: string;

  public constructor(
    timeSeconds: number,
    wave: number,
    kind: RunEventKind,
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

  public describe(): string {
    const stamp = "[" + this.timeSeconds.toFixed(2) + "s w" + (this.wave + 1).toString() + "] ";
    let line = stamp + runEventKindName(this.kind);
    if (this.subject >= 0) {
      line += " #" + this.subject.toString();
    }
    if (this.object >= 0) {
      line += "/" + this.object.toString();
    }
    if (this.detail.length > 0) {
      line += " " + this.detail;
    }
    return line;
  }
}
