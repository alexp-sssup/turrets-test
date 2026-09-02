import { Vec3 } from "../core/Vec3";
import { Directions } from "../core/Direction";
import { Dials } from "../config/Dials";
import { MaterialTable } from "../materials/MaterialTable";
import { WeaponClass } from "../materials/WeaponTable";
import { BlockStructure } from "../structure/BlockStructure";
import { LoadCase } from "../structure/LoadCase";
import { LoadSet } from "../structure/LoadSet";

/**
 * Self weight plus the recoil of whichever stations are firing (spec 7).
 *
 * Recoil "ships as a per-shot impulse at the station block, scaled by weapon class... it is
 * the only thing coupling weapons to structure", and this class is that coupling: it is a
 * `LoadCase` like any other, so the solver sees a loading case and never learns that
 * weapons exist. The station's facing gives the direction; the impulse pushes the frame the
 * other way.
 */
export class CombatLoadCase implements LoadCase {
  private readonly materials: MaterialTable;
  private readonly dials: Dials;
  private readonly weapon: WeaponClass;
  /** Station blocks whose recoil is currently loading the frame. */
  private readonly firing: number[];

  public constructor(materials: MaterialTable, dials: Dials, weapon: WeaponClass) {
    this.materials = materials;
    this.dials = dials;
    this.weapon = weapon;
    this.firing = [];
  }

  public setFiring(stations: readonly number[]): void {
    this.firing.length = 0;
    for (let i = 0; i < stations.length; i++) {
      this.firing.push(stations[i]);
    }
    this.firing.sort((a: number, b: number): number => a - b);
  }

  public clearFiring(): void {
    this.firing.length = 0;
  }

  public get firingCount(): number {
    return this.firing.length;
  }

  public build(structure: BlockStructure): LoadSet {
    const loads = LoadSet.gravity(structure, this.materials, this.dials.gravity, this.dials.voxelSize);
    for (let i = 0; i < this.firing.length; i++) {
      const station = this.firing[i];
      if (!structure.isAlive(station)) {
        continue;
      }
      const facing = structure.blueprint.blockAt(station).facing;
      const forward = Directions.offset(facing);
      // The gun pushes back along its own barrel.
      loads.addForce(
        station,
        new Vec3(-forward.x, -forward.y, -forward.z).scale(this.weapon.recoilImpulse)
      );
    }
    return loads;
  }

  /**
   * Cache key for the loading case. Distinct for each set of firing stations, so the
   * structural analysis cache does not serve a no-recoil answer to a firing turret.
   */
  public stamp(): number {
    let stamp = 1;
    for (let i = 0; i < this.firing.length; i++) {
      stamp = (stamp * 31 + this.firing[i] + 1) | 0;
    }
    return stamp;
  }
}
