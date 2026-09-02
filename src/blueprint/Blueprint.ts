import { GridBounds } from "../core/GridBounds";
import { IVec3 } from "../core/IVec3";
import { EMPTY_CELL, VoxelIndexGrid } from "../core/VoxelIndexGrid";
import { MaterialTable } from "../materials/MaterialTable";
import { BillOfMaterials } from "./BillOfMaterials";
import { BLOCK_KIND_COUNT, BlockKind } from "./BlockKind";
import { BlueprintBlock } from "./BlueprintBlock";

/**
 * A finished, immutable design. Blocks are stored in canonical order (`IVec3.compare`) so
 * that two blueprints built by different routes iterate identically -- the ordering feeds
 * collapse reports and repair priority, and spec 4.5 wants those reproducible.
 *
 * Blueprints are material-locked by construction: the material is a per-voxel field of the
 * design, so a wood frame and a stone frame are two blueprints, not one with a switch
 * (spec 4.1).
 */
export class Blueprint {
  public readonly name: string;
  private readonly blocks: readonly BlueprintBlock[];
  private readonly boundsValue: GridBounds;
  private readonly lookup: VoxelIndexGrid;
  private readonly kindIndex: readonly number[][];

  /** Prefer `BlueprintBuilder`; this constructor assumes canonical, de-duplicated input. */
  public constructor(name: string, blocks: readonly BlueprintBlock[]) {
    if (blocks.length === 0) {
      throw new Error("Blueprint '" + name + "' has no blocks");
    }
    this.name = name;
    this.blocks = blocks;

    const positions: IVec3[] = [];
    for (let i = 0; i < blocks.length; i++) {
      positions.push(blocks[i].position);
    }
    this.boundsValue = GridBounds.fromPoints(positions, 0);
    this.lookup = new VoxelIndexGrid(this.boundsValue);
    const kinds: number[][] = [];
    for (let k = 0; k < BLOCK_KIND_COUNT; k++) {
      kinds.push([]);
    }
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (this.lookup.get(block.position) !== EMPTY_CELL) {
        throw new Error("Blueprint '" + name + "' has two blocks at " + block.position.toString());
      }
      this.lookup.set(block.position, i);
      kinds[block.kind as number].push(i);
    }
    this.kindIndex = kinds;
  }

  public get blockCount(): number {
    return this.blocks.length;
  }

  public blockAt(index: number): BlueprintBlock {
    return this.blocks[index];
  }

  public get bounds(): GridBounds {
    return this.boundsValue;
  }

  /** Index of the block at `position`, or -1. */
  public indexAt(position: IVec3): number {
    return this.lookup.get(position);
  }

  public blockAtPosition(position: IVec3): BlueprintBlock | null {
    const index = this.indexAt(position);
    if (index === EMPTY_CELL) {
      return null;
    }
    return this.blocks[index];
  }

  public hasBlockAt(position: IVec3): boolean {
    return this.lookup.isOccupied(position);
  }

  /** Block indices of one kind, in canonical order. */
  public indicesOfKind(kind: BlockKind): readonly number[] {
    return this.kindIndex[kind as number];
  }

  public countOfKind(kind: BlockKind): number {
    return this.kindIndex[kind as number].length;
  }

  public billOfMaterials(): BillOfMaterials {
    const bill = new BillOfMaterials();
    for (let i = 0; i < this.blocks.length; i++) {
      bill.add(this.blocks[i].material, 1);
    }
    return bill;
  }

  public totalCost(materials: MaterialTable): number {
    return this.billOfMaterials().totalCost(materials);
  }

  /** Total mass, and the centre of mass. Spec 6: P1's platforms read these, not add them. */
  public totalMass(materials: MaterialTable, voxelSize: number): number {
    const volume = voxelSize * voxelSize * voxelSize;
    let mass = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      mass += materials.get(this.blocks[i].material).density * volume;
    }
    return mass;
  }
}
