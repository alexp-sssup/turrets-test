/**
 * Integer voxel coordinate. Immutable value type: every operation returns a new instance,
 * which is what a C++ translation would do with a 12-byte struct returned by value.
 */
export class IVec3 {
  public readonly x: number;
  public readonly y: number;
  public readonly z: number;

  public constructor(x: number, y: number, z: number) {
    this.x = x | 0;
    this.y = y | 0;
    this.z = z | 0;
  }

  public static zero(): IVec3 {
    return new IVec3(0, 0, 0);
  }

  public add(other: IVec3): IVec3 {
    return new IVec3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  public sub(other: IVec3): IVec3 {
    return new IVec3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  public equals(other: IVec3): boolean {
    return this.x === other.x && this.y === other.y && this.z === other.z;
  }

  /** Manhattan distance; the metric the crew walk graph uses for its heuristic. */
  public manhattanTo(other: IVec3): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy) + (dz < 0 ? -dz : dz);
  }

  /**
   * Total order used to make every coordinate-driven iteration deterministic
   * (spec 4.5). Y major so "lower first" reads naturally in collapse reports.
   */
  public static compare(a: IVec3, b: IVec3): number {
    if (a.y !== b.y) {
      return a.y < b.y ? -1 : 1;
    }
    if (a.z !== b.z) {
      return a.z < b.z ? -1 : 1;
    }
    if (a.x !== b.x) {
      return a.x < b.x ? -1 : 1;
    }
    return 0;
  }

  public toString(): string {
    return "(" + this.x.toString() + "," + this.y.toString() + "," + this.z.toString() + ")";
  }
}
