import { Axes } from "../core/Direction";
import { Vec3 } from "../core/Vec3";
import { LinearProgram, LpObjectiveSense } from "../math/lp/LinearProgram";
import { BlockStructure } from "./BlockStructure";
import {
  cornerOffsetU,
  cornerOffsetV,
  cornerPullComponent,
  cornerPushComponent,
  GROUND_BLOCK,
  JOINT_COMPONENT_COUNT,
  JOINT_CORNER_COUNT,
  JointComponent,
} from "./Joint";
import { JointGraph } from "./JointGraph";
import { LoadSet } from "./LoadSet";

/**
 * Turns a structure, its joint graph and a loading case into the linear program described
 * in docs/structural-solver.md:
 *
 *     maximise   lambda
 *     subject to force and moment equilibrium at every block
 *                joint capacities (all of them variable bounds)
 *
 * By the static theorem of plastic limit analysis the optimum is the collapse load factor:
 * `lambda* >= 1` means the structure carries the loading case with that much margin.
 *
 * Because bending is carried by corner forces (see `JointComponent`), *every* capacity is a
 * bound and the only rows are the six equilibrium equations per block. The program is also
 * homogeneous, which is what makes the load factor and the utilization field two views of
 * one number rather than two independent estimates.
 *
 * Variable layout is `[7 per joint | lambda]`.
 */
/**
 * Cost applied to each unit of capacity share, as a tie-break among force fields that all
 * achieve the same collapse load factor.
 *
 * Without it the program is massively degenerate -- swapping load between two parallel
 * paths changes nothing -- and the simplex both wanders (iteration counts triple) and
 * parks unknowns on capacity bounds for reasons that have nothing to do with failure,
 * which makes the utilization field unreadable. With it the reported field is the *least
 * loaded* admissible one, so a joint reads as loaded only when every way of standing up
 * loads it.
 *
 * The cost is paid out of the load factor, so it has to be small enough not to matter and
 * large enough to register above the simplex's optimality tolerance. At 1e-7 per unit share
 * a structure with a few hundred units of total share loses around 1e-5 of load factor.
 */
export const SHARE_TIE_BREAK_COST: number = 1e-7;

export class StructuralModel {
  public readonly program: LinearProgram;
  public readonly loadFactorVariable: number;
  public readonly jointCount: number;
  private readonly includedJoints: Uint8Array;

  private constructor(
    program: LinearProgram,
    loadFactorVariable: number,
    jointCount: number,
    includedJoints: Uint8Array
  ) {
    this.program = program;
    this.loadFactorVariable = loadFactorVariable;
    this.jointCount = jointCount;
    this.includedJoints = includedJoints;
  }

  public static jointVariable(joint: number, component: JointComponent): number {
    return joint * JOINT_COMPONENT_COUNT + (component as number);
  }

  public isJointIncluded(joint: number): boolean {
    return this.includedJoints[joint] === 1;
  }

  /**
   * `includedBlocks` selects which blocks get equilibrium equations -- live blocks that are
   * connected to the ground. Blocks left out are already falling, and a joint touching one
   * is pinned to zero rather than removed, so joint indices stay aligned with the graph.
   */
  public static build(
    structure: BlockStructure,
    joints: JointGraph,
    loads: LoadSet,
    includedBlocks: Uint8Array,
    voxelSize: number
  ): StructuralModel {
    const program = new LinearProgram(LpObjectiveSense.Maximize);
    const jointCount = joints.jointCount;
    const includedJoints = new Uint8Array(jointCount);

    for (let j = 0; j < jointCount; j++) {
      const joint = joints.jointAt(j);
      const lowIncluded = joint.blockLow === GROUND_BLOCK || includedBlocks[joint.blockLow] === 1;
      const highIncluded = includedBlocks[joint.blockHigh] === 1;
      const included = lowIncluded && highIncluded;
      includedJoints[j] = included ? 1 : 0;
      const suffix = "[" + j.toString() + "]";
      if (!included) {
        for (let c = 0; c < JOINT_COMPONENT_COUNT; c++) {
          program.addVariable(0, 0, 0, "pinned" + suffix);
        }
        continue;
      }
      // Every half is non-negative, which is what makes the all-zero start feasible.
      for (let corner = 0; corner < JOINT_CORNER_COUNT; corner++) {
        StructuralModel.addHalf(program, joint.cornerCompressionCapacity, "push" + corner.toString() + suffix);
        StructuralModel.addHalf(program, joint.cornerTensionCapacity, "pull" + corner.toString() + suffix);
      }
      StructuralModel.addHalf(program, joint.shearCapacity, "Su+" + suffix);
      StructuralModel.addHalf(program, joint.shearCapacity, "Su-" + suffix);
      StructuralModel.addHalf(program, joint.shearCapacity, "Sv+" + suffix);
      StructuralModel.addHalf(program, joint.shearCapacity, "Sv-" + suffix);
      StructuralModel.addHalf(program, joint.torsionCapacity, "T+" + suffix);
      StructuralModel.addHalf(program, joint.torsionCapacity, "T-" + suffix);
    }
    const loadFactorVariable = program.addVariable(0, Number.POSITIVE_INFINITY, 1, "lambda");

    // Equilibrium: three force rows and three moment rows per included block.
    for (let block = 0; block < structure.blockCount; block++) {
      if (includedBlocks[block] !== 1) {
        continue;
      }
      const position = structure.positionOf(block);
      const centre = new Vec3(
        (position.x + 0.5) * voxelSize,
        (position.y + 0.5) * voxelSize,
        (position.z + 0.5) * voxelSize
      );
      const forceRows: number[] = [];
      const momentRows: number[] = [];
      for (let axis = 0; axis < 3; axis++) {
        forceRows.push(program.addEqualityRow(0, "F" + axis.toString() + "[" + block.toString() + "]"));
        momentRows.push(program.addEqualityRow(0, "M" + axis.toString() + "[" + block.toString() + "]"));
      }
      for (let axis = 0; axis < 3; axis++) {
        program.addEntry(forceRows[axis], loadFactorVariable, loads.forceComponent(block, axis));
        program.addEntry(momentRows[axis], loadFactorVariable, loads.momentComponent(block, axis));
      }

      const incident = joints.jointsOfBlock(block);
      for (let i = 0; i < incident.length; i++) {
        const jointIndex = incident[i];
        if (includedJoints[jointIndex] !== 1) {
          continue;
        }
        const joint = joints.jointAt(jointIndex);
        // +1 on the +n side, -1 on the -n side: the sign comes from geometry, not from
        // the order the graph was built in.
        const sign = joint.blockHigh === block ? 1 : -1;
        const normal = Axes.normal(joint.axis);
        const tangentU = Axes.tangentU(joint.axis);
        const tangentV = Axes.tangentV(joint.axis);
        const faceLever = joint.centre.sub(centre);

        for (let corner = 0; corner < JOINT_CORNER_COUNT; corner++) {
          const cornerPosition = joint.centre
            .add(tangentU.scale(cornerOffsetU(corner) * joint.momentLever))
            .add(tangentV.scale(cornerOffsetV(corner) * joint.momentLever));
          const cornerMoment = cornerPosition.sub(centre).cross(normal);
          const push = StructuralModel.jointVariable(jointIndex, cornerPushComponent(corner));
          const pull = StructuralModel.jointVariable(jointIndex, cornerPullComponent(corner));
          for (let axis = 0; axis < 3; axis++) {
            const forceTerm = sign * normal.component(axis);
            const momentTerm = sign * cornerMoment.component(axis);
            program.addEntry(forceRows[axis], push, forceTerm);
            program.addEntry(forceRows[axis], pull, -forceTerm);
            program.addEntry(momentRows[axis], push, momentTerm);
            program.addEntry(momentRows[axis], pull, -momentTerm);
          }
        }

        const leverCrossU = faceLever.cross(tangentU);
        const leverCrossV = faceLever.cross(tangentV);
        StructuralModel.addSplitPair(
          program,
          forceRows,
          momentRows,
          StructuralModel.jointVariable(jointIndex, JointComponent.ShearUForward),
          StructuralModel.jointVariable(jointIndex, JointComponent.ShearUBackward),
          tangentU,
          leverCrossU,
          sign
        );
        StructuralModel.addSplitPair(
          program,
          forceRows,
          momentRows,
          StructuralModel.jointVariable(jointIndex, JointComponent.ShearVForward),
          StructuralModel.jointVariable(jointIndex, JointComponent.ShearVBackward),
          tangentV,
          leverCrossV,
          sign
        );
        // Torsion is a pure couple: no force contribution, moment along the normal.
        StructuralModel.addSplitPair(
          program,
          forceRows,
          momentRows,
          StructuralModel.jointVariable(jointIndex, JointComponent.TorsionForward),
          StructuralModel.jointVariable(jointIndex, JointComponent.TorsionBackward),
          Vec3.zero(),
          normal,
          sign
        );
      }
    }

    return new StructuralModel(program, loadFactorVariable, jointCount, includedJoints);
  }

  /**
   * One non-negative half of a joint unknown, priced by the share of capacity it uses so
   * that the tie-break is scale-free across materials and joint sizes.
   */
  private static addHalf(program: LinearProgram, capacity: number, name: string): number {
    return program.addVariable(0, capacity, 0, name);
  }

  /** Adds a forward/backward variable pair contributing `direction` force and `moment`. */
  private static addSplitPair(
    program: LinearProgram,
    forceRows: readonly number[],
    momentRows: readonly number[],
    forward: number,
    backward: number,
    direction: Vec3,
    moment: Vec3,
    sign: number
  ): void {
    for (let axis = 0; axis < 3; axis++) {
      const forceTerm = sign * direction.component(axis);
      const momentTerm = sign * moment.component(axis);
      program.addEntry(forceRows[axis], forward, forceTerm);
      program.addEntry(forceRows[axis], backward, -forceTerm);
      program.addEntry(momentRows[axis], forward, momentTerm);
      program.addEntry(momentRows[axis], backward, -momentTerm);
    }
  }
}
