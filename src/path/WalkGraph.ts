import { Direction, Directions } from "../core/Direction";
import { GridBounds } from "../core/GridBounds";
import { SupportSurface } from "../structure/SupportSurface";
import { IVec3 } from "../core/IVec3";
import { BlockKind } from "../blueprint/BlockKind";
import { BlockStructure } from "../structure/BlockStructure";

/**
 * Where crew can stand and how they can move between those places.
 *
 * The rules, kept deliberately few so that a violation the editor reports is one a player
 * can see:
 *
 * * A cell is **passable** when a route may pass *through* it: it holds no live block, or it
 *   holds a hatch. A hatch is a doorway and a doorway is a way through (spec 4.2).
 * * A cell is **standable** when crew may stand in it: passable, with the cell below holding
 *   a live block or the cell on the ground plane (standable-ground spec 2) -- or a station,
 *   which is standable on its own account and asks nothing of either, because it is a place
 *   to be rather than a way through (station-terminus spec 2.1, 2.2).
 *   So crew walk on top of the structure, along its interior floors, and across the ground
 *   around it -- and a corridor that loses its floor stops being a corridor.
 * * A cell is a **terminus** when crew may stop in it and no route may continue through it.
 *   A station is the only one, and `AStar` is what honours it (station-terminus spec 2.3).
 * * Horizontal moves may step up or down by one. Vertical moves need a hatch at one end,
 *   so a hatch column is a ladder and a stack of gun ports is not (gun-ports spec 2.3).
 *
 * The graph is derived from the structure and rebuilt when it changes -- the same contract
 * the joint graph has, for the same reason. Spec 4.3 calls path invalidation as blocks die
 * a real cost of simulating resupply; this is where that cost lives.
 */
export class WalkGraph {
  private readonly structure: BlockStructure;
  private readonly boundsValue: GridBounds;
  private readonly surface: SupportSurface;
  private readonly version: number;

  private constructor(structure: BlockStructure, bounds: GridBounds, surface: SupportSurface) {
    this.structure = structure;
    this.boundsValue = bounds;
    this.surface = surface;
    this.version = structure.version;
  }

  /**
   * Builds a graph covering the structure plus one voxel of margin, so crew can stand on
   * top of it and walk around its outside.
   */
  public static build(structure: BlockStructure, surface: SupportSurface): WalkGraph {
    const inner = structure.blueprint.bounds;
    const bounds = new GridBounds(
      new IVec3(inner.min.x - 1, inner.min.y, inner.min.z - 1),
      new IVec3(inner.size.x + 2, inner.size.y + 2, inner.size.z + 2)
    );
    return new WalkGraph(structure, bounds, surface);
  }

  /**
   * Standable-ground spec 2: the pad has a floor, so a cell on it needs no block under it.
   *
   * The surface's apron is what makes this reach around a design that fills its pad --
   * every shipped one does -- and what keeps it from reaching out under an arm that
   * overhangs the lane, where no gunner stands.
   */
  public isGround(cell: IVec3): boolean {
    return this.surface.walkableAt(cell);
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

  /**
   * Whether a route may pass *through* this cell: empty air, or a hatch.
   *
   * Station-terminus spec 2.1 is why a station is not here, although its gunner stands in
   * one. A hatch is a hole, and a hole is a way through for a person and for a round alike
   * (hatches spec 5). A slit is person-sized from the inside and not a doorway from the
   * outside -- which is the same fact prototype §4.2 states from the other end, when a round
   * kills the gunner through the port and the block survives. Standing in a station is
   * `isStandable`; getting past one is not a thing.
   */
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
    // Station-terminus spec 2.2: a station is stood in rather than passed through, so it is
    // standable on its own account and asks nothing of passability or of the cell below.
    if (this.isStation(cell)) {
      return true;
    }
    if (!this.isPassable(cell)) {
      return false;
    }
    return this.hasFloor(cell) || this.isHatch(cell) || this.isGround(cell);
  }

  public isHatch(cell: IVec3): boolean {
    const block = this.structure.indexAt(cell);
    return block >= 0 && this.structure.kindOf(block) === BlockKind.Hatch;
  }

  /**
   * Gun-ports spec 2.2: a station needs nothing under it to be stood in.
   *
   * The emplacement is part of the block -- a gun port is a floor, a wall and a slit -- so
   * the gunner's footing arrives with it, exactly as a hatch's rungs do. Without this the
   * `reaching gun` example could not be manned at all: its station is the last cell of a
   * cantilever with open air underneath.
   */
  public isStation(cell: IVec3): boolean {
    const block = this.structure.indexAt(cell);
    return block >= 0 && this.structure.kindOf(block) === BlockKind.Station;
  }

  /**
   * A cell crew may stop in and no route may continue through (station-terminus spec 2.3).
   *
   * Asked by the pathfinder, so the rule lives with the block kinds rather than inside the
   * search: `AStar` accepts a terminus only as a destination. A station is the only one
   * there is, and this property is the whole of what separates a slit from a doorway.
   */
  public isTerminus(cell: IVec3): boolean {
    return this.isStation(cell);
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
