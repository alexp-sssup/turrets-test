import { IVec3 } from "../core/IVec3";

/**
 * A crew route through the structure, as a sequence of occupied cells.
 *
 * Spec 4.3 makes resupply simulated rather than abstracted, so a path is a first-class
 * object: it has a length, a walk time, and it can be checked for whether it still exists
 * after damage. The editor shows it, the runner walks it, and the replay shows it severed.
 */
export class Path {
  private readonly cells: readonly IVec3[];

  public constructor(cells: readonly IVec3[]) {
    if (cells.length === 0) {
      throw new Error("Path needs at least one cell");
    }
    this.cells = cells;
  }

  public get cellCount(): number {
    return this.cells.length;
  }

  public cellAt(index: number): IVec3 {
    return this.cells[index];
  }

  public get start(): IVec3 {
    return this.cells[0];
  }

  public get end(): IVec3 {
    return this.cells[this.cells.length - 1];
  }

  /** Steps taken, which is one fewer than the number of cells occupied. */
  public get stepCount(): number {
    return this.cells.length - 1;
  }

  /** Seconds to walk the path one way, at the given speed in voxels per second. */
  public duration(walkSpeed: number): number {
    if (walkSpeed <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return this.stepCount / walkSpeed;
  }

  /** Seconds for the there-and-back trip a resupply run actually costs. */
  public roundTripDuration(walkSpeed: number): number {
    return 2 * this.duration(walkSpeed);
  }

  public passesThrough(cell: IVec3): boolean {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i].equals(cell)) {
        return true;
      }
    }
    return false;
  }
}
