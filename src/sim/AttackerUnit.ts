import { AttackerKindId } from "./AttackerKind";

/** One attacker on the lane. Mutable state; the table holds the constants. */
export class AttackerUnit {
  public readonly id: number;
  public readonly kind: AttackerKindId;
  /** Which line of the approach it walks. */
  public readonly laneX: number;
  /** Position along the lane. Increases as it closes on the turret. */
  public laneZ: number;
  public hitPoints: number;
  public reloadTimer: number;
  public alive: boolean;
  /** Set once it is close enough to shoot. */
  public engaged: boolean;

  public constructor(
    id: number,
    kind: AttackerKindId,
    laneX: number,
    laneZ: number,
    hitPoints: number,
    reloadSeconds: number
  ) {
    this.id = id;
    this.kind = kind;
    this.laneX = laneX;
    this.laneZ = laneZ;
    this.hitPoints = hitPoints;
    this.reloadTimer = reloadSeconds;
    this.alive = true;
    this.engaged = false;
  }
}
