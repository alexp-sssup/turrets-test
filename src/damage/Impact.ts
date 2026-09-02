import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { AmmoLoadId } from "../materials/AmmoTable";

/**
 * One round arriving. Everything a damage verb needs and nothing about who fired it, so a
 * new verb (spec 6: shrapnel, explosive, corrosive) needs no new plumbing.
 */
export class Impact {
  /** The cell the round arrives at. May be empty: the verb decides what that means. */
  public readonly cell: IVec3;
  /** Travel direction, which is the axis a kinetic round penetrates along. */
  public readonly heading: Direction;
  public readonly load: AmmoLoadId;
  public readonly damage: number;
  public readonly penetrationDepth: number;

  public constructor(
    cell: IVec3,
    heading: Direction,
    load: AmmoLoadId,
    damage: number,
    penetrationDepth: number
  ) {
    this.cell = cell;
    this.heading = heading;
    this.load = load;
    this.damage = damage;
    this.penetrationDepth = penetrationDepth;
  }
}
