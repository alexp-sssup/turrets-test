import { DamageVerbId } from "./DamageVerbId";
import { MaterialId } from "./MaterialId";
import { MaterialTable } from "./MaterialTable";

/** Spec 4.3: two loads, differentiated by verb, not power. */
export enum AmmoLoadId {
  SolidShot = 0,
  Firepot = 1,
}

export const AMMO_LOAD_COUNT: number = 2;

/**
 * Volume of a projectile body, in voxel-volume units. Weight is `density * volume`, so a
 * heavier body material means a heavier shot and fewer rounds per trip with no per-ammo
 * tuning -- which is the property spec 6 relies on when steel shot arrives in P3.
 */
export const AMMO_BODY_VOLUME: number = 2;

export class AmmoLoad {
  public readonly id: AmmoLoadId;
  public readonly name: string;
  public readonly bodyMaterial: MaterialId;
  public readonly verb: DamageVerbId;
  /** Damage delivered to the first block the shot bites into. */
  public readonly impactDamage: number;
  /** How far a kinetic shot keeps eating into the structure. */
  public readonly penetrationDepth: number;
  /** Voxels per second, used for time-of-flight in the replay log. */
  public readonly speed: number;

  public constructor(
    id: AmmoLoadId,
    name: string,
    bodyMaterial: MaterialId,
    verb: DamageVerbId,
    impactDamage: number,
    penetrationDepth: number,
    speed: number
  ) {
    this.id = id;
    this.name = name;
    this.bodyMaterial = bodyMaterial;
    this.verb = verb;
    this.impactDamage = impactDamage;
    this.penetrationDepth = penetrationDepth;
    this.speed = speed;
  }
}

export class AmmoTable {
  private readonly rows: readonly AmmoLoad[];
  private readonly materials: MaterialTable;

  public constructor(rows: readonly AmmoLoad[], materials: MaterialTable) {
    if (rows.length !== AMMO_LOAD_COUNT) {
      throw new Error("AmmoTable needs one row per AmmoLoadId");
    }
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i].id as number) !== i) {
        throw new Error("AmmoTable rows must be ordered by AmmoLoadId");
      }
    }
    this.rows = rows;
    this.materials = materials;
  }

  public static defaults(materials: MaterialTable): AmmoTable {
    return new AmmoTable(
      [
        new AmmoLoad(AmmoLoadId.SolidShot, "solid shot", MaterialId.Stone, DamageVerbId.Kinetic, 24, 3, 60),
        new AmmoLoad(AmmoLoadId.Firepot, "firepot", MaterialId.Wood, DamageVerbId.Incendiary, 6, 1, 30),
      ],
      materials
    );
  }

  public get(load: AmmoLoadId): AmmoLoad {
    return this.rows[load as number];
  }

  public get count(): number {
    return this.rows.length;
  }

  /**
   * Spec 4.3: shot weight falls out of the material table. With the P0 densities this is
   * 3 for solid shot and 1 for a firepot.
   */
  public shotWeight(load: AmmoLoadId): number {
    const row = this.get(load);
    return this.materials.get(row.bodyMaterial).density * AMMO_BODY_VOLUME;
  }

  /**
   * Spec 4.3: "rounds per trip is derived: floor(carry capacity / shot weight)". At the
   * P0 dials that is 4 solid shot or 12 firepots.
   */
  public roundsPerTrip(load: AmmoLoadId, carryCapacity: number): number {
    const weight = this.shotWeight(load);
    if (weight <= 0) {
      return 0;
    }
    return Math.floor(carryCapacity / weight);
  }
}
