import { IVec3 } from "./IVec3";

/** Half-open axis-aligned voxel box: `min` inclusive, `min + size` exclusive. */
export class GridBounds {
  public readonly min: IVec3;
  public readonly size: IVec3;

  public constructor(min: IVec3, size: IVec3) {
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
      throw new Error("GridBounds size must be positive on every axis");
    }
    this.min = min;
    this.size = size;
  }

  public static fromPoints(points: readonly IVec3[], margin: number): GridBounds {
    if (points.length === 0) {
      throw new Error("GridBounds.fromPoints needs at least one point");
    }
    let minX = points[0].x;
    let minY = points[0].y;
    let minZ = points[0].z;
    let maxX = minX;
    let maxY = minY;
    let maxZ = minZ;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p.x < minX) {
        minX = p.x;
      }
      if (p.y < minY) {
        minY = p.y;
      }
      if (p.z < minZ) {
        minZ = p.z;
      }
      if (p.x > maxX) {
        maxX = p.x;
      }
      if (p.y > maxY) {
        maxY = p.y;
      }
      if (p.z > maxZ) {
        maxZ = p.z;
      }
    }
    return new GridBounds(
      new IVec3(minX - margin, minY - margin, minZ - margin),
      new IVec3(maxX - minX + 1 + 2 * margin, maxY - minY + 1 + 2 * margin, maxZ - minZ + 1 + 2 * margin)
    );
  }

  public get cellCount(): number {
    return this.size.x * this.size.y * this.size.z;
  }

  public contains(position: IVec3): boolean {
    const dx = position.x - this.min.x;
    const dy = position.y - this.min.y;
    const dz = position.z - this.min.z;
    return dx >= 0 && dy >= 0 && dz >= 0 && dx < this.size.x && dy < this.size.y && dz < this.size.z;
  }

  /** Linear index of a contained cell; -1 when outside. X fastest, then Z, then Y. */
  public indexOf(position: IVec3): number {
    return this.indexAt(position.x, position.y, position.z);
  }

  /**
   * The same index from loose coordinates.
   *
   * The renderer's face and occlusion rules ask about a cell's neighbours three or four
   * times per cell per frame (isometric renderer spec 3), and a `IVec3` minted for each
   * question is an allocation per cell that spec 8 does not allow.
   */
  public indexAt(x: number, y: number, z: number): number {
    const dx = x - this.min.x;
    const dy = y - this.min.y;
    const dz = z - this.min.z;
    if (
      dx < 0 ||
      dy < 0 ||
      dz < 0 ||
      dx >= this.size.x ||
      dy >= this.size.y ||
      dz >= this.size.z
    ) {
      return -1;
    }
    return dx + this.size.x * (dz + this.size.z * dy);
  }

  public positionOf(index: number): IVec3 {
    const planeSize = this.size.x * this.size.z;
    const dy = Math.floor(index / planeSize);
    const remainder = index - dy * planeSize;
    const dz = Math.floor(remainder / this.size.x);
    const dx = remainder - dz * this.size.x;
    return new IVec3(this.min.x + dx, this.min.y + dy, this.min.z + dz);
  }
}
