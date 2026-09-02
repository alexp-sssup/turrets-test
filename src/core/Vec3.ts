import { EPSILON } from "./Numeric";

/** Immutable real-valued 3-vector. Used for forces, moments and lever arms. */
export class Vec3 {
  public readonly x: number;
  public readonly y: number;
  public readonly z: number;

  public constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public static zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  public static unitX(): Vec3 {
    return new Vec3(1, 0, 0);
  }

  public static unitY(): Vec3 {
    return new Vec3(0, 1, 0);
  }

  public static unitZ(): Vec3 {
    return new Vec3(0, 0, 1);
  }

  public add(other: Vec3): Vec3 {
    return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  public sub(other: Vec3): Vec3 {
    return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  public scale(factor: number): Vec3 {
    return new Vec3(this.x * factor, this.y * factor, this.z * factor);
  }

  public dot(other: Vec3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  public cross(other: Vec3): Vec3 {
    return new Vec3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x
    );
  }

  public lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  public length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  /** Returns the zero vector for a degenerate input rather than NaN. */
  public normalized(): Vec3 {
    const len = this.length();
    if (len <= EPSILON) {
      return Vec3.zero();
    }
    return new Vec3(this.x / len, this.y / len, this.z / len);
  }

  public component(axis: number): number {
    if (axis === 0) {
      return this.x;
    }
    if (axis === 1) {
      return this.y;
    }
    return this.z;
  }

  public toString(): string {
    return "(" + this.x.toFixed(4) + "," + this.y.toFixed(4) + "," + this.z.toFixed(4) + ")";
  }
}
