import { Dials } from "../config/Dials";
import { GridBounds } from "../core/GridBounds";
import { IVec3 } from "../core/IVec3";
import { AmmoTable } from "../materials/AmmoTable";
import { MaterialTable } from "../materials/MaterialTable";
import { WeaponClass, WeaponClassId, WeaponTable } from "../materials/WeaponTable";
import { Blueprint } from "../blueprint/Blueprint";
import { Arena } from "../sim/Arena";
import { PadSurface } from "../structure/SupportSurface";
import { ViewYaw } from "./ViewYaw";

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

  /**
   * Cross-sections worth drawing: the design's own width, widened to the pad so a tester
   * can lay a new wall outside what they have already built.
   */
  public get sliceMin(): number {
    const design = this.blueprint.bounds.min.x;
    return design < this.pad.minX ? design : this.pad.minX;
  }

  public get sliceMax(): number {
    const design = this.blueprint.bounds.min.x + this.blueprint.bounds.size.x - 1;
    return design > this.pad.maxX ? design : this.pad.maxX;
  }

  /**
   * The section nearest the camera, and therefore where the reach plane rests when nothing
   * is peeled (face-placement spec 3.3).
   *
   * A fact about the yaw and not about the design: `nearerSide` is the sign the section index
   * moves in one step toward the camera (isometric renderer spec 2.2), so a quarter turn puts
   * this at the other end of the turret -- which is why a quarter turn resets the plane.
   */
  public frontSlice(yaw: ViewYaw): number {
    return yaw.nearerSide < 0 ? this.sliceMin : this.sliceMax;
  }

  public clampSlice(x: number): number {
    if (x < this.sliceMin) {
      return this.sliceMin;
    }
    if (x > this.sliceMax) {
      return this.sliceMax;
    }
    return x;
  }

  /** Blocks in one cross-section, in canonical order. Used by the slice strip readout. */
  public blocksInSlice(x: number): number[] {
    const found: number[] = [];
    for (let i = 0; i < this.blueprint.blockCount; i++) {
      if (this.blueprint.blockAt(i).position.x === x) {
        found.push(i);
      }
    }
    return found;
  }

  /**
   * The visible world box.
   *
   * Wide enough on the -z side to hold an attacker at the edge of gun range, because "my
   * gun is silent" and "nothing is in range yet" have to be distinguishable at a glance --
   * but no wider. The lane is forty voxels long and showing all of it would shrink the
   * turret to nothing for the sake of a walking dot; attackers still outside the frame get
   * an edge marker instead (`ActorLayer`).
   *
   * Vertically it is the design plus two voxels of headroom. The camera has nothing to
   * teach, so it should not ask a tester to pan to find their own roof.
   */
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
