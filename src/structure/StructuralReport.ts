import { Vec3 } from "../core/Vec3";
import {
  cornerOffsetU,
  cornerOffsetV,
  cornerPullComponent,
  cornerPushComponent,
  JOINT_COMPONENT_COUNT,
  JOINT_CORNER_COUNT,
  JointComponent,
} from "./Joint";
import { JointGraph } from "./JointGraph";

export enum StructuralStatus {
  /** The load factor is at least 1: the structure carries its loading case. */
  Sound = 0,
  /** `0 < loadFactor < 1`: it is over capacity and coming apart now. */
  Overloaded = 1,
  /** No admissible force field at any positive load. Nothing holds. */
  Unsupportable = 2,
  /** The solver ran out of its iteration budget. The result is unknown, not safe. */
  SolverFailure = 3,
}

export function structuralStatusName(status: StructuralStatus): string {
  if (status === StructuralStatus.Sound) {
    return "sound";
  }
  if (status === StructuralStatus.Overloaded) {
    return "overloaded";
  }
  if (status === StructuralStatus.Unsupportable) {
    return "unsupportable";
  }
  return "solver-failure";
}

/**
 * The result of one structural analysis, and the data behind the heatmap.
 *
 * Two per-joint fields, deliberately distinct:
 *
 * * `capacityShare(j)` -- the fraction of joint `j`'s capacity used by the force field at
 *   the *collapse* load. Its peak is exactly 1, and the joints that reach it are the
 *   failure mechanism. This is what the replay names as the joint that sheared.
 * * `utilization(j)` -- the same field divided by the load factor, i.e. how far this joint
 *   is along the way to failure at the *actual* load. Its peak is exactly `1/loadFactor`,
 *   so the heatmap and the headline margin cannot disagree, and a joint reaching 1 is a
 *   joint failing now. This is what gets coloured.
 */
export class StructuralReport {
  public readonly status: StructuralStatus;
  /** Multiple of the applied loading the structure can carry. `Infinity` when unloaded. */
  public readonly loadFactor: number;
  public readonly joints: JointGraph;
  private readonly shares: Float64Array;
  private readonly forces: Float64Array;
  private readonly criticalJointList: readonly number[];
  private readonly highlightList: readonly number[];
  private readonly floatingBlockList: readonly number[];
  public readonly totalMass: number;
  public readonly centreOfMass: Vec3;
  /**
   * Rigid-body tipping margin (see `OverturningCheck`). Reported alongside the load factor
   * rather than folded into it, because overturning is invariant under a load factor.
   */
  public readonly tippingMargin: number;
  public readonly simplexIterations: number;
  public readonly rowCount: number;
  public readonly columnCount: number;

  public constructor(
    status: StructuralStatus,
    loadFactor: number,
    joints: JointGraph,
    shares: Float64Array,
    forces: Float64Array,
    criticalJoints: readonly number[],
    highlights: readonly number[],
    floatingBlocks: readonly number[],
    totalMass: number,
    centreOfMass: Vec3,
    tippingMargin: number,
    simplexIterations: number,
    rowCount: number,
    columnCount: number
  ) {
    this.status = status;
    this.loadFactor = loadFactor;
    this.joints = joints;
    this.shares = shares;
    this.forces = forces;
    this.criticalJointList = criticalJoints;
    this.highlightList = highlights;
    this.floatingBlockList = floatingBlocks;
    this.totalMass = totalMass;
    this.centreOfMass = centreOfMass;
    this.tippingMargin = tippingMargin;
    this.simplexIterations = simplexIterations;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  public get jointCount(): number {
    return this.shares.length;
  }

  /** Capacity used at the collapse load, in [0, 1]. */
  public capacityShare(joint: number): number {
    return this.shares[joint];
  }

  /** Capacity used at the actual load. Peaks at `1 / loadFactor`. */
  public utilization(joint: number): number {
    if (!Number.isFinite(this.loadFactor)) {
      return 0;
    }
    if (this.loadFactor <= 0) {
      return this.shares[joint] > 0 ? Number.POSITIVE_INFINITY : 0;
    }
    return this.shares[joint] / this.loadFactor;
  }

  public maxUtilization(): number {
    let peak = 0;
    for (let j = 0; j < this.shares.length; j++) {
      const value = this.utilization(j);
      if (value > peak) {
        peak = value;
      }
    }
    return peak;
  }

  /**
   * One half of one joint unknown, as the linear program holds it. Non-negative by
   * construction; most callers want the signed accessors below instead.
   */
  public jointForce(joint: number, component: JointComponent): number {
    return this.forces[joint * JOINT_COMPONENT_COUNT + (component as number)];
  }

  /** Net force at one corner of a joint. Positive is compression. */
  public cornerForce(joint: number, corner: number): number {
    const base = joint * JOINT_COMPONENT_COUNT;
    return (
      this.forces[base + (cornerPushComponent(corner) as number)] -
      this.forces[base + (cornerPullComponent(corner) as number)]
    );
  }

  /**
   * Total normal force across the face: the sum of the corner forces. Positive is
   * compression. Derived rather than stored, because the corners are the unknowns.
   */
  public normalForce(joint: number): number {
    let total = 0;
    for (let corner = 0; corner < JOINT_CORNER_COUNT; corner++) {
      total += this.cornerForce(joint, corner);
    }
    return total;
  }

  /** Bending moment about the joint's `u` tangent, from the corner force distribution. */
  public bendingAboutU(joint: number): number {
    const lever = this.joints.jointAt(joint).momentLever;
    let total = 0;
    for (let corner = 0; corner < JOINT_CORNER_COUNT; corner++) {
      total += cornerOffsetV(corner) * this.cornerForce(joint, corner);
    }
    return total * lever;
  }

  /** Bending moment about the joint's `v` tangent. */
  public bendingAboutV(joint: number): number {
    const lever = this.joints.jointAt(joint).momentLever;
    let total = 0;
    for (let corner = 0; corner < JOINT_CORNER_COUNT; corner++) {
      total += cornerOffsetU(corner) * this.cornerForce(joint, corner);
    }
    return -total * lever;
  }

  public shearU(joint: number): number {
    return (
      this.jointForce(joint, JointComponent.ShearUForward) -
      this.jointForce(joint, JointComponent.ShearUBackward)
    );
  }

  public shearV(joint: number): number {
    return (
      this.jointForce(joint, JointComponent.ShearVForward) -
      this.jointForce(joint, JointComponent.ShearVBackward)
    );
  }

  public torsion(joint: number): number {
    return (
      this.jointForce(joint, JointComponent.TorsionForward) -
      this.jointForce(joint, JointComponent.TorsionBackward)
    );
  }

  /** Largest of the two shear components. */
  public shearMagnitude(joint: number): number {
    const u = this.shearU(joint);
    const v = this.shearV(joint);
    const absU = u < 0 ? -u : u;
    const absV = v < 0 ? -v : v;
    return absU > absV ? absU : absV;
  }

  /** The failure mechanism: joints at capacity under the collapse load. */
  public get criticalJoints(): readonly number[] {
    return this.criticalJointList;
  }

  /**
   * Joints the player should be looking at: utilization at or above the predictive
   * threshold. Empty while the structure has comfortable margin, and it fills up as the
   * margin thins -- which is the "predict a failure before it happens" claim in spec 1.1.
   */
  public get predictiveHighlight(): readonly number[] {
    return this.highlightList;
  }

  /** Live blocks with no path to the ground. Falling regardless of capacity. */
  public get floatingBlocks(): readonly number[] {
    return this.floatingBlockList;
  }

  /** Sound, standing on its footprint, and nothing floating. The editor's one question. */
  public get isStanding(): boolean {
    return (
      this.status === StructuralStatus.Sound &&
      this.floatingBlockList.length === 0 &&
      this.tippingMargin >= 1
    );
  }

  /** True when tipping, rather than any joint, is what is wrong. */
  public get isTipping(): boolean {
    return this.tippingMargin < 1;
  }

  /** Highest utilization among the joints touching a block; -1 when it has none. */
  public maxUtilizationAtBlock(block: number): number {
    const incident = this.joints.jointsOfBlock(block);
    if (incident.length === 0) {
      return -1;
    }
    let peak = 0;
    for (let i = 0; i < incident.length; i++) {
      const value = this.utilization(incident[i]);
      if (value > peak) {
        peak = value;
      }
    }
    return peak;
  }
}
