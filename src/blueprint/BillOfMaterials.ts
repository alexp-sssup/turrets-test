import { MATERIAL_COUNT, MaterialId } from "../materials/MaterialId";
import { MaterialTable } from "../materials/MaterialTable";

/**
 * Voxel counts per material, and the cost that follows from them.
 *
 * Spec 6: "blueprint cost is already a bill of materials, so nothing downstream changes"
 * when the extraction economy replaces the budget provider. This class is that bill.
 */
export class BillOfMaterials {
  private readonly counts: Int32Array;

  public constructor() {
    this.counts = new Int32Array(MATERIAL_COUNT);
  }

  public add(material: MaterialId, count: number): void {
    this.counts[material as number] += count;
  }

  public countOf(material: MaterialId): number {
    return this.counts[material as number];
  }

  public get voxelCount(): number {
    let total = 0;
    for (let i = 0; i < this.counts.length; i++) {
      total += this.counts[i];
    }
    return total;
  }

  public totalCost(materials: MaterialTable): number {
    let cost = 0;
    for (let i = 0; i < this.counts.length; i++) {
      cost += this.counts[i] * materials.get(i as MaterialId).costPerVoxel;
    }
    return cost;
  }
}
