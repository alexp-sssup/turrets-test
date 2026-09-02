import { IVec3 } from "../core/IVec3";
import { MaterialTable } from "../materials/MaterialTable";
import { DamageVerbId } from "../materials/DamageVerbId";
import { BlockStructure } from "../structure/BlockStructure";
import { DamageResult } from "./DamageResult";
import { DamageVerb } from "./DamageVerb";
import { Impact } from "./Impact";

/**
 * A firepot (spec 4.3): "ignites wood, propagates along contiguous flammables, flows
 * downward before igniting".
 *
 * The downward flow is the interesting half. Burning pitch does not stop where it lands: it
 * runs down through whatever gaps the structure has and ignites the first flammable thing
 * it reaches. So an open wooden frame is worse than a closed one, and a stone roof over
 * wood is worth paying for -- neither of which needed a rule.
 */
export class IncendiaryVerb implements DamageVerb {
  public readonly id: DamageVerbId = DamageVerbId.Incendiary;
  private readonly materials: MaterialTable;
  /** How far the burning contents will run downhill looking for something to catch. */
  private readonly flowDepth: number;

  public constructor(materials: MaterialTable, flowDepth: number) {
    this.materials = materials;
    this.flowDepth = flowDepth;
  }

  public static withDefaults(materials: MaterialTable): IncendiaryVerb {
    return new IncendiaryVerb(materials, 8);
  }

  public apply(structure: BlockStructure, impact: Impact): DamageResult {
    const result = new DamageResult();

    // Whatever it lands on takes the (small) impact and catches if it can.
    const struck = structure.indexAt(impact.cell);
    if (struck >= 0) {
      if (structure.applyDamage(struck, impact.damage, this.materials)) {
        result.addDestroyed(struck);
      }
      if (this.materials.get(structure.materialOf(struck)).isFlammable && structure.isAlive(struck)) {
        result.addIgnition(struck);
        return result;
      }
    }

    // Otherwise it runs downward until it finds something flammable.
    let cell = struck >= 0 ? impact.cell : impact.cell;
    for (let depth = 0; depth < this.flowDepth; depth++) {
      cell = new IVec3(cell.x, cell.y - 1, cell.z);
      const block = structure.indexAt(cell);
      if (block < 0) {
        continue; // keeps falling through the gap
      }
      if (this.materials.get(structure.materialOf(block)).isFlammable) {
        result.addIgnition(block);
      }
      // Flammable or not, a solid block stops the flow.
      return result;
    }
    return result;
  }
}
