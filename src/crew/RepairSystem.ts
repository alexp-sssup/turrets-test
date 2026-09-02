import { Dials } from "../config/Dials";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockStructure } from "../structure/BlockStructure";
import { CrewPool } from "./CrewPool";

/** What one repair window achieved. */
export class RepairOutcome {
  private readonly rebuiltBlocks: number[];
  private readonly patchedBlocks: number[];
  public readonly secondsUsed: number;
  public readonly detailCount: number;

  public constructor(
    rebuilt: number[],
    patched: number[],
    secondsUsed: number,
    detailCount: number
  ) {
    this.rebuiltBlocks = rebuilt;
    this.patchedBlocks = patched;
    this.secondsUsed = secondsUsed;
    this.detailCount = detailCount;
  }

  public get rebuilt(): readonly number[] {
    return this.rebuiltBlocks;
  }

  /** Blocks that were damaged but standing, and were brought back to full integrity. */
  public get patched(): readonly number[] {
    return this.patchedBlocks;
  }

  public get isEmpty(): boolean {
    return this.rebuiltBlocks.length === 0 && this.patchedBlocks.length === 0;
  }
}

/**
 * Spec 4.4 and 4.39: "automatic crew repair against blueprint", during the inter-wave
 * window.
 *
 * Repair is a diff, which is the whole reason the blueprint is immutable and separate from
 * the runtime structure. Priority is canonical block order, which is y-major -- so a detail
 * rebuilds from the ground up and the structure is never briefly holding a repaired roof
 * over a missing wall.
 */
export class RepairSystem {
  private readonly materials: MaterialTable;
  private readonly dials: Dials;

  public constructor(materials: MaterialTable, dials: Dials) {
    this.materials = materials;
    this.dials = dials;
  }

  /**
   * Spends `seconds` of repair time. Each detail restores one voxel per
   * `repairSecondsPerVoxel`, and details work in parallel.
   */
  public repair(structure: BlockStructure, crew: CrewPool, seconds: number): RepairOutcome {
    const details = crew.repairDetailCount(this.dials);
    if (details === 0 || seconds <= 0) {
      return new RepairOutcome([], [], 0, details);
    }
    const perVoxel = this.dials.repairSecondsPerVoxel;
    const budget = Math.floor((seconds * details) / perVoxel);
    const rebuilt: number[] = [];
    const patched: number[] = [];
    let spent = 0;

    for (let block = 0; block < structure.blockCount && spent < budget; block++) {
      if (!structure.isAlive(block)) {
        // Only rebuild what a detail can reach: a block with no surviving neighbour and no
        // ground under it would be rebuilt into thin air.
        if (!RepairSystem.hasAnchor(structure, block)) {
          continue;
        }
        structure.restore(block);
        rebuilt.push(block);
        spent++;
        continue;
      }
      if (structure.damageOf(block) > 0) {
        structure.restore(block);
        patched.push(block);
        spent++;
      }
    }
    return new RepairOutcome(rebuilt, patched, spent * perVoxel / details, details);
  }

  /** True when a destroyed block has something live to be rebuilt onto. */
  private static hasAnchor(structure: BlockStructure, block: number): boolean {
    const position = structure.positionOf(block);
    if (position.y === structure.blueprint.bounds.min.y) {
      return true; // it sits on the pad
    }
    for (let d = 0; d < 6; d++) {
      if (structure.neighbourOf(block, d) >= 0) {
        return true;
      }
    }
    return false;
  }

  /** Blocks that differ from the blueprint, for the editor and the between-wave report. */
  public outstandingRepairs(structure: BlockStructure): number[] {
    const outstanding: number[] = [];
    for (let block = 0; block < structure.blockCount; block++) {
      if (!structure.isAlive(block) || structure.damageOf(block) > 0) {
        outstanding.push(block);
      }
    }
    return outstanding;
  }
}
