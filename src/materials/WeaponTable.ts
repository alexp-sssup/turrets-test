import { AmmoLoadId } from "./AmmoTable";
import { MaterialId } from "./MaterialId";

/**
 * Spec 6: "weapon classes are station data". P0 ships one row; crossbow, musket, heavy gun,
 * mortar and pitch sprayer are five more rows against the same station block.
 */
export enum WeaponClassId {
  Gun = 0,
}

export const WEAPON_CLASS_COUNT: number = 1;

export class WeaponClass {
  public readonly id: WeaponClassId;
  public readonly name: string;
  /** The material that has to be unlocked to build it. Constant in P0. */
  public readonly gatingMaterial: MaterialId;
  /** Spec 7: per-shot impulse applied at the station block, scaled by class. */
  public readonly recoilImpulse: number;
  /** Half-angle of the firing arc, in radians. */
  public readonly arcHalfAngle: number;
  /** Maximum engagement range, in voxels. */
  public readonly range: number;
  /** Spec 5: station ready rack, in weight units. */
  public readonly rackCapacity: number;
  /** Seconds between shots when the rack has stock and the station is manned. */
  public readonly reloadSeconds: number;
  private readonly acceptedLoads: readonly AmmoLoadId[];

  public constructor(
    id: WeaponClassId,
    name: string,
    gatingMaterial: MaterialId,
    recoilImpulse: number,
    arcHalfAngle: number,
    range: number,
    rackCapacity: number,
    reloadSeconds: number,
    acceptedLoads: readonly AmmoLoadId[]
  ) {
    this.id = id;
    this.name = name;
    this.gatingMaterial = gatingMaterial;
    this.recoilImpulse = recoilImpulse;
    this.arcHalfAngle = arcHalfAngle;
    this.range = range;
    this.rackCapacity = rackCapacity;
    this.reloadSeconds = reloadSeconds;
    this.acceptedLoads = acceptedLoads;
  }

  public accepts(load: AmmoLoadId): boolean {
    for (let i = 0; i < this.acceptedLoads.length; i++) {
      if (this.acceptedLoads[i] === load) {
        return true;
      }
    }
    return false;
  }

  public get loadCount(): number {
    return this.acceptedLoads.length;
  }

  public loadAt(index: number): AmmoLoadId {
    return this.acceptedLoads[index];
  }
}

export class WeaponTable {
  private readonly rows: readonly WeaponClass[];

  public constructor(rows: readonly WeaponClass[]) {
    if (rows.length !== WEAPON_CLASS_COUNT) {
      throw new Error("WeaponTable needs one row per WeaponClassId");
    }
    this.rows = rows;
  }

  public static defaults(rackCapacity: number): WeaponTable {
    return new WeaponTable([
      new WeaponClass(
        WeaponClassId.Gun,
        "gun",
        MaterialId.Wood,
        40, // recoil impulse: eight wood voxels' worth of weight, so it bites
        Math.PI / 3, // 60 degree half-angle arc
        40, // range, voxels
        rackCapacity,
        2.5, // reload seconds
        [AmmoLoadId.SolidShot, AmmoLoadId.Firepot]
      ),
    ]);
  }

  public get(weaponClass: WeaponClassId): WeaponClass {
    return this.rows[weaponClass as number];
  }
}
