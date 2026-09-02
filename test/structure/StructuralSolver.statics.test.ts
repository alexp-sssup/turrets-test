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
const WOOD_WEIGHT = 5; // density 0.5 * gravity 10 * unit volume
const STONE_WEIGHT = 15;
const WOOD_COMPRESSION = 160;
const STONE_COMPRESSION = 800;

function padOf(minX: number, maxX: number, minZ: number, maxZ: number): PadSurface {
  return new PadSurface(0, minX, maxX, minZ, maxZ);
}

function analyse(builder: BlueprintBuilder, pad: PadSurface, name: string) {
  const structure = harness.structureOf(builder.build(name));
  const joints = harness.jointsOf(structure, pad);
  const loads = harness.gravityOf(structure);
  const report = harness.solver.analyse(structure, joints, loads);
  return { structure, joints, loads, report };
}

function column(height: number, material: MaterialId): BlueprintBuilder {
  const builder = new BlueprintBuilder();
  for (let y = 0; y < height; y++) {
    builder.place(new IVec3(0, y, 0), material, BlockKind.Structural, Direction.PosZ);
  }
  return builder;
}

describe("StructuralSolver: statics on cases with a closed-form answer", () => {
  it("a single wood block: load factor is support capacity over weight", () => {
    const result = analyse(column(1, MaterialId.Wood), padOf(0, 0, 0, 0), "one-block");
    assert.equal(result.report.status, StructuralStatus.Sound);
    assert.equal(result.joints.jointCount, 1);
    assert.equal(result.joints.jointAt(0).isSupport, true);
    const expected = WOOD_COMPRESSION / WOOD_WEIGHT; // 32
    assert.ok(
      Math.abs(result.report.loadFactor - expected) < 1e-6,
      "load factor " + result.report.loadFactor.toString() + " expected " + expected.toString()
    );
    // The support carries the whole scaled weight in pure compression.
    assert.ok(Math.abs(result.report.normalForce(0) - WOOD_COMPRESSION) < 1e-6);
    assert.ok(Math.abs(result.report.shearMagnitude(0)) < 1e-6);
    assertEquilibrium(result.structure, result.joints, result.report, result.loads, 1, 1e-6);
    assertCapacitiesRespected(result.joints, result.report, 1e-6);
  });

  it("a single stone block: heavier and stronger, so the factor follows both", () => {
    const result = analyse(column(1, MaterialId.Stone), padOf(0, 0, 0, 0), "one-stone");
    const expected = STONE_COMPRESSION / STONE_WEIGHT;
    assert.ok(Math.abs(result.report.loadFactor - expected) < 1e-6);
    assertEquilibrium(result.structure, result.joints, result.report, result.loads, 1, 1e-6);
  });

  it("a wood column: the base support governs and scales with height", () => {
    for (let height = 1; height <= 6; height++) {
      const result = analyse(column(height, MaterialId.Wood), padOf(0, 0, 0, 0), "column");
      const expected = WOOD_COMPRESSION / (WOOD_WEIGHT * height);
      assert.ok(
        Math.abs(result.report.loadFactor - expected) < 1e-6,
        "height " + height.toString() + ": " + result.report.loadFactor.toString()
      );
      // The critical joint is the one at the bottom: the support.
      const critical = result.report.criticalJoints;
      assert.equal(critical.length >= 1, true);
      let supportIsCritical = false;
      for (let i = 0; i < critical.length; i++) {
        if (result.joints.jointAt(critical[i]).isSupport) {
          supportIsCritical = true;
        }
      }
      assert.equal(supportIsCritical, true, "height " + height.toString());
      assertEquilibrium(result.structure, result.joints, result.report, result.loads, 1, 1e-6);
      assertCapacitiesRespected(result.joints, result.report, 1e-6);
    }
  });

  it("a block is on the verge of tipping when a horizontal load equals its weight", () => {
    // Overturning is not expressible as a load factor: scale weight and recoil together
    // and the block tips at exactly the same ratio. So the solver reports it separately,
    // and the load factor covers the joint modes only (here: shear at the support).
    const structure = harness.structureOf(column(1, MaterialId.Wood).build("tipper"));
    const joints = harness.jointsOf(structure, padOf(0, 0, 0, 0));

    const balanced = harness.gravityOf(structure);
    balanced.addForce(0, new Vec3(WOOD_WEIGHT, 0, 0));
    const balancedReport = harness.solver.analyse(structure, joints, balanced);
    assert.ok(
      Math.abs(balancedReport.tippingMargin - 1) < 1e-9,
      "tipping margin " + balancedReport.tippingMargin.toString()
    );
    // Still admissible: the moment the support can carry is exactly what is asked of it.
    assert.equal(balancedReport.status, StructuralStatus.Sound);
    assert.equal(balancedReport.isStanding, true);
    assertEquilibrium(structure, joints, balancedReport, balanced, 1, 1e-6);

    const heavier = harness.gravityOf(structure);
    heavier.addForce(0, new Vec3(2 * WOOD_WEIGHT, 0, 0));
    const heavierReport = harness.solver.analyse(structure, joints, heavier);
    assert.ok(Math.abs(heavierReport.tippingMargin - 0.5) < 1e-9);
    assert.equal(heavierReport.isTipping, true);
    assert.equal(heavierReport.isStanding, false);
    // Past the limit there is no admissible force field at any load scaling at all.
    assert.equal(heavierReport.status, StructuralStatus.Unsupportable);

    const lighter = harness.gravityOf(structure);
    lighter.addForce(0, new Vec3(WOOD_WEIGHT * 0.5, 0, 0));
    const lighterReport = harness.solver.analyse(structure, joints, lighter);
    assert.ok(Math.abs(lighterReport.tippingMargin - 2) < 1e-9);
    assert.equal(lighterReport.isStanding, true);
  });

  it("a wider footprint resists the same overturning load", () => {
    // Same lateral load, but the load path can now play two supports against each other.
    const builder = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(2, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = harness.structureOf(builder.build("wide"));
    const joints = harness.jointsOf(structure, padOf(0, 2, 0, 0));
    const loads = harness.gravityOf(structure);
    loads.addForce(1, new Vec3(WOOD_WEIGHT, 0, 0));
    const report = harness.solver.analyse(structure, joints, loads);
    assert.ok(report.loadFactor > 1, "a spread base should hold: " + report.loadFactor.toString());
    // Three voxels of footprint against a load applied at the middle one: the tipping
    // margin is now comfortable where a single voxel was exactly on the limit.
    assert.ok(report.tippingMargin > 3, "tipping margin " + report.tippingMargin.toString());
    assert.equal(report.isStanding, true);
    assertEquilibrium(structure, joints, report, loads, 1, 1e-6);
  });

  it("reports mass and centre of mass", () => {
    const builder = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const result = analyse(builder, padOf(0, 1, 0, 0), "mass");
    // Stone 1.5 at x = 0.5, wood 0.5 at x = 1.5.
    assert.ok(Math.abs(result.report.totalMass - 2) < 1e-9);
    assert.ok(Math.abs(result.report.centreOfMass.x - 0.75) < 1e-9);
    assert.ok(Math.abs(result.report.centreOfMass.y - 0.5) < 1e-9);
  });

  it("treats an unloaded structure as having infinite margin rather than dividing by zero", () => {
    const structure = harness.structureOf(column(2, MaterialId.Wood).build("weightless"));
    const joints = harness.jointsOf(structure, padOf(0, 0, 0, 0));
    const report = harness.solver.analyse(structure, joints, harness.gravityOf(structure).copy());
    assert.ok(Number.isFinite(report.loadFactor));

    const noLoads = harness.gravityOf(structure);
    const zeroed = harness.solver.analyse(
      structure,
      joints,
      new (Object.getPrototypeOf(noLoads).constructor)(structure.blockCount)
    );
    assert.equal(zeroed.status, StructuralStatus.Sound);
    assert.equal(zeroed.loadFactor, Number.POSITIVE_INFINITY);
    assert.equal(zeroed.maxUtilization(), 0);
    assert.equal(zeroed.tippingMargin, Number.POSITIVE_INFINITY);
  });
});
