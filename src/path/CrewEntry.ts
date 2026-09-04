import { Direction, Directions } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { GridBounds } from "../core/GridBounds";
import { WalkGraph } from "./WalkGraph";

/**
 * Where crew can walk into a design (crew-access spec 2).
 *
 * A question asked *of* the walk graph, never a change to it: getting in is geometry, so it
 * is answered by looking at the graph the runtime already uses rather than by giving one
 * block kind a privilege. That is what keeps depot round-trips (spec 4.3) out of it.
 */
export class CrewEntry {
  /**
   * The cells crew can enter at, in canonical order. Empty when the design is sealed.
   *
   * Two steps, in the order spec 2 states them: find the ground floor (2.1), then flood it
   * inward from outside the footprint through passable cells (2.2). Passable rather than
   * empty, because a hatch set into an outer wall is a door -- a convenience, not the
   * reason hatches exist.
   */
  public static cells(graph: WalkGraph, footprint: GridBounds): IVec3[] {
    const groundY = CrewEntry.groundFloor(graph, footprint);
    if (groundY === CrewEntry.NO_FLOOR) {
      return [];
    }
    return CrewEntry.floodInward(graph, footprint, groundY);
  }

  /** Returned by `groundFloor` when no storey of the design can be stood on at all. */
  private static readonly NO_FLOOR: number = -2147483648;

  /**
   * Spec 2.1: the lowest storey with a standable cell inside the footprint.
   *
   * The slab a turret stands on is a floor rather than a storey -- it is solid, so nothing
   * on it is standable -- which is why every shipped design's ground floor is the course
   * resting on its slab.
   */
  private static groundFloor(graph: WalkGraph, footprint: GridBounds): number {
    const bounds = graph.bounds;
    const maxY = bounds.min.y + bounds.size.y - 1;
    for (let y = bounds.min.y; y <= maxY; y++) {
      for (let x = footprint.min.x; x < footprint.min.x + footprint.size.x; x++) {
        for (let z = footprint.min.z; z < footprint.min.z + footprint.size.z; z++) {
          if (graph.isStandable(new IVec3(x, y, z))) {
            return y;
          }
        }
      }
    }
    return CrewEntry.NO_FLOOR;
  }

  /**
   * Spec 2.2: flood one storey from outside the footprint through passable cells, and
   * return the standable cells the flood reaches.
   *
   * The flood starts on the graph's one-voxel margin, which is why `WalkGraph.build` keeps
   * it: the ring of cells just outside the design is the outside world, at this storey.
   */
  private static floodInward(graph: WalkGraph, footprint: GridBounds, y: number): IVec3[] {
    const bounds = graph.bounds;
    const seen = new Set<number>();
    const queue: IVec3[] = [];
    const minX = bounds.min.x;
    const maxX = bounds.min.x + bounds.size.x - 1;
    const minZ = bounds.min.z;
    const maxZ = bounds.min.z + bounds.size.z - 1;

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const outside =
          x < footprint.min.x ||
          x >= footprint.min.x + footprint.size.x ||
          z < footprint.min.z ||
          z >= footprint.min.z + footprint.size.z;
        if (!outside) {
          continue;
        }
        const cell = new IVec3(x, y, z);
        if (!graph.isPassable(cell)) {
          continue;
        }
        const key = bounds.indexOf(cell);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        queue.push(cell);
      }
    }

    const entries: IVec3[] = [];
    const horizontal = Directions.horizontal();
    let head = 0;
    while (head < queue.length) {
      const cell = queue[head];
      head++;
      if (graph.isStandable(cell)) {
        entries.push(cell);
      }
      for (let d = 0; d < horizontal.length; d++) {
        const next = cell.add(Directions.offset(horizontal[d] as Direction));
        if (!bounds.contains(next) || !graph.isPassable(next)) {
          continue;
        }
        const key = bounds.indexOf(next);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        queue.push(next);
      }
    }
    entries.sort((a: IVec3, b: IVec3): number => IVec3.compare(a, b));
    return entries;
  }
}
