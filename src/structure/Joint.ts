import { Axis } from "../core/Direction";
import { Vec3 } from "../core/Vec3";

/** Sentinel for "the ground" on the low side of a support joint. */
export const GROUND_BLOCK: number = -1;

export const JOINT_CORNER_COUNT: number = 4;

/**
 * The unknowns a joint contributes, in the joint's local frame `(n, u, v)`.
 *
 * Two things are going on here, and both are load-bearing on the solver being usable.
 *
 * **Bending is not a variable.** The normal force is resolved into four corner forces, one
 * at each corner of the shared face. That is not an approximation -- it is exactly the
 * plastic interaction between axial force and bending for a rectangular section. It means
 * every capacity is a variable *bound* rather than a constraint row, so the program has
 * `6 * blocks` rows instead of `6 * blocks + 4 * joints`. It also means "stone is
 * compression only" needs no rule: corner forces with a zero tension bound cannot pull, so
 * the thrust line stays inside the section, so a stone joint carries bending only in
 * proportion to the compression already on it and a free-ended stone arm carries none.
 *
 * **Every unknown is split into two non-negative halves.** A corner has a push part and a
 * pull part; shear and torsion have a forward and a backward part. This costs twice the
 * columns and buys two things that matter more:
 *
 * 1. Every variable has zero as its lower bound and every row is homogeneous, so the
 *    all-zero point is feasible and phase one of the simplex has nothing to do.
 * 2. A nonbasic variable then sits at *zero* rather than at capacity. With a signed
 *    formulation, a basic solution parks most of its variables on a capacity bound for
 *    reasons that have nothing to do with failure, and the utilization field -- the whole
 *    readability claim of spec 1.1 -- becomes noise.
 */
export enum JointComponent {
  CornerNegNegPush = 0,
  CornerNegNegPull = 1,
  CornerNegPosPush = 2,
  CornerNegPosPull = 3,
  CornerPosNegPush = 4,
  CornerPosNegPull = 5,
  CornerPosPosPush = 6,
  CornerPosPosPull = 7,
  ShearUForward = 8,
  ShearUBackward = 9,
  ShearVForward = 10,
  ShearVBackward = 11,
  TorsionForward = 12,
  TorsionBackward = 13,
}

export const JOINT_COMPONENT_COUNT: number = 14;

/** Component index of a corner's compression half. */
export function cornerPushComponent(corner: number): JointComponent {
  return (corner * 2) as JointComponent;
}

/** Component index of a corner's tension half. */
export function cornerPullComponent(corner: number): JointComponent {
  return (corner * 2 + 1) as JointComponent;
}

/** Offset of a corner along the `u` tangent, in units of the moment lever. */
export function cornerOffsetU(corner: number): number {
  return (corner & 2) !== 0 ? 1 : -1;
}

/** Offset of a corner along the `v` tangent, in units of the moment lever. */
export function cornerOffsetV(corner: number): number {
  return (corner & 1) !== 0 ? 1 : -1;
}

/**
 * A shared face between two blocks, or between a block and the ground.
 *
 * `blockLow` sits on the `-n` side and `blockHigh` on the `+n` side, so the sign convention
 * is fixed by geometry rather than by the order the graph was built in.
 */
export class Joint {
  public readonly blockLow: number;
  public readonly blockHigh: number;
  public readonly axis: Axis;
  /** Centre of the shared face, in world units. */
  public readonly centre: Vec3;
  /** Total force the face carries in pull-apart. Zero for stone and for every support. */
  public readonly tensionCapacity: number;
  public readonly compressionCapacity: number;
  public readonly shearCapacity: number;
  public readonly torsionCapacity: number;
  /** Half-width of the face: the lever arm of a corner about the face centre. */
  public readonly momentLever: number;

  public constructor(
    blockLow: number,
    blockHigh: number,
    axis: Axis,
    centre: Vec3,
    tensionCapacity: number,
    compressionCapacity: number,
    shearCapacity: number,
    torsionCapacity: number,
    momentLever: number
  ) {
    this.blockLow = blockLow;
    this.blockHigh = blockHigh;
    this.axis = axis;
    this.centre = centre;
    this.tensionCapacity = tensionCapacity;
    this.compressionCapacity = compressionCapacity;
    this.shearCapacity = shearCapacity;
    this.torsionCapacity = torsionCapacity;
    this.momentLever = momentLever;
  }

  public get isSupport(): boolean {
    return this.blockLow === GROUND_BLOCK;
  }

  /** Compression one corner may carry; four of them make up the face capacity. */
  public get cornerCompressionCapacity(): number {
    return this.compressionCapacity / JOINT_CORNER_COUNT;
  }

  public get cornerTensionCapacity(): number {
    return this.tensionCapacity / JOINT_CORNER_COUNT;
  }

  /**
   * Largest bending moment the face can carry, which happens with two corners at full
   * compression and two at full tension.
   */
  public get maxMomentCapacity(): number {
    return (this.compressionCapacity + this.tensionCapacity) * this.momentLever * 0.5;
  }
}
