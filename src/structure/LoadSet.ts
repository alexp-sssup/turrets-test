import { Vec3 } from "../core/Vec3";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockStructure } from "./BlockStructure";

/**
 * Applied loads, one force and one moment per block.
 *
 * The solver scales *all* of these by a single load factor, so a load set is a loading
 * *case*: self weight alone, or self weight plus the recoil of the guns that are firing
 * (spec 7). Keeping recoil in the same object as gravity is what makes recoil "a few lines
 * against the existing solver" rather than a separate pass.
 *
 * Loads are applied at block centres. A recoil impulse therefore produces a moment about
 * the joints below the station through the lever arm, but never about the station block's
 * own centre.
 */
export class LoadSet {
  private readonly force: Float64Array;
  private readonly moment: Float64Array;

  public constructor(blockCount: number) {
    this.force = new Float64Array(blockCount * 3);
    this.moment = new Float64Array(blockCount * 3);
  }

  /** Self weight of every live block. The base case for any analysis. */
  public static gravity(
    structure: BlockStructure,
    materials: MaterialTable,
    gravity: number,
    voxelSize: number
  ): LoadSet {
    const loads = new LoadSet(structure.blockCount);
    for (let block = 0; block < structure.blockCount; block++) {
      if (!structure.isAlive(block)) {
        continue;
      }
      const weight = materials.voxelWeight(structure.materialOf(block), gravity, voxelSize);
      loads.addForce(block, new Vec3(0, -weight, 0));
    }
    return loads;
  }

  public get blockCount(): number {
    return this.force.length / 3;
  }

  public addForce(block: number, value: Vec3): void {
    const base = block * 3;
    this.force[base] += value.x;
    this.force[base + 1] += value.y;
    this.force[base + 2] += value.z;
  }

  public addMoment(block: number, value: Vec3): void {
    const base = block * 3;
    this.moment[base] += value.x;
    this.moment[base + 1] += value.y;
    this.moment[base + 2] += value.z;
  }

  public forceComponent(block: number, axis: number): number {
    return this.force[block * 3 + axis];
  }

  public momentComponent(block: number, axis: number): number {
    return this.moment[block * 3 + axis];
  }

  public forceOf(block: number): Vec3 {
    const base = block * 3;
    return new Vec3(this.force[base], this.force[base + 1], this.force[base + 2]);
  }

  public momentOf(block: number): Vec3 {
    const base = block * 3;
    return new Vec3(this.moment[base], this.moment[base + 1], this.moment[base + 2]);
  }

  /** Sum of applied force magnitudes. Zero means the load factor is unbounded. */
  public totalMagnitude(): number {
    let total = 0;
    for (let i = 0; i < this.force.length; i++) {
      total += this.force[i] < 0 ? -this.force[i] : this.force[i];
    }
    for (let i = 0; i < this.moment.length; i++) {
      total += this.moment[i] < 0 ? -this.moment[i] : this.moment[i];
    }
    return total;
  }

  public copy(): LoadSet {
    const clone = new LoadSet(this.blockCount);
    for (let i = 0; i < this.force.length; i++) {
      clone.force[i] = this.force[i];
      clone.moment[i] = this.moment[i];
    }
    return clone;
  }
}
