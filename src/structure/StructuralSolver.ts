import { Vec3 } from "../core/Vec3";
import { Dials } from "../config/Dials";
import { MaterialTable } from "../materials/MaterialTable";
import { LpStatus } from "../math/lp/LpSolution";
import { SimplexSolver } from "../math/lp/SimplexSolver";
import { BlockStructure } from "./BlockStructure";
import {
  cornerPullComponent,
  cornerPushComponent,
  JOINT_COMPONENT_COUNT,
  JOINT_CORNER_COUNT,
  Joint,
  JointComponent,
} from "./Joint";
import { JointGraph } from "./JointGraph";
import { LoadSet } from "./LoadSet";
import { StructuralModel } from "./StructuralModel";
import { StructuralReport, StructuralStatus } from "./StructuralReport";
import { OverturningCheck } from "./OverturningCheck";
import { SupportAnalysis } from "./SupportAnalysis";
import { SupportSurface } from "./SupportSurface";
import { UTILIZATION_EPSILON } from "../core/Numeric";

/**
 * Runs the limit-analysis linear program and turns its optimum into the numbers the game
 * reads: a load factor, a per-joint utilization field, a failure mechanism and a predictive
 * highlight set.
 *
 * Stateless apart from its configuration, so it can be shared; caching lives in
 * `StructuralAnalysisCache` instead.
 */
export class StructuralSolver {
  private readonly materials: MaterialTable;
  private readonly dials: Dials;
  private readonly simplex: SimplexSolver;

  public constructor(materials: MaterialTable, dials: Dials, simplex: SimplexSolver) {
    this.materials = materials;
    this.dials = dials;
    this.simplex = simplex;
  }

  public static withDefaults(materials: MaterialTable, dials: Dials): StructuralSolver {
    return new StructuralSolver(materials, dials, SimplexSolver.withDefaults());
  }

  /** Gravity-only loading. The case the editor shows by default. */
  public analyseSelfWeight(structure: BlockStructure, joints: JointGraph): StructuralReport {
    const loads = LoadSet.gravity(structure, this.materials, this.dials.gravity, this.dials.voxelSize);
    return this.analyse(structure, joints, loads);
  }

  /** Convenience: the graph the analysis needs, built with this solver's material table. */
  public buildJointGraph(structure: BlockStructure, surface: SupportSurface): JointGraph {
    return JointGraph.build(structure, this.materials, surface, this.dials.voxelSize);
  }

  public analyse(structure: BlockStructure, joints: JointGraph, loads: LoadSet): StructuralReport {
    const floating = SupportAnalysis.floatingBlocks(structure, joints);
    const included = new Uint8Array(structure.blockCount);
    for (let block = 0; block < structure.blockCount; block++) {
      included[block] = structure.isAlive(block) ? 1 : 0;
    }
    for (let i = 0; i < floating.length; i++) {
      included[floating[i]] = 0;
    }

    const mass = this.computeMass(structure, included);
    const centre = this.computeCentreOfMass(structure, included, mass);
    const tippingMargin = OverturningCheck.margin(structure, joints, loads, this.dials.voxelSize);

    let includedCount = 0;
    for (let block = 0; block < structure.blockCount; block++) {
      includedCount += included[block];
    }
    if (includedCount === 0 || loads.totalMagnitude() === 0) {
      // Nothing attached, or nothing pulling on it: there is no collapse to find.
      return new StructuralReport(
        StructuralStatus.Sound,
        Number.POSITIVE_INFINITY,
        joints,
        new Float64Array(joints.jointCount),
        new Float64Array(joints.jointCount * JOINT_COMPONENT_COUNT),
        [],
        [],
        floating,
        mass,
        centre,
        tippingMargin,
        0,
        0,
        0
      );
    }

    const model = StructuralModel.build(structure, joints, loads, included, this.dials.voxelSize);
    const solution = this.simplex.solve(model.program);

    let status: StructuralStatus;
    let loadFactor: number;
    if (solution.status === LpStatus.Unbounded) {
      status = StructuralStatus.Sound;
      loadFactor = Number.POSITIVE_INFINITY;
    } else if (solution.status === LpStatus.Infeasible) {
      // The zero force field always satisfies equilibrium at lambda = 0, so this can only
      // mean a numerical failure, not a modelling one. Reported as unknown, not as safe.
      status = StructuralStatus.SolverFailure;
      loadFactor = 0;
    } else if (solution.status === LpStatus.IterationLimit) {
      status = StructuralStatus.SolverFailure;
      loadFactor = solution.value(model.loadFactorVariable);
    } else {
      loadFactor = solution.value(model.loadFactorVariable);
      if (loadFactor <= UTILIZATION_EPSILON) {
        status = StructuralStatus.Unsupportable;
        loadFactor = 0;
      } else if (loadFactor + UTILIZATION_EPSILON >= 1) {
        status = StructuralStatus.Sound;
      } else {
        status = StructuralStatus.Overloaded;
      }
    }

    const jointCount = joints.jointCount;
    const forces = new Float64Array(jointCount * JOINT_COMPONENT_COUNT);
    const shares = new Float64Array(jointCount);
    for (let j = 0; j < jointCount; j++) {
      for (let c = 0; c < JOINT_COMPONENT_COUNT; c++) {
        forces[j * JOINT_COMPONENT_COUNT + c] = solution.value(
          StructuralModel.jointVariable(j, c as JointComponent)
        );
      }
      shares[j] = model.isJointIncluded(j)
        ? StructuralSolver.capacityShareOf(joints.jointAt(j), forces, j)
        : 0;
    }

    const criticalJoints: number[] = [];
    const highlights: number[] = [];
    for (let j = 0; j < jointCount; j++) {
      if (shares[j] >= 1 - 1e-6) {
        criticalJoints.push(j);
      }
      const utilization = loadFactor > 0 && Number.isFinite(loadFactor) ? shares[j] / loadFactor : 0;
      if (utilization >= this.dials.predictiveThreshold) {
        highlights.push(j);
      }
    }

    return new StructuralReport(
      status,
      loadFactor,
      joints,
      shares,
      forces,
      criticalJoints,
      highlights,
      floating,
      mass,
      centre,
      tippingMargin,
      solution.iterations,
      model.program.rowCount,
      model.program.variableCount
    );
  }

  /**
   * Fraction of a joint's capacity used by the given force field.
   *
   * Every capacity in the model is a variable bound, so this is simply the largest
   * bound-utilisation among the joint's seven unknowns. That makes the peak over all joints
   * exactly 1 at the optimum -- some bound has to bind, or the whole homogeneous force
   * field could be scaled up and the load factor was not optimal. That identity is what
   * makes the heatmap trustworthy.
   */
  public static capacityShareOf(joint: Joint, forces: Float64Array, jointIndex: number): number {
    const base = jointIndex * JOINT_COMPONENT_COUNT;
    let share = 0;
    for (let corner = 0; corner < JOINT_CORNER_COUNT; corner++) {
      // Net force, so a solution that happens to hold both halves of a pair open is
      // measured by what the joint actually carries.
      const net =
        forces[base + (cornerPushComponent(corner) as number)] -
        forces[base + (cornerPullComponent(corner) as number)];
      if (net > 0) {
        share = StructuralSolver.shareAgainst(share, net, joint.cornerCompressionCapacity);
      } else if (net < 0) {
        share = StructuralSolver.shareAgainst(share, -net, joint.cornerTensionCapacity);
      }
      if (share >= 1) {
        return 1;
      }
    }
    const shearU =
      forces[base + (JointComponent.ShearUForward as number)] -
      forces[base + (JointComponent.ShearUBackward as number)];
    const shearV =
      forces[base + (JointComponent.ShearVForward as number)] -
      forces[base + (JointComponent.ShearVBackward as number)];
    const shear = StructuralSolver.larger(
      StructuralSolver.magnitude(shearU),
      StructuralSolver.magnitude(shearV)
    );
    share = StructuralSolver.shareAgainst(share, shear, joint.shearCapacity);
    const twist = StructuralSolver.magnitude(
      forces[base + (JointComponent.TorsionForward as number)] -
        forces[base + (JointComponent.TorsionBackward as number)]
    );
    share = StructuralSolver.shareAgainst(share, twist, joint.torsionCapacity);
    return share > 1 ? 1 : share;
  }

  /** Folds one demand/capacity ratio into a running maximum, treating 0/0 as unused. */
  private static shareAgainst(current: number, demand: number, capacity: number): number {
    if (capacity > 0) {
      const ratio = demand / capacity;
      return ratio > current ? ratio : current;
    }
    return demand > UTILIZATION_EPSILON ? 1 : current;
  }

  private computeMass(structure: BlockStructure, included: Uint8Array): number {
    const volume = this.dials.voxelSize * this.dials.voxelSize * this.dials.voxelSize;
    let mass = 0;
    for (let block = 0; block < structure.blockCount; block++) {
      if (included[block] === 1) {
        mass += this.materials.get(structure.materialOf(block)).density * volume;
      }
    }
    return mass;
  }

  /** Spec 6: the solver already computes these, so P1's platforms read them. */
  private computeCentreOfMass(structure: BlockStructure, included: Uint8Array, mass: number): Vec3 {
    if (mass <= 0) {
      return Vec3.zero();
    }
    const volume = this.dials.voxelSize * this.dials.voxelSize * this.dials.voxelSize;
    let x = 0;
    let y = 0;
    let z = 0;
    for (let block = 0; block < structure.blockCount; block++) {
      if (included[block] !== 1) {
        continue;
      }
      const blockMass = this.materials.get(structure.materialOf(block)).density * volume;
      const position = structure.positionOf(block);
      x += blockMass * (position.x + 0.5) * this.dials.voxelSize;
      y += blockMass * (position.y + 0.5) * this.dials.voxelSize;
      z += blockMass * (position.z + 0.5) * this.dials.voxelSize;
    }
    return new Vec3(x / mass, y / mass, z / mass);
  }

  private static magnitude(value: number): number {
    return value < 0 ? -value : value;
  }

  private static larger(a: number, b: number): number {
    return a > b ? a : b;
  }
}
