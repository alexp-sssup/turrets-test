import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { Vec3 } from "../../src/core/Vec3";
import { MaterialId } from "../../src/materials/MaterialId";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { JointComponent } from "../../src/structure/Joint";
import { PadSurface } from "../../src/structure/SupportSurface";
import { StructuralStatus } from "../../src/structure/StructuralReport";
import { assertCapacitiesRespected, assertEquilibrium, Harness } from "./StructureHarness";

const harness = Harness.withDefaults();
const WOOD_WEIGHT = 5;

/**
 * A wall three voxels wide and four tall, with a one-voxel-thick arm reaching out of its
 * top. The wall is wide enough that neither crushing nor tipping governs, so the arm's root
 * joint is the only thing that can fail -- which makes the load factor a closed form.
 */
function cantilever(armLength: number, material: MaterialId): BlueprintBuilder {
  const builder = new BlueprintBuilder().fillBox(
    new IVec3(-2, 0, 0),
    new IVec3(0, 3, 0),
    material,
    BlockKind.Structural,
    Direction.PosZ
  );
  for (let x = 1; x <= armLength; x++) {
    builder.place(new IVec3(x, 3, 0), material, BlockKind.Structural, Direction.PosZ);
  }
  return builder;
}

function analyseCantilever(armLength: number, material: MaterialId) {
  const structure = harness.structureOf(cantilever(armLength, material).build("arm"));
  const pad = new PadSurface(0, -2, 0, 0, 0);
  const joints = harness.jointsOf(structure, pad);
  const loads = harness.gravityOf(structure);
  const report = harness.solver.analyse(structure, joints, loads);
  return { structure, joints, loads, report };
}

describe("StructuralSolver: wood bends until it does not", () => {
  it("matches the closed-form root-moment limit for every arm length", () => {
    // The root joint carries the arm's whole weight as bending. With the arm's axial force
    // pinned to zero by the free tip, its bending capacity is tensionCapacity * lever = 60.
    // The root face sits at x = 1, so the demand is sum(w * (i - 0.5)) = 2.5 * L^2 and the
    // root's own limit is 60 / (2.5 * L^2) = 24 / L^2.
    //
    // That is an upper bound at every length, and it is *the* answer from three voxels of
    // reach onwards. Below that the arm is light enough that the wall carrying it -- its
    // own joints and the moment it has to pass down -- governs instead.
    for (let armLength = 1; armLength <= 6; armLength++) {
      const result = analyseCantilever(armLength, MaterialId.Wood);
      const rootLimit = 24 / (armLength * armLength);
      assert.ok(
        result.report.loadFactor <= rootLimit + 1e-5,
        "arm " + armLength.toString() + ": " + result.report.loadFactor.toString() + " > " + rootLimit.toString()
      );
      if (armLength >= 3) {
        assert.ok(
          Math.abs(result.report.loadFactor - rootLimit) < 1e-5,
          "arm " +
            armLength.toString() +
            ": load factor " +
            result.report.loadFactor.toString() +
            " expected " +
            rootLimit.toString()
        );
      }
      assertEquilibrium(result.structure, result.joints, result.report, result.loads, 1, 1e-5);
      assertCapacitiesRespected(result.joints, result.report, 1e-5);
    }
  });

  it("holds a four-voxel arm and drops a five-voxel one", () => {
    // This is the anti-blob pressure the material numbers are tuned for: reach costs
    // bracing, and the failure arrives at a size a player can see coming.
    assert.equal(analyseCantilever(4, MaterialId.Wood).report.status, StructuralStatus.Sound);
    assert.equal(analyseCantilever(5, MaterialId.Wood).report.status, StructuralStatus.Overloaded);
  });

  it("degrades smoothly with length rather than jumping", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let armLength = 1; armLength <= 6; armLength++) {
      const factor = analyseCantilever(armLength, MaterialId.Wood).report.loadFactor;
      assert.ok(factor < previous, "arm " + armLength.toString() + " should be weaker than " + (armLength - 1).toString());
      previous = factor;
    }
  });

  it("names the root joint as the failure mechanism", () => {
    const result = analyseCantilever(5, MaterialId.Wood);
    assert.ok(result.report.criticalJoints.length > 0);
    const rootBlock = result.structure.indexAt(new IVec3(0, 3, 0));
    const armBlock = result.structure.indexAt(new IVec3(1, 3, 0));
    const rootJoint = result.joints.findJoint(rootBlock, armBlock);
    assert.ok(rootJoint >= 0);
    let rootIsCritical = false;
    for (let i = 0; i < result.report.criticalJoints.length; i++) {
      if (result.report.criticalJoints[i] === rootJoint) {
        rootIsCritical = true;
      }
    }
    assert.equal(rootIsCritical, true, "the root joint should be the one that shears");
    // And it fails in bending, not in shear or tension.
    const bending = Math.abs(result.report.bendingAboutV(rootJoint));
    const joint = result.joints.jointAt(rootJoint);
    assert.ok(Math.abs(bending - joint.tensionCapacity * joint.momentLever) < 1e-5);
  });

  it("fills the predictive highlight only as the margin thins", () => {
    // Spec 1.1: the heatmap has to let a player anticipate a collapse, so the highlight
    // must be empty while there is room and populated just before there is not.
    const comfortable = analyseCantilever(4, MaterialId.Wood).report;
    assert.ok(Math.abs(comfortable.loadFactor - 1.5) < 1e-5);
    assert.equal(comfortable.predictiveHighlight.length, 0, "a 1.5x margin needs no warning");

    // The same arm carrying one extra voxel's weight at the tip, which takes the margin
    // from 1.5 to just over 1.
    const structure = harness.structureOf(cantilever(4, MaterialId.Wood).build("loaded-arm"));
    const joints = harness.jointsOf(structure, new PadSurface(0, -2, 0, 0, 0));
    const loads = harness.gravityOf(structure);
    loads.addForce(structure.indexAt(new IVec3(4, 3, 0)), new Vec3(0, -WOOD_WEIGHT, 0));
    const marginal = harness.solver.analyse(structure, joints, loads);
    assert.ok(
      marginal.loadFactor > 1 && marginal.loadFactor < 1.1,
      "load factor " + marginal.loadFactor.toString()
    );
    assert.ok(marginal.predictiveHighlight.length > 0, "a 1.04x margin should be highlighted");
    assertEquilibrium(structure, joints, marginal, loads, 1, 1e-5);

    // The heatmap peak and the headline margin are the same number by construction, so a
    // player reading one is never contradicted by the other.
    assert.ok(Math.abs(marginal.maxUtilization() - 1 / marginal.loadFactor) < 1e-9);
    assert.ok(Math.abs(comfortable.maxUtilization() - 1 / comfortable.loadFactor) < 1e-9);
  });
});

describe("StructuralSolver: stone is compression only", () => {
  it("cannot cantilever at all, at any length", () => {
    // Stone's tension capacity is zero, so a joint's bending capacity is whatever
    // compression sits on it -- and a free-ended arm has no axial force to offer. There is
    // no admissible force field at any load scaling.
    for (let armLength = 1; armLength <= 3; armLength++) {
      const result = analyseCantilever(armLength, MaterialId.Stone);
      assert.equal(
        result.report.status,
        StructuralStatus.Unsupportable,
        "stone arm of " + armLength.toString() + " should not stand"
      );
      assert.equal(result.report.loadFactor, 0);
    }
  });

  it("carries a lintel between two walls, because that puts it in compression", () => {
    // Same span, different load path: with a wall at each end the horizontal thrust has
    // somewhere to go, so the span works as a flat arch. This is the pair that shows the
    // interaction rule is doing real work rather than just forbidding things.
    const builder = new BlueprintBuilder()
      .fillBox(new IVec3(0, 0, 0), new IVec3(0, 2, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .fillBox(new IVec3(4, 0, 0), new IVec3(4, 2, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .fillBox(new IVec3(1, 2, 0), new IVec3(3, 2, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
    const structure = harness.structureOf(builder.build("lintel"));
    const pad = new PadSurface(0, 0, 4, 0, 0);
    const joints = harness.jointsOf(structure, pad);
    const loads = harness.gravityOf(structure);
    const report = harness.solver.analyse(structure, joints, loads);

    assert.equal(report.status, StructuralStatus.Sound, "a stone lintel between walls should stand");
    assert.ok(report.loadFactor > 1, "load factor " + report.loadFactor.toString());
    assertEquilibrium(structure, joints, report, loads, 1, 1e-5);
    assertCapacitiesRespected(joints, report, 1e-5);

    // The mechanism is arch thrust: the span's joints are in compression.
    const spanLeft = structure.indexAt(new IVec3(1, 2, 0));
    const spanMiddle = structure.indexAt(new IVec3(2, 2, 0));
    const spanJoint = joints.findJoint(spanLeft, spanMiddle);
    assert.ok(spanJoint >= 0);
    assert.ok(
      report.normalForce(spanJoint) > 0,
      "the span should be in compression, got " +
        report.normalForce(spanJoint).toString()
    );
  });

  it("mixes materials at the weaker of the two capacities", () => {
    // A wood arm hung off a stone wall gets a stone-grade interface: no tension, so no
    // bending, so no arm. Mixed-material designs are allowed and this is their cost.
    const builder = new BlueprintBuilder()
      .fillBox(new IVec3(-2, 0, 0), new IVec3(0, 3, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 3, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(2, 3, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = harness.structureOf(builder.build("mixed"));
    const joints = harness.jointsOf(structure, new PadSurface(0, -2, 0, 0, 0));
    const stoneBlock = structure.indexAt(new IVec3(0, 3, 0));
    const woodBlock = structure.indexAt(new IVec3(1, 3, 0));
    const interfaceJoint = joints.findJoint(stoneBlock, woodBlock);
    assert.equal(joints.jointAt(interfaceJoint).tensionCapacity, 0, "weaker side wins");
    const report = harness.solver.analyse(structure, joints, harness.gravityOf(structure));
    // The arm can still hang off the interface in shear, so this is not a flat "nothing
    // holds" -- it is a design that does not stand, and the interface is why.
    assert.equal(report.isStanding, false);
    assert.ok(report.loadFactor < 1, "load factor " + report.loadFactor.toString());
    assert.equal(report.normalForce(interfaceJoint) < 1e-6, true, "no normal force is available");
  });

  it("stands a stone column: compression is what stone is for", () => {
    const builder = new BlueprintBuilder().fillBox(
      new IVec3(0, 0, 0),
      new IVec3(0, 5, 0),
      MaterialId.Stone,
      BlockKind.Structural,
      Direction.PosZ
    );
    const structure = harness.structureOf(builder.build("stone-column"));
    const joints = harness.jointsOf(structure, new PadSurface(0, 0, 0, 0, 0));
    const loads = harness.gravityOf(structure);
    const report = harness.solver.analyse(structure, joints, loads);
    // Six stone voxels at 15 each against a support capacity of 800.
    assert.ok(Math.abs(report.loadFactor - 800 / 90) < 1e-6, report.loadFactor.toString());
    assertEquilibrium(structure, joints, report, loads, 1, 1e-6);
  });

  it("compares the two materials on the same design", () => {
    // Same shape, different table row, different answer: this is the claim that
    // material-locked blueprints rest on (spec 4.1).
    const woodArm = analyseCantilever(3, MaterialId.Wood).report;
    const stoneArm = analyseCantilever(3, MaterialId.Stone).report;
    assert.ok(woodArm.loadFactor > 1);
    assert.equal(stoneArm.loadFactor, 0);
    assert.ok(stoneArm.totalMass > woodArm.totalMass, "stone is the heavy one");
  });
});
