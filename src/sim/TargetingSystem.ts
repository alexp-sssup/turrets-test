import { WeaponClass } from "../materials/WeaponTable";
import { BlockStructure } from "../structure/BlockStructure";
import { FiringArc } from "../editor/FiringArc";
import { Arena } from "./Arena";
import { AttackerUnit } from "./AttackerUnit";

/**
 * Spec 4.6: "stations auto-fire at the nearest valid target in arc. The player may click a
 * target to focus fire."
 *
 * The spec is explicit that this is a deliberate deviation from v0.2's fully user-driven
 * targeting rather than a reversal: the APM risk only shows up at three lanes and multiple
 * turrets, which P0 cannot reproduce. So the cheap option ships and the question stays
 * open -- and the focus override is here so the eventual answer has somewhere to go.
 */
export class TargetingSystem {
  private focusUnit: number;

  public constructor() {
    this.focusUnit = -1;
  }

  public setFocus(unitId: number): void {
    this.focusUnit = unitId;
  }

  public clearFocus(): void {
    this.focusUnit = -1;
  }

  public get focus(): number {
    return this.focusUnit;
  }

  /**
   * The unit a station should shoot. The focused unit if it is valid, otherwise the nearest
   * valid one, ties going to the lower unit id so two stations never disagree for reasons
   * of iteration order.
   */
  public pickTarget(
    structure: BlockStructure,
    arena: Arena,
    weapon: WeaponClass,
    station: number,
    units: readonly AttackerUnit[]
  ): AttackerUnit | null {
    if (this.focusUnit >= 0) {
      for (let i = 0; i < units.length; i++) {
        if (units[i].id === this.focusUnit && this.isValid(structure, weapon, station, units[i])) {
          return units[i];
        }
      }
    }
    let best: AttackerUnit | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!this.isValid(structure, weapon, station, unit)) {
        continue;
      }
      const distance = this.distanceTo(structure, station, unit);
      if (distance < bestDistance - 1e-9 || (distance <= bestDistance + 1e-9 && best !== null && unit.id < best.id)) {
        best = unit;
        bestDistance = distance;
      }
    }
    return best;
  }

  private isValid(
    structure: BlockStructure,
    weapon: WeaponClass,
    station: number,
    unit: AttackerUnit
  ): boolean {
    if (!unit.alive || !structure.isAlive(station)) {
      return false;
    }
    const position = structure.positionOf(station);
    const deltaX = unit.laneX - position.x;
    const deltaZ = unit.laneZ - position.z;
    const distance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    if (distance > weapon.range) {
      return false;
    }
    const facing = structure.blueprint.blockAt(station).facing;
    return FiringArc.containsDirection(facing, weapon.arcHalfAngle, deltaX, deltaZ);
  }

  private distanceTo(structure: BlockStructure, station: number, unit: AttackerUnit): number {
    const position = structure.positionOf(station);
    const deltaX = unit.laneX - position.x;
    const deltaZ = unit.laneZ - position.z;
    return Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
  }
}
