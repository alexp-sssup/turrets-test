import { Direction, Directions } from "../core/Direction";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockStructure } from "../structure/BlockStructure";

/** What one advance of the fire did. */
export class FireStep {
  private readonly spreadTo: number[];
  private readonly consumedBlocks: number[];

  public constructor(spreadTo: number[], consumedBlocks: number[]) {
    this.spreadTo = spreadTo;
    this.consumedBlocks = consumedBlocks;
  }

  public get spread(): readonly number[] {
    return this.spreadTo;
  }

  public get consumed(): readonly number[] {
    return this.consumedBlocks;
  }

  public get isQuiet(): boolean {
    return this.spreadTo.length === 0 && this.consumedBlocks.length === 0;
  }
}

/**
 * Fire, as spec 4.5's third wave needs it: it propagates along contiguous flammables and
 * eventually consumes what it is burning.
 *
 * Burning state lives here rather than on `BlockStructure`, which stays purely structural.
 * Ignition and spread order are fixed (ascending block index, then the six directions in
 * enum order with *down* first, since fire runs downhill in this game before it climbs), so
 * a wave of firepots does the same damage on every run (spec 4.5).
 */
export class FireSimulation {
  private readonly materials: MaterialTable;
  /** Block index -> seconds it has been burning. */
  private readonly burning: Map<number, number>;
  /** Fraction of a material's burn duration before it sets light to its neighbours. */
  private readonly spreadFraction: number;

  public constructor(materials: MaterialTable, spreadFraction: number) {
    this.materials = materials;
    this.burning = new Map<number, number>();
    this.spreadFraction = spreadFraction;
  }

  public static withDefaults(materials: MaterialTable): FireSimulation {
    return new FireSimulation(materials, 0.5);
  }

  /** Sets a block alight. Returns false when it cannot burn or is already burning. */
  public ignite(structure: BlockStructure, block: number): boolean {
    if (block < 0 || !structure.isAlive(block)) {
      return false;
    }
    if (this.burning.has(block)) {
      return false;
    }
    if (!this.materials.get(structure.materialOf(block)).isFlammable) {
      return false;
    }
    this.burning.set(block, 0);
    return true;
  }

  public isBurning(block: number): boolean {
    return this.burning.has(block);
  }

  public get burningCount(): number {
    return this.burning.size;
  }

  /** Burning blocks in ascending index order, so iteration never depends on insertion. */
  public burningBlocks(): number[] {
    const blocks: number[] = [];
    this.burning.forEach((_elapsed: number, block: number): void => {
      blocks.push(block);
    });
    blocks.sort((a: number, b: number): number => a - b);
    return blocks;
  }

  public extinguish(block: number): void {
    this.burning.delete(block);
  }

  /** Drops any burning block that no longer exists (destroyed by something else). */
  public prune(structure: BlockStructure): void {
    const blocks = this.burningBlocks();
    for (let i = 0; i < blocks.length; i++) {
      if (!structure.isAlive(blocks[i])) {
        this.burning.delete(blocks[i]);
      }
    }
  }

  /**
   * Advances every fire by `seconds`. Blocks past their burn duration are consumed --
   * destroyed, which is what makes the structural solver care about wave 3.
   */
  public advance(structure: BlockStructure, seconds: number): FireStep {
    const spread: number[] = [];
    const consumed: number[] = [];
    const blocks = this.burningBlocks();

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!structure.isAlive(block)) {
        this.burning.delete(block);
        continue;
      }
      const elapsed = (this.burning.get(block) as number) + seconds;
      this.burning.set(block, elapsed);
      const duration = this.materials.get(structure.materialOf(block)).burnDurationSeconds;

      if (elapsed >= duration * this.spreadFraction) {
        this.spreadFrom(structure, block, spread);
      }
      if (elapsed >= duration) {
        structure.destroy(block);
        this.burning.delete(block);
        consumed.push(block);
      }
    }
    spread.sort((a: number, b: number): number => a - b);
    consumed.sort((a: number, b: number): number => a - b);
    return new FireStep(spread, consumed);
  }

  /** Down first: in this game fire runs downhill before it climbs. */
  private spreadFrom(structure: BlockStructure, block: number, spread: number[]): void {
    const order: readonly Direction[] = [
      Direction.NegY,
      Direction.NegX,
      Direction.PosX,
      Direction.NegZ,
      Direction.PosZ,
      Direction.PosY,
    ];
    const position = structure.positionOf(block);
    for (let i = 0; i < order.length; i++) {
      const neighbour = structure.indexAt(position.add(Directions.offset(order[i])));
      if (neighbour < 0) {
        continue;
      }
      if (this.ignite(structure, neighbour)) {
        spread.push(neighbour);
      }
    }
  }
}
