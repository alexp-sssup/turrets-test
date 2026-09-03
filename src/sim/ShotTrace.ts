/**
 * One round in flight on the tick it was fired.
 *
 * P0 resolves a shot in the tick it is fired -- there is no projectile to step -- so the
 * renderer needs the sim to say where a round went rather than guessing from a muzzle
 * flash. The isometric renderer spec 7.5 wants shots drawn along their actual path, with a
 * shadow tracking the ground beneath them, and "actual" has to mean the path the damage
 * followed or the picture is decoration.
 *
 * Reporting only: nothing here feeds a tick, and a run replays identically whether anyone
 * reads it.
 */
export class ShotTrace {
  /** Where the round came from, in world coordinates. May be fractional: units walk. */
  public readonly fromX: number;
  public readonly fromY: number;
  public readonly fromZ: number;
  public readonly toX: number;
  public readonly toY: number;
  public readonly toZ: number;
  /** Lobbed over the parapet rather than sent in a straight line (prototype spec 4.5). */
  public readonly lobbed: boolean;
  /** True for a round the turret fired, false for one it took. */
  public readonly outgoing: boolean;

  public constructor(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    lobbed: boolean,
    outgoing: boolean
  ) {
    this.fromX = fromX;
    this.fromY = fromY;
    this.fromZ = fromZ;
    this.toX = toX;
    this.toY = toY;
    this.toZ = toZ;
    this.lobbed = lobbed;
    this.outgoing = outgoing;
  }
}
