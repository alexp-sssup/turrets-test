import { Direction, Directions } from "../core/Direction";
import { GridBounds } from "../core/GridBounds";
import { IVec3 } from "../core/IVec3";
import { BlockKind } from "../blueprint/BlockKind";
import { BlockStructure } from "../structure/BlockStructure";

/**
 * Where crew can stand and how they can move between those places.
 *
 * The rules, kept deliberately few so that a violation the editor reports is one a player
 * can see:
 *
 * * A cell is **passable** when it holds no live block, or holds a hatch. Hatches are the
 *   only block kind crew move through, which is what gives them a job (spec 4.2).
 * * A cell is **standable** when it is passable and the cell below holds a live block. So
 *   crew walk on top of the structure and along its interior floors, and a corridor that
 *   loses its floor stops being a corridor.
 * * Horizontal moves may step up or down by one. Vertical moves need a hatch at one end,
 *   so a hatch column is a ladder.
 *
 * The graph is derived from the structure and rebuilt when it changes -- the same contract
 * the joint graph has, for the same reason. Spec 4.3 calls path invalidation as blocks die
 * a real cost of simulating resupply; this is where that cost lives.
 */
export class WalkGraph {
  private readonly structure: BlockStructure;
  private readonly boundsValue: GridBounds;
  private readonly version: number;

  private constructor(structure: BlockStructure, bounds: GridBounds) {
    this.structure = structure;
    this.boundsValue = bounds;
    this.version = structure.version;
  }

  /**
   * Builds a graph covering the structure plus one voxel of margin, so crew can stand on
   * top of it and walk around its outside.
   */
  public static build(structure: BlockStructure): WalkGraph {
    const inner = structure.blueprint.bounds;
    const bounds = new GridBounds(
      new IVec3(inner.min.x - 1, inner.min.y, inner.min.z - 1),
      new IVec3(inner.size.x + 2, inner.size.y + 2, inner.size.z + 2)
    );
    return new WalkGraph(structure, bounds);
  }

  public get bounds(): GridBounds {
    return this.boundsValue;
  }

  /** The structure version this graph was built from; a mismatch means rebuild. */
  public get builtAtVersion(): number {
    return this.version;
  }

  public get isStale(): boolean {
    return this.structure.version !== this.version;
  }

  public get cellCount(): number {
    return this.boundsValue.cellCount;
  }

  public indexOf(cell: IVec3): number {
    return this.boundsValue.indexOf(cell);
  }

  public cellOf(index: number): IVec3 {
    return this.boundsValue.positionOf(index);
  }

  public isPassable(cell: IVec3): boolean {
    const block = this.structure.indexAt(cell);
    if (block < 0) {
      return true;
    }
    return this.structure.kindOf(block) === BlockKind.Hatch;
  }

  /** True when the cell has a floor under it. */
  public hasFloor(cell: IVec3): boolean {
    return this.structure.indexAt(new IVec3(cell.x, cell.y - 1, cell.z)) >= 0;
  }

  public isStandable(cell: IVec3): boolean {
    if (!this.boundsValue.contains(cell)) {
      return false;
    }
    if (!this.isPassable(cell)) {
      return false;
    }
    return this.hasFloor(cell) || this.isHatch(cell);
  }

  public isHatch(cell: IVec3): boolean {
    const block = this.structure.indexAt(cell);
    return block >= 0 && this.structure.kindOf(block) === BlockKind.Hatch;
  }

  /**
   * Writes the standable neighbours of `cell` into `out` and returns how many there are.
   * Neighbours come out in a fixed order (the four horizontal directions, each with its
   * step down, level and step up, then down, then up), so search order never depends on
   * anything but geometry.
   */
  public neighbours(cell: IVec3, out: IVec3[]): number {
    let count = 0;
    const horizontal = Directions.horizontal();
    for (let d = 0; d < horizontal.length; d++) {
      const offset = Directions.offset(horizontal[d]);
      for (let dy = -1; dy <= 1; dy++) {
        const candidate = new IVec3(cell.x + offset.x, cell.y + dy, cell.z + offset.z);
        if (!this.isStandable(candidate)) {
          continue;
        }
        // Stepping up needs headroom above the cell being left.
        if (dy > 0 && !this.isPassable(new IVec3(cell.x, cell.y + 1, cell.z))) {
          continue;
        }
        out[count] = candidate;
        count++;
      }
    }
    // Vertical movement, but only through a hatch: a hatch column is a ladder.
    const below = new IVec3(cell.x, cell.y - 1, cell.z);
    const above = new IVec3(cell.x, cell.y + 1, cell.z);
    if (this.isHatch(cell) || this.isHatch(below)) {
      if (this.isStandable(below)) {
        out[count] = below;
        count++;
      }
    }
    if (this.isHatch(cell) || this.isHatch(above)) {
      if (this.isStandable(above)) {
        out[count] = above;
        count++;
      }
    }
    return count;
  }

  /** Largest number of neighbours a cell can have; sizes the caller's scratch buffer. */
  public static maxNeighbours(): number {
    return 14;
  }

  /**
   * Standable cells touching a block, in fixed direction order. A station's crew stand in
   * one of these, and so does a runner reaching a depot.
   */
  public accessCells(blockPosition: IVec3): IVec3[] {
    const result: IVec3[] = [];
    for (let d = 0; d < 6; d++) {
      const candidate = blockPosition.add(Directions.offset(d as Direction));
      if (this.isStandable(candidate)) {
        result.push(candidate);
      }
    }
    return result;
  }
}
