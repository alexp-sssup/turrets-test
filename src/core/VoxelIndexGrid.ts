import { GridBounds } from "./GridBounds";
import { IVec3 } from "./IVec3";

export const EMPTY_CELL: number = -1;

/**
 * Dense voxel -> integer-id lookup. Backed by an `Int32Array` (a `std::vector<int32_t>`),
 * because the structural solver rebuilds neighbour queries on every damage event and a
 * hash map keyed on a coordinate string would dominate that cost.
 */
export class VoxelIndexGrid {
  private readonly boundsValue: GridBounds;
  private readonly cells: Int32Array;

  public constructor(bounds: GridBounds) {
    this.boundsValue = bounds;
    this.cells = new Int32Array(bounds.cellCount);
    this.cells.fill(EMPTY_CELL);
  }

  public get bounds(): GridBounds {
    return this.boundsValue;
  }

  /** Returns the stored id, or `EMPTY_CELL` for an empty or out-of-bounds cell. */
  public get(position: IVec3): number {
    const index = this.boundsValue.indexOf(position);
    if (index < 0) {
      return EMPTY_CELL;
    }
    return this.cells[index];
  }

  /** The same lookup from loose coordinates, for the renderer's per-cell neighbour tests. */
  public getAt(x: number, y: number, z: number): number {
    const index = this.boundsValue.indexAt(x, y, z);
    if (index < 0) {
      return EMPTY_CELL;
    }
    return this.cells[index];
  }

  public set(position: IVec3, value: number): void {
    const index = this.boundsValue.indexOf(position);
    if (index < 0) {
      throw new Error("VoxelIndexGrid.set outside bounds: " + position.toString());
    }
    this.cells[index] = value;
  }

  public clear(position: IVec3): void {
    this.set(position, EMPTY_CELL);
  }

  public isOccupied(position: IVec3): boolean {
    return this.get(position) !== EMPTY_CELL;
  }
}
