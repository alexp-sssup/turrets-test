import { AmmoLoadId } from "../materials/AmmoTable";

/**
 * The units the script can field. A row, not a class hierarchy: spec 6 replaces the
 * scripted attacker with a second player or an AI behind the same interface, and neither
 * needs new unit code.
 */
export enum AttackerKindId {
  /** Wave 1 and 2: teaches arcs, then coverage. */
  LightKinetic = 0,
  /** Wave 3: punishes contiguous wood. */
  Incendiary = 1,
  /** Wave 4: heavy, concentrated, punishes brittle stone and unbraced frames. */
  HeavyKinetic = 2,
}

export const ATTACKER_KIND_COUNT: number = 3;

export class AttackerKind {
  public readonly id: AttackerKindId;
  public readonly name: string;
  public readonly hitPoints: number;
  /** Voxels per second. */
  public readonly speed: number;
  /** Distance from the turret face at which it stops and starts shooting. */
  public readonly standoff: number;
  public readonly reloadSeconds: number;
  /** Which load it throws -- and therefore which damage verb. */
  public readonly load: AmmoLoadId;
  public readonly damage: number;
  public readonly penetrationDepth: number;

  public constructor(
    id: AttackerKindId,
    name: string,
    hitPoints: number,
    speed: number,
    standoff: number,
    reloadSeconds: number,
    load: AmmoLoadId,
    damage: number,
    penetrationDepth: number
  ) {
    this.id = id;
    this.name = name;
    this.hitPoints = hitPoints;
    this.speed = speed;
    this.standoff = standoff;
    this.reloadSeconds = reloadSeconds;
    this.load = load;
    this.damage = damage;
    this.penetrationDepth = penetrationDepth;
  }
}

export class AttackerTable {
  private readonly rows: readonly AttackerKind[];

  public constructor(rows: readonly AttackerKind[]) {
    if (rows.length !== ATTACKER_KIND_COUNT) {
      throw new Error("AttackerTable needs one row per AttackerKindId");
    }
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i].id as number) !== i) {
        throw new Error("AttackerTable rows must be ordered by AttackerKindId");
      }
    }
    this.rows = rows;
  }

  public static defaults(): AttackerTable {
    return new AttackerTable([
      new AttackerKind(
        AttackerKindId.LightKinetic,
        "light kinetic",
        45,
        2,
        14,
        2.5,
        AmmoLoadId.SolidShot,
        8,
        2
      ),
      new AttackerKind(
        AttackerKindId.Incendiary,
        "incendiary",
        40,
        2,
        12,
        3,
        AmmoLoadId.Firepot,
        6,
        1
      ),
      new AttackerKind(
        AttackerKindId.HeavyKinetic,
        "heavy kinetic",
        90,
        1.2,
        16,
        4,
        AmmoLoadId.SolidShot,
        30,
        4
      ),
    ]);
  }

  public get(kind: AttackerKindId): AttackerKind {
    return this.rows[kind as number];
  }
}
