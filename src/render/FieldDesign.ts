import { Dials } from "../config/Dials";
import { GridBounds } from "../core/GridBounds";
import { IVec3 } from "../core/IVec3";
import { AmmoTable } from "../materials/AmmoTable";
import { MaterialTable } from "../materials/MaterialTable";
import { WeaponClass, WeaponClassId, WeaponTable } from "../materials/WeaponTable";
import { Blueprint } from "../blueprint/Blueprint";
import { Arena } from "../sim/Arena";
import { PadSurface } from "../structure/SupportSurface";

/**
 * The part of a scene that does not change tick to tick: the design, the pad, the lane and
 * the tables.
 *
 * Kept separate from the per-tick frame because a run records a frame every tick and the
 * blueprint's geometry is the same in all of them. Sharing it is the difference between a
 * replay costing a few megabytes and costing a hundred.
 */
export class FieldDesign {
  public readonly blueprint: Blueprint;
  public readonly pad: PadSurface;
  public readonly arena: Arena;
  public readonly materials: MaterialTable;
  public readonly ammo: AmmoTable;
  public readonly gun: WeaponClass;
  public readonly dials: Dials;
  /** The world box the camera should be able to see: the turret, the pad and the lane. */
  public readonly viewBounds: GridBounds;

  public constructor(
    blueprint: Blueprint,
    pad: PadSurface,
    arena: Arena,
    materials: MaterialTable,
    ammo: AmmoTable,
    weapons: WeaponTable,
    dials: Dials
  ) {
    this.blueprint = blueprint;
    this.pad = pad;
    this.arena = arena;
    this.materials = materials;
    this.ammo = ammo;
    this.gun = weapons.get(WeaponClassId.Gun);
    this.dials = dials;
    this.viewBounds = FieldDesign.frame(blueprint, pad, this.gun.range);
  }

  public static withDefaults(blueprint: Blueprint, pad: PadSurface, arena: Arena, dials: Dials): FieldDesign {
    const materials = MaterialTable.defaults();
    return new FieldDesign(
      blueprint,
      pad,
      arena,
      materials,
      AmmoTable.defaults(materials),
      WeaponTable.defaults(dials.stationRackCapacity),
      dials
    );
  }

  private static frame(blueprint: Blueprint, pad: PadSurface, gunRange: number): GridBounds {
    const design = blueprint.bounds;
    const minX = design.min.x < pad.minX ? design.min.x : pad.minX;
    const maxX = design.min.x + design.size.x - 1;
    const rightX = maxX > pad.maxX ? maxX : pad.maxX;
    const laneStart = pad.minZ - gunRange - 3;
    const startZ = design.min.z < laneStart ? design.min.z - 1 : laneStart;
    const designMaxZ = design.min.z + design.size.z - 1;
    const endZ = designMaxZ > pad.maxZ ? designMaxZ + 2 : pad.maxZ + 2;
    const minY = pad.level - 1;
    const designMaxY = design.min.y + design.size.y - 1;
    const endY = designMaxY + 2;
    return new GridBounds(
      new IVec3(minX - 1, minY, startZ),
      new IVec3(rightX - minX + 3, endY - minY + 1, endZ - startZ + 1)
    );
  }
}
