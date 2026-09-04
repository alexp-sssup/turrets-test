import { strict as assert } from "node:assert";
import { Axes } from "../../src/core/Direction";
import { Vec3 } from "../../src/core/Vec3";
import { Dials } from "../../src/config/Dials";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { Blueprint } from "../../src/blueprint/Blueprint";
import { BlockStructure } from "../../src/structure/BlockStructure";
import {
  cornerOffsetU,
  cornerOffsetV,
  GROUND_BLOCK,
  JOINT_CORNER_COUNT,
  JointComponent,
} from "../../src/structure/Joint";
import { JointGraph } from "../../src/structure/JointGraph";
import { LoadSet } from "../../src/structure/LoadSet";
import { PadSurface } from "../../src/structure/SupportSurface";
import { StructuralReport } from "../../src/structure/StructuralReport";
import { StructuralSolver } from "../../src/structure/StructuralSolver";

/** Everything a structural test needs, assembled once. */
export class Harness {
  public readonly materials: MaterialTable;
  public readonly dials: Dials;
  public readonly solver: StructuralSolver;

  public constructor(dials: Dials) {
    this.materials = MaterialTable.defaults();
    this.dials = dials;
    this.solver = StructuralSolver.withDefaults(this.materials, dials);
  }

  public static withDefaults(): Harness {
    return new Harness(Dials.defaults());
  }

  public structureOf(blueprint: Blueprint): BlockStructure {
    return new BlockStructure(blueprint);
  }

  public jointsOf(structure: BlockStructure, pad: PadSurface): JointGraph {
    return JointGraph.build(
      structure,
      this.materials,
      pad,
      this.dials.voxelSize,
      this.dials.hatchCapacityFactor
    );
  }

  public gravityOf(structure: BlockStructure): LoadSet {
    return LoadSet.gravity(structure, this.materials, this.dials.gravity, this.dials.voxelSize);
  }

  /** Weight of one voxel of a material, for writing expectations by hand. */
  public voxelWeight(material: number): number {
    return this.materials.voxelWeight(material, this.dials.gravity, this.dials.voxelSize);
  }
}

/**
 * Independent statics check.
 *
 * Recomputes force and moment equilibrium for every block straight from the joint forces in
 * the report, using the sign convention from docs/structural-solver.md and nothing from the
 * model builder. If `StructuralModel` assembled a row wrong -- a flipped sign, a missing
 * lever, a moment about the wrong point -- the linear program would still be solved
 * perfectly and the load factor would still look plausible, and only this check would
 * notice. It is the reason to trust the numbers the heatmap is drawn from.
 */
export function assertEquilibrium(
  structure: BlockStructure,
  joints: JointGraph,
  report: StructuralReport,
  loads: LoadSet,
  voxelSize: number,
  tolerance: number
): void {
  const loadFactor = report.loadFactor;
  for (let block = 0; block < structure.blockCount; block++) {
    if (!structure.isAlive(block)) {
      continue;
    }
    const incident = joints.jointsOfBlock(block);
    if (incident.length === 0) {
      continue;
    }
    let unsupported = false;
    for (let i = 0; i < report.floatingBlocks.length; i++) {
      if (report.floatingBlocks[i] === block) {
        unsupported = true;
      }
    }
    if (unsupported) {
      continue;
    }

    const position = structure.positionOf(block);
    const centre = new Vec3(
      (position.x + 0.5) * voxelSize,
      (position.y + 0.5) * voxelSize,
      (position.z + 0.5) * voxelSize
    );
    let force = Vec3.zero();
    let moment = Vec3.zero();
    for (let i = 0; i < incident.length; i++) {
      const jointIndex = incident[i];
      const joint = joints.jointAt(jointIndex);
      const normal = Axes.normal(joint.axis);
      const tangentU = Axes.tangentU(joint.axis);
      const tangentV = Axes.tangentV(joint.axis);
      const sign = joint.blockHigh === block ? 1 : -1;
      const lever = joint.centre.sub(centre);

      // Corner forces: each is a normal force applied at its own corner of the face, so
      // the bending moment is a consequence of geometry rather than a separate unknown.
      for (let corner = 0; corner < JOINT_CORNER_COUNT; corner++) {
        const magnitude = report.cornerForce(jointIndex, corner);
        if (magnitude === 0) {
          continue;
        }
        const cornerPosition = joint.centre
          .add(tangentU.scale(cornerOffsetU(corner) * joint.momentLever))
          .add(tangentV.scale(cornerOffsetV(corner) * joint.momentLever));
        const cornerForce = normal.scale(magnitude);
        force = force.add(cornerForce.scale(sign));
        moment = moment.add(cornerPosition.sub(centre).cross(cornerForce).scale(sign));
      }

      const shear = tangentU
        .scale(report.shearU(jointIndex))
        .add(tangentV.scale(report.shearV(jointIndex)));
      const twist = normal.scale(report.torsion(jointIndex));
      force = force.add(shear.scale(sign));
      moment = moment.add(twist.add(lever.cross(shear)).scale(sign));
    }
    const scale = Number.isFinite(loadFactor) ? loadFactor : 0;
    const appliedForce = loads.forceOf(block).scale(scale);
    const appliedMoment = loads.momentOf(block).scale(scale);
    const forceResidual = force.add(appliedForce).length();
    const momentResidual = moment.add(appliedMoment).length();
    assert.ok(
      forceResidual < tolerance,
      "block " + block.toString() + " force residual " + forceResidual.toString()
    );
    assert.ok(
      momentResidual < tolerance,
      "block " + block.toString() + " moment residual " + momentResidual.toString()
    );
  }
}

/** Asserts every joint force sits inside the joint's declared capacities. */
export function assertCapacitiesRespected(
  joints: JointGraph,
  report: StructuralReport,
  tolerance: number
): void {
  for (let j = 0; j < joints.jointCount; j++) {
    const joint = joints.jointAt(j);
    for (let corner = 0; corner < JOINT_CORNER_COUNT; corner++) {
      const value = report.cornerForce(j, corner);
      assert.ok(
        value <= joint.cornerCompressionCapacity + tolerance,
        "joint " + j.toString() + " corner " + corner.toString() + " over compression"
      );
      assert.ok(
        value >= -joint.cornerTensionCapacity - tolerance,
        "joint " + j.toString() + " corner " + corner.toString() + " over tension"
      );
    }
    assert.ok(
      report.shearMagnitude(j) <= joint.shearCapacity + tolerance,
      "joint " + j.toString() + " over shear"
    );
    assert.ok(
      Math.abs(report.torsion(j)) <= joint.torsionCapacity + tolerance,
      "joint " + j.toString() + " over torsion"
    );
    // The interaction the corner forces encode: bending is bounded by the compression
    // available to move off centre, plus whatever tension the face can take.
    const normal = report.normalForce(j);
    const bendingCapacity = (normal + joint.tensionCapacity) * joint.momentLever;
    assert.ok(
      Math.abs(report.bendingAboutU(j)) <= bendingCapacity + tolerance,
      "joint " + j.toString() + " over bending u"
    );
    assert.ok(
      Math.abs(report.bendingAboutV(j)) <= bendingCapacity + tolerance,
      "joint " + j.toString() + " over bending v"
    );
  }
}

/** Human-readable joint name, for assertion messages. */
export function describeJoint(joints: JointGraph, index: number, structure: BlockStructure): string {
  const joint = joints.jointAt(index);
  const high = structure.positionOf(joint.blockHigh).toString();
  const low = joint.blockLow === GROUND_BLOCK ? "ground" : structure.positionOf(joint.blockLow).toString();
  return low + "->" + high;
}
