import { IVec3 } from "../core/IVec3";
import { Path } from "./Path";
import { WalkGraph } from "./WalkGraph";

/**
 * A* over the crew walk graph, with every tie broken on the linear cell index.
 *
 * Spec 4.3 is explicit that pathfinding must use fixed tie-breaks: "a runner who picks a
 * different route on the second attempt breaks the fix-and-rerun loop". So the frontier is
 * ordered by `(f, then g, then cell index)` -- a total order that depends only on the
 * geometry -- and nothing here consults insertion order or a hash container.
 */
export class AStar {
  private readonly graph: WalkGraph;
  private readonly cost: Float64Array;
  private readonly estimate: Float64Array;
  private readonly cameFrom: Int32Array;
  private readonly closed: Uint8Array;
  private readonly heap: Int32Array;
  private heapSize: number = 0;
  private readonly scratch: IVec3[];
  private searchesRun: number = 0;
  private cellsExpanded: number = 0;

  public constructor(graph: WalkGraph) {
    this.graph = graph;
    const cells = graph.cellCount;
    this.cost = new Float64Array(cells);
    this.estimate = new Float64Array(cells);
    this.cameFrom = new Int32Array(cells);
    this.closed = new Uint8Array(cells);
    this.heap = new Int32Array(cells + 1);
    this.scratch = [];
    for (let i = 0; i < WalkGraph.maxNeighbours(); i++) {
      this.scratch.push(IVec3.zero());
    }
  }

  public get searches(): number {
    return this.searchesRun;
  }

  public get expansions(): number {
    return this.cellsExpanded;
  }

  /** Shortest path from `start` to `goal`, or null when none exists. */
  public findPath(start: IVec3, goal: IVec3): Path | null {
    const goals: IVec3[] = [goal];
    return this.findPathToAny(start, goals);
  }

  /**
   * Shortest path from `start` to whichever of `goals` is closest. Ties between equally
   * close goals go to the lowest cell index, not to the order they were listed in, so
   * "nearest depot" is a property of the structure rather than of the caller.
   */
  public findPathToAny(start: IVec3, goals: readonly IVec3[]): Path | null {
    this.searchesRun++;
    const startIndex = this.graph.indexOf(start);
    if (startIndex < 0 || !this.graph.isStandable(start)) {
      return null;
    }
    const goalFlags = new Map<number, boolean>();
    let goalCount = 0;
    for (let i = 0; i < goals.length; i++) {
      const index = this.graph.indexOf(goals[i]);
      if (index >= 0 && this.graph.isStandable(goals[i])) {
        goalFlags.set(index, true);
        goalCount++;
      }
    }
    if (goalCount === 0) {
      return null;
    }
    if (goalFlags.has(startIndex)) {
      return new Path([start]);
    }

    this.cost.fill(Number.POSITIVE_INFINITY);
    this.closed.fill(0);
    this.cameFrom.fill(-1);
    this.heapSize = 0;

    this.cost[startIndex] = 0;
    this.estimate[startIndex] = AStar.heuristic(start, goals);
    this.push(startIndex);

    while (this.heapSize > 0) {
      const current = this.pop();
      if (this.closed[current] === 1) {
        continue;
      }
      this.closed[current] = 1;
      this.cellsExpanded++;
      if (goalFlags.has(current)) {
        return this.reconstruct(current);
      }
      const cell = this.graph.cellOf(current);
      const count = this.graph.neighbours(cell, this.scratch);
      for (let i = 0; i < count; i++) {
        const neighbour = this.scratch[i];
        const index = this.graph.indexOf(neighbour);
        if (index < 0 || this.closed[index] === 1) {
          continue;
        }
        const tentative = this.cost[current] + 1;
        if (tentative < this.cost[index]) {
          this.cost[index] = tentative;
          this.estimate[index] = tentative + AStar.heuristic(neighbour, goals);
          this.cameFrom[index] = current;
          this.push(index);
        }
      }
    }
    return null;
  }

  /** Manhattan distance to the nearest goal: admissible for unit-cost 6-way movement. */
  private static heuristic(cell: IVec3, goals: readonly IVec3[]): number {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < goals.length; i++) {
      const distance = cell.manhattanTo(goals[i]);
      if (distance < best) {
        best = distance;
      }
    }
    return best;
  }

  private reconstruct(goalIndex: number): Path {
    const reversed: IVec3[] = [];
    let cursor = goalIndex;
    while (cursor >= 0) {
      reversed.push(this.graph.cellOf(cursor));
      cursor = this.cameFrom[cursor];
    }
    const cells: IVec3[] = [];
    for (let i = reversed.length - 1; i >= 0; i--) {
      cells.push(reversed[i]);
    }
    return new Path(cells);
  }

  /** Total order on frontier entries: estimate, then cost, then cell index. */
  private isBefore(a: number, b: number): boolean {
    if (this.estimate[a] !== this.estimate[b]) {
      return this.estimate[a] < this.estimate[b];
    }
    if (this.cost[a] !== this.cost[b]) {
      return this.cost[a] < this.cost[b];
    }
    return a < b;
  }

  private push(index: number): void {
    let position = this.heapSize;
    this.heap[position] = index;
    this.heapSize++;
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (this.isBefore(this.heap[position], this.heap[parent])) {
        const swap = this.heap[parent];
        this.heap[parent] = this.heap[position];
        this.heap[position] = swap;
        position = parent;
      } else {
        break;
      }
    }
  }

  private pop(): number {
    const top = this.heap[0];
    this.heapSize--;
    this.heap[0] = this.heap[this.heapSize];
    let position = 0;
    for (;;) {
      const left = position * 2 + 1;
      const right = left + 1;
      let best = position;
      if (left < this.heapSize && this.isBefore(this.heap[left], this.heap[best])) {
        best = left;
      }
      if (right < this.heapSize && this.isBefore(this.heap[right], this.heap[best])) {
        best = right;
      }
      if (best === position) {
        break;
      }
      const swap = this.heap[best];
      this.heap[best] = this.heap[position];
      this.heap[position] = swap;
      position = best;
    }
    return top;
  }
}
