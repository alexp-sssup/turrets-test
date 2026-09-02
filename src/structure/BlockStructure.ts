import { Direction, Directions } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { EMPTY_CELL, VoxelIndexGrid } from "../core/VoxelIndexGrid";
import { GridBounds } from "../core/GridBounds";
import { MaterialId } from "../materials/MaterialId";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockKind } from "../blueprint/BlockKind";
import { Blueprint } from "../blueprint/Blueprint";

/**
 * Runtime state of a built turret: the blueprint plus everything damage has done to it.
 *
 * Block indices are the blueprint's indices, and they never move. A destroyed block leaves
 * a hole in the index space instead of compacting the arrays, so a replay event recorded at
 * wave 2 still names the same block at wave 5, and repair (spec 4.4) is a per-index diff
 * against the design.
 *
 * Joint degradation lives here rather than on the joint graph because the graph is derived
 * and gets rebuilt on every damage event, while "this joint has been sheared" has to
 * survive. Spec 6 makes joints the unit of degradation for exactly this reason.
 */
export class BlockStructure {
  private readonly design: Blueprint;
  private readonly positions: readonly IVec3[];
  private readonly materials: Int8Array;
  private readonly kinds: Int8Array;
  private readonly aliveFlags: Uint8Array;
  private readonly damageTaken: Float64Array;
  private readonly grid: VoxelIndexGrid;
  /** Joint key -> capacity multiplier in [0, 1]. Absent means an intact joint. */
  private readonly jointFactors: Map<number, number>;
  private readonly keyStride: number;
  private aliveCountValue: number;
  private versionValue: number;

  public constructor(design: Blueprint) {
    this.design = design;
    const count = design.blockCount;
    const positions: IVec3[] = [];
    this.materials = new Int8Array(count);
    this.kinds = new Int8Array(count);
    this.aliveFlags = new Uint8Array(count);
    this.damageTaken = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const block = design.blockAt(i);
      positions.push(block.position);
      this.materials[i] = block.material as number;
      this.kinds[i] = block.kind as number;
      this.aliveFlags[i] = 1;
    }
    this.positions = positions;
    // One voxel of margin so that neighbour probes at the hull do not need bounds checks
    // written twice.
    this.grid = new VoxelIndexGrid(
      new GridBounds(
        new IVec3(design.bounds.min.x - 1, design.bounds.min.y - 1, design.bounds.min.z - 1),
        new IVec3(design.bounds.size.x + 2, design.bounds.size.y + 2, design.bounds.size.z + 2)
      )
    );
    for (let i = 0; i < count; i++) {
      this.grid.set(positions[i], i);
    }
    this.jointFactors = new Map<number, number>();
    this.keyStride = count + 1;
    this.aliveCountValue = count;
    this.versionValue = 1;
  }

  public get blueprint(): Blueprint {
    return this.design;
  }

  public get blockCount(): number {
    return this.positions.length;
  }

  public get aliveCount(): number {
    return this.aliveCountValue;
  }

  /**
   * Bumped by anything that changes the joint graph. Callers cache analyses against it, so
   * live damage only re-solves when the structure actually changed (spec 1.1).
   */
  public get version(): number {
    return this.versionValue;
  }

  public get bounds(): GridBounds {
    return this.grid.bounds;
  }

  public positionOf(block: number): IVec3 {
    return this.positions[block];
  }

  public materialOf(block: number): MaterialId {
    return this.materials[block] as MaterialId;
  }

  public kindOf(block: number): BlockKind {
    return this.kinds[block] as BlockKind;
  }

  public isAlive(block: number): boolean {
    return this.aliveFlags[block] === 1;
  }

  public damageOf(block: number): number {
    return this.damageTaken[block];
  }

  /** Block index at a position, or -1 for empty, destroyed or out of bounds. */
  public indexAt(position: IVec3): number {
    const index = this.grid.get(position);
    if (index === EMPTY_CELL) {
      return -1;
    }
    if (this.aliveFlags[index] === 0) {
      return -1;
    }
    return index;
  }

  public isSolid(position: IVec3): boolean {
    return this.indexAt(position) >= 0;
  }

  /** Live face neighbour in a direction, or -1. */
  public neighbourOf(block: number, direction: Direction): number {
    return this.indexAt(this.positions[block].add(Directions.offset(direction)));
  }

  /**
   * Adds kinetic damage. Returns true when the block was destroyed by it. Damage is
   * measured against the material's integrity, so the same shot bites differently into
   * wood and stone.
   */
  public applyDamage(block: number, amount: number, materials: MaterialTable): boolean {
    if (!this.isAlive(block) || amount <= 0) {
      return false;
    }
    this.damageTaken[block] += amount;
    if (this.damageTaken[block] >= materials.get(this.materialOf(block)).integrity) {
      this.destroy(block);
      return true;
    }
    return false;
  }

  public destroy(block: number): void {
    if (!this.isAlive(block)) {
      return;
    }
    this.aliveFlags[block] = 0;
    this.aliveCountValue--;
    this.versionValue++;
  }

  /** Rebuilds a block to blueprint: full integrity, intact joints (spec 4.4). */
  public restore(block: number): void {
    if (this.isAlive(block)) {
      this.damageTaken[block] = 0;
      return;
    }
    this.aliveFlags[block] = 1;
    this.damageTaken[block] = 0;
    this.aliveCountValue++;
    this.versionValue++;
    // Repair also restores the joints around the block, which is why a repaired frame
    // recovers its structural margin rather than staying quietly weak.
    for (let d = 0; d < 6; d++) {
      const neighbour = this.neighbourOf(block, d as Direction);
      if (neighbour >= 0) {
        this.jointFactors.delete(this.jointKey(block, neighbour));
      }
    }
    this.jointFactors.delete(this.jointKey(-1, block));
  }

  /**
   * Stable key for the joint between two blocks. `-1` names the ground, so support joints
   * degrade through the same path as everything else.
   */
  public jointKey(blockLow: number, blockHigh: number): number {
    return (blockLow + 1) * this.keyStride + (blockHigh + 1);
  }

  /** Capacity multiplier of a joint: 1 intact, 0 severed. */
  public jointFactor(blockLow: number, blockHigh: number): number {
    const stored = this.jointFactors.get(this.jointKey(blockLow, blockHigh));
    if (stored === undefined) {
      return 1;
    }
    return stored;
  }

  /** Multiplies a joint's remaining capacity by `factor`; never recovers on its own. */
  public degradeJoint(blockLow: number, blockHigh: number, factor: number): void {
    const clamped = factor < 0 ? 0 : factor > 1 ? 1 : factor;
    const key = this.jointKey(blockLow, blockHigh);
    const current = this.jointFactors.get(key);
    const next = (current === undefined ? 1 : current) * clamped;
    this.jointFactors.set(key, next);
    this.versionValue++;
  }

  public severJoint(blockLow: number, blockHigh: number): void {
    this.jointFactors.set(this.jointKey(blockLow, blockHigh), 0);
    this.versionValue++;
  }

  public get degradedJointCount(): number {
    return this.jointFactors.size;
  }

  /**
   * A deep copy of the runtime state, sharing the immutable design.
   *
   * This is what makes "what collapses if this block dies" answerable without breaking
   * the run: the predictive overlay destroys a block on a copy, resolves the collapse on
   * the copy, and throws it away. Live state is never speculatively mutated.
   */
  public clone(): BlockStructure {
    const copy = new BlockStructure(this.design);
    for (let i = 0; i < this.positions.length; i++) {
      copy.aliveFlags[i] = this.aliveFlags[i];
      copy.damageTaken[i] = this.damageTaken[i];
    }
    this.jointFactors.forEach((factor: number, key: number): void => {
      copy.jointFactors.set(key, factor);
    });
    copy.aliveCountValue = this.aliveCountValue;
    copy.versionValue = this.versionValue;
    return copy;
  }

  /** Live blocks of a kind, in canonical index order. */
  public aliveOfKind(kind: BlockKind): number[] {
    const result: number[] = [];
    const indices = this.design.indicesOfKind(kind);
    for (let i = 0; i < indices.length; i++) {
      if (this.isAlive(indices[i])) {
        result.push(indices[i]);
      }
    }
    return result;
  }
}
