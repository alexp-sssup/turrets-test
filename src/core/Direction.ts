import { IVec3 } from "./IVec3";
import { Vec3 } from "./Vec3";

/** The three voxel axes. Joints are named by the axis their face normal lies on. */
export enum Axis {
  X = 0,
  Y = 1,
  Z = 2,
}

export const AXIS_COUNT: number = 3;

/** The six face neighbours, in a fixed order so neighbour iteration is deterministic. */
export enum Direction {
  NegX = 0,
  PosX = 1,
  NegY = 2,
  PosY = 3,
  NegZ = 4,
  PosZ = 5,
}

export const DIRECTION_COUNT: number = 6;

const DIRECTION_OFFSETS: readonly IVec3[] = [
  new IVec3(-1, 0, 0),
  new IVec3(1, 0, 0),
  new IVec3(0, -1, 0),
  new IVec3(0, 1, 0),
  new IVec3(0, 0, -1),
  new IVec3(0, 0, 1),
];

/**
 * Right-handed local frames, one per axis: `normal = tangentU x tangentV`. Fixed rather
 * than derived, because a frame that depends on iteration order would make joint force
 * signs depend on iteration order too.
 */
const AXIS_NORMALS: readonly Vec3[] = [Vec3.unitX(), Vec3.unitY(), Vec3.unitZ()];
const AXIS_TANGENT_U: readonly Vec3[] = [Vec3.unitY(), Vec3.unitZ(), Vec3.unitX()];
const AXIS_TANGENT_V: readonly Vec3[] = [Vec3.unitZ(), Vec3.unitX(), Vec3.unitY()];

export class Directions {
  public static offset(direction: Direction): IVec3 {
    return DIRECTION_OFFSETS[direction as number];
  }

  public static opposite(direction: Direction): Direction {
    // Directions are stored in +/- pairs, so flipping the low bit flips the sign.
    return ((direction as number) ^ 1) as Direction;
  }

  public static axisOf(direction: Direction): Axis {
    return ((direction as number) >> 1) as Axis;
  }

  /** `true` for the positive member of each axis pair. */
  public static isPositive(direction: Direction): boolean {
    return ((direction as number) & 1) === 1;
  }

  public static horizontal(): readonly Direction[] {
    return [Direction.NegX, Direction.PosX, Direction.NegZ, Direction.PosZ];
  }
}

export class Axes {
  public static normal(axis: Axis): Vec3 {
    return AXIS_NORMALS[axis as number];
  }

  public static tangentU(axis: Axis): Vec3 {
    return AXIS_TANGENT_U[axis as number];
  }

  public static tangentV(axis: Axis): Vec3 {
    return AXIS_TANGENT_V[axis as number];
  }
}
