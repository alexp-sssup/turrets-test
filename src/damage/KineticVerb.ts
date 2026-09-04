import { Direction, Directions } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { FractureBehaviour } from "../materials/MaterialId";
import { MaterialTable } from "../materials/MaterialTable";
import { DamageVerbId } from "../materials/DamageVerbId";
import { BlockKind } from "../blueprint/BlockKind";
import { BlockStructure } from "../structure/BlockStructure";
import { DamageResult } from "./DamageResult";
import { DamageVerb } from "./DamageVerb";
import { Impact } from "./Impact";

/**
 * Deep, narrow penetration (spec 4.3).
 *
 * The round walks along its heading and each block it meets absorbs up to whatever
 * integrity it has left; what is not absorbed carries on. So the shape of the wound is a
 * consequence of the materials in the way rather than a tuned radius: solid shot punches
 * through several wood voxels and stops in one stone one.
 *
 * Two things happen besides destruction, and both matter more than the hole:
 *
 * * A hit **degrades the joints** around the block it bit into, in proportion to the
 *   damage. Structure is lost before blocks are, which is what lets the heatmap warn a
 *   player mid-wave instead of only in the replay.
 * * A **brittle** block (stone) that dies takes the joints of its neighbours with it, which
 *   is what "fractures under concentrated impact" means in practice: sustained fire on one
 *   face of a stone wall is worth more than spreading it around.
 */
export class KineticVerb implements DamageVerb {
  public readonly id: DamageVerbId = DamageVerbId.Kinetic;
  private readonly materials: MaterialTable;
  /** Joint capacity multiplier applied at full damage to a ductile block. */
  private readonly ductileJointLoss: number;
  /** Joint capacity multiplier applied to the neighbours of a shattered brittle block. */
  private readonly brittleJointLoss: number;

  public constructor(materials: MaterialTable, ductileJointLoss: number, brittleJointLoss: number) {
    this.materials = materials;
    this.ductileJointLoss = ductileJointLoss;
    this.brittleJointLoss = brittleJointLoss;
  }

  public static withDefaults(materials: MaterialTable): KineticVerb {
    return new KineticVerb(materials, 0.5, 0.4);
  }

  public apply(structure: BlockStructure, impact: Impact): DamageResult {
    const result = new DamageResult();
    const step = Directions.offset(impact.heading);
    let cell = impact.cell;
    let remaining = impact.damage;

    for (let depth = 0; depth <= impact.penetrationDepth && remaining > 0; depth++) {
      const block = structure.indexAt(cell);
      // Hatches spec 5: a hatch is not a contact. A hole is a hole, so a solid round passes
      // through it, spends nothing on it and damages it not at all, and goes on to strike
      // whatever is behind -- which is what makes a door on the lane face a firing port
      // into your own turret.
      if (block < 0 || structure.kindOf(block) === BlockKind.Hatch) {
        cell = cell.add(step); // through a hole, or through air before the first hit
        continue;
      }
      const properties = this.materials.get(structure.materialOf(block));
      const integrityLeft = properties.integrity - structure.damageOf(block);
      const absorbed = remaining < integrityLeft ? remaining : integrityLeft;
      const destroyed = structure.applyDamage(block, absorbed, this.materials);
      remaining -= absorbed;

      const severity = properties.integrity > 0 ? absorbed / properties.integrity : 1;
      if (destroyed) {
        result.addDestroyed(block);
        if (structure.kindOf(block) === BlockKind.Depot) {
          result.addDetonation(block);
        }
        if (properties.fractureBehaviour === FractureBehaviour.Brittle) {
          this.fracture(structure, block, result);
        }
      } else {
        this.degradeAround(structure, block, 1 - this.ductileJointLoss * severity, result);
      }
      cell = cell.add(step);
    }
    return result;
  }

  /** A shattered brittle block leaves its neighbours' joints cracked. */
  private fracture(structure: BlockStructure, block: number, result: DamageResult): void {
    const position = structure.positionOf(block);
    for (let d = 0; d < 6; d++) {
      const neighbour = structure.indexAt(position.add(Directions.offset(d as Direction)));
      if (neighbour < 0) {
        continue;
      }
      this.degradeAround(structure, neighbour, 1 - this.brittleJointLoss, result);
    }
  }

  private degradeAround(
    structure: BlockStructure,
    block: number,
    factor: number,
    result: DamageResult
  ): void {
    if (factor >= 1) {
      return;
    }
    const position = structure.positionOf(block);
    for (let d = 0; d < 6; d++) {
      const offset = Directions.offset(d as Direction);
      const neighbourPosition = position.add(offset);
      const neighbour = structure.indexAt(neighbourPosition);
      if (neighbour < 0) {
        continue;
      }
      // Joints are named low-to-high along the axis, matching the joint graph.
      const low = Directions.isPositive(d as Direction) ? block : neighbour;
      const high = Directions.isPositive(d as Direction) ? neighbour : block;
      structure.degradeJoint(low, high, factor);
      result.addDegradation(low, high, factor);
    }
    // The support underneath cracks too, which is how a hit near the base tells.
    if (structure.jointFactor(-1, block) > 0) {
      structure.degradeJoint(-1, block, factor);
      result.addDegradation(-1, block, factor);
    }
  }

  /** Where a shot travelling in `heading` first meets the structure, or null. */
  public static firstContact(
    structure: BlockStructure,
    origin: IVec3,
    heading: Direction,
    maxSteps: number
  ): IVec3 | null {
    const step = Directions.offset(heading);
    let cell = origin;
    for (let i = 0; i < maxSteps; i++) {
      const block = structure.indexAt(cell);
      // Hatches spec 5: a round that finds only hatches all the way through leaves by the
      // far side and hits nothing. A wasted shot is the correct outcome, not a special case.
      if (block >= 0 && structure.kindOf(block) !== BlockKind.Hatch) {
        return cell;
      }
      cell = cell.add(step);
    }
    return null;
  }
}
