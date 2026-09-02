import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { Vec3 } from "../../src/core/Vec3";
import { MaterialId } from "../../src/materials/MaterialId";
import { WeaponClassId, WeaponTable } from "../../src/materials/WeaponTable";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { JointComponent } from "../../src/structure/Joint";
import { PadSurface } from "../../src/structure/SupportSurface";
import { StructuralAnalysisCache } from "../../src/structure/StructuralAnalysisCache";
import { StructuralStatus } from "../../src/structure/StructuralReport";
import { SupportAnalysis } from "../../src/structure/SupportAnalysis";
import { assertCapacitiesRespected, assertEquilibrium, Harness } from "./StructureHarness";

const harness = Harness.withDefaults();
const RECOIL = WeaponTable.defaults(9).get(WeaponClassId.Gun).recoilImpulse;

/** A base slab with a column of the given cross-section rising out of it. */
function turret(columnHalfWidth: number, baseHalfWidth: number, height: number): BlueprintBuilder {
  const builder = new BlueprintBuilder().fillBox(
    new IVec3(-baseHalfWidth, 0, -baseHalfWidth),
    new IVec3(baseHalfWidth, 0, baseHalfWidth),
    MaterialId.Wood,
    BlockKind.Structural,
    Direction.PosZ
  );
  builder.fillBox(
    new IVec3(0, 1, 0),
    new IVec3(columnHalfWidth, height, columnHalfWidth),
    MaterialId.Wood,
    BlockKind.Structural,
    Direction.PosZ
  );
  builder.place(new IVec3(0, height, 0), MaterialId.Wood, BlockKind.Station, Direction.NegX);
  return builder;
}

function analyseWithRecoil(builder: BlueprintBuilder, baseHalfWidth: number, fireRecoil: boolean, name: string) {
  const structure = harness.structureOf(builder.build(name));
  const pad = new PadSurface(0, -baseHalfWidth, baseHalfWidth, -baseHalfWidth, baseHalfWidth);
  const joints = harness.jointsOf(structure, pad);
  const loads = harness.gravityOf(structure);
  if (fireRecoil) {
    const stations = structure.aliveOfKind(BlockKind.Station);
    for (let i = 0; i < stations.length; i++) {
      // The station faces -x, so the recoil pushes the frame in +x (spec 7).
      loads.addForce(stations[i], new Vec3(RECOIL, 0, 0));
    }
  }
  const report = harness.solver.analyse(structure, joints, loads);
  return { structure, joints, loads, report };
}

describe("StructuralSolver: recoil couples the weapon to the frame (spec 7)", () => {
  it("costs margin the moment the gun fires", () => {
    const quiet = analyseWithRecoil(turret(1, 2, 4), 2, false, "quiet");
    const firing = analyseWithRecoil(turret(1, 2, 4), 2, true, "firing");
    assert.equal(quiet.report.status, StructuralStatus.Sound);
    assert.ok(
      firing.report.loadFactor < quiet.report.loadFactor,
      "firing must cost margin: " +
        firing.report.loadFactor.toString() +
        " vs " +
        quiet.report.loadFactor.toString()
    );
    assertEquilibrium(firing.structure, firing.joints, firing.report, firing.loads, 1, 1e-5);
    assertCapacitiesRespected(firing.joints, firing.report, 1e-5);
  });

  it("tips an unbraced tower over rather than crushing it", () => {
    // A one-voxel footprint under a four-voxel tower: the gun throws it over, and the
    // tipping margin is the number that says so.
    const thin = analyseWithRecoil(turret(0, 0, 4), 0, true, "thin");
    assert.ok(thin.report.tippingMargin < 1, "margin " + thin.report.tippingMargin.toString());
    assert.equal(thin.report.isTipping, true);
    assert.equal(thin.report.isStanding, false);
  });

  it("shears the column base when the frame is unbraced but the footprint is wide", () => {
    // Spread the base and the turret no longer tips -- but a one-voxel column still cannot
    // carry the bending the recoil puts into its lowest joint. That is the spec 7 claim:
    // the weapon damages its own structure, at a joint the player can be shown.
    const result = analyseWithRecoil(turret(0, 2, 4), 2, true, "unbraced-column");
    assert.ok(result.report.tippingMargin > 1, "the wide base should not tip");
    assert.equal(result.report.status, StructuralStatus.Overloaded);

    const columnBase = result.structure.indexAt(new IVec3(0, 1, 0));
    const slab = result.structure.indexAt(new IVec3(0, 0, 0));
    const baseJoint = result.joints.findJoint(slab, columnBase);
    assert.ok(baseJoint >= 0);
    let baseIsCritical = false;
    for (let i = 0; i < result.report.criticalJoints.length; i++) {
      if (result.report.criticalJoints[i] === baseJoint) {
        baseIsCritical = true;
      }
    }
    assert.equal(baseIsCritical, true, "the column's lowest joint is the mechanism");
    assert.ok(
      Math.abs(result.report.bendingAboutV(baseJoint)) > 0,
      "and it fails in bending"
    );
  });

  it("is fixed by thickening the column, not by a coefficient", () => {
    const unbraced = analyseWithRecoil(turret(0, 2, 4), 2, true, "unbraced");
    const braced = analyseWithRecoil(turret(1, 2, 4), 2, true, "braced");
    assert.equal(unbraced.report.status, StructuralStatus.Overloaded);
    assert.equal(braced.report.status, StructuralStatus.Sound);
    assert.ok(
      braced.report.loadFactor > 1,
      "a two-by-two column carries the couple: " + braced.report.loadFactor.toString()
    );
    assertEquilibrium(braced.structure, braced.joints, braced.report, braced.loads, 1, 1e-5);
  });
});

describe("StructuralSolver: damaged and disconnected structures", () => {
  it("reports floating blocks without letting them poison the rest", () => {
    const builder = new BlueprintBuilder()
      .fillBox(new IVec3(0, 0, 0), new IVec3(1, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(5, 3, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = harness.structureOf(builder.build("floater"));
    const joints = harness.jointsOf(structure, new PadSurface(0, 0, 1, 0, 0));
    const loads = harness.gravityOf(structure);
    const report = harness.solver.analyse(structure, joints, loads);

    const floater = structure.indexAt(new IVec3(5, 3, 0));
    assert.equal(report.floatingBlocks.length, 1);
    assert.equal(report.floatingBlocks[0], floater);
    // The attached part is still analysed, and reported honestly as not standing.
    assert.equal(report.status, StructuralStatus.Sound);
    assert.equal(report.isStanding, false);
    assertEquilibrium(structure, joints, report, loads, 1, 1e-6);
  });

  it("turns a severed joint into a falling arm", () => {
    const builder = new BlueprintBuilder()
      .fillBox(new IVec3(-1, 0, 0), new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = harness.structureOf(builder.build("severable"));
    const pad = new PadSurface(0, -1, 0, 0, 0);

    const before = harness.solver.analyse(
      structure,
      harness.jointsOf(structure, pad),
      harness.gravityOf(structure)
    );
    assert.equal(before.floatingBlocks.length, 0);
    assert.equal(before.status, StructuralStatus.Sound);

    const inner = structure.indexAt(new IVec3(0, 1, 0));
    const arm = structure.indexAt(new IVec3(1, 1, 0));
    const versionBefore = structure.version;
    structure.severJoint(inner, arm);
    assert.ok(structure.version > versionBefore, "severing must invalidate cached analyses");

    const after = harness.solver.analyse(
      structure,
      harness.jointsOf(structure, pad),
      harness.gravityOf(structure)
    );
    assert.equal(after.floatingBlocks.length, 1);
    assert.equal(after.floatingBlocks[0], arm);
  });

  it("scales capacity when a joint is degraded rather than severed", () => {
    const builder = new BlueprintBuilder().place(
      new IVec3(0, 0, 0),
      MaterialId.Wood,
      BlockKind.Structural,
      Direction.PosZ
    );
    const structure = harness.structureOf(builder.build("degradable"));
    const pad = new PadSurface(0, 0, 0, 0, 0);
    const intact = harness.solver.analyse(
      structure,
      harness.jointsOf(structure, pad),
      harness.gravityOf(structure)
    );
    structure.degradeJoint(-1, 0, 0.25);
    const degraded = harness.solver.analyse(
      structure,
      harness.jointsOf(structure, pad),
      harness.gravityOf(structure)
    );
    assert.ok(Math.abs(degraded.loadFactor - intact.loadFactor * 0.25) < 1e-6);

    // Degradation compounds and never recovers on its own.
    structure.degradeJoint(-1, 0, 0.5);
    const worse = harness.solver.analyse(
      structure,
      harness.jointsOf(structure, pad),
      harness.gravityOf(structure)
    );
    assert.ok(Math.abs(worse.loadFactor - intact.loadFactor * 0.125) < 1e-6);
  });

  it("finds blocks whose joints cannot hold their own weight", () => {
    // Stone hung from stone: no tension capacity anywhere on the load path. The linear
    // program degenerates to a zero force field here, so this local check is what names
    // the casualty.
    const builder = new BlueprintBuilder()
      .fillBox(new IVec3(0, 0, 0), new IVec3(0, 2, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 2, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
    const structure = harness.structureOf(builder.build("hanging-stone"));
    const joints = harness.jointsOf(structure, new PadSurface(0, 0, 0, 0, 0));
    const report = harness.solver.analyse(structure, joints, harness.gravityOf(structure));
    assert.equal(report.status, StructuralStatus.Unsupportable);
    assert.equal(report.criticalJoints.length, 0, "the degenerate case has no force to point at");

    // ...which is exactly when the local check earns its keep.
    const doomed = SupportAnalysis.locallyUnsupportable(
      structure,
      joints,
      harness.materials,
      harness.dials.gravity,
      harness.dials.voxelSize,
      1e-9
    );
    assert.equal(doomed.length, 0, "a stone corbel is held by shear, so the local check passes");

    // Whereas a stone block with nothing but a zero-tension joint above it is caught.
    const hanging = new BlueprintBuilder()
      .fillBox(new IVec3(0, 0, 0), new IVec3(0, 2, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 2, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 1, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
    const hangingStructure = harness.structureOf(hanging.build("hanging"));
    const hangingJoints = harness.jointsOf(hangingStructure, new PadSurface(0, 0, 0, 0, 0));
    hangingStructure.severJoint(
      hangingStructure.indexAt(new IVec3(0, 1, 0)),
      hangingStructure.indexAt(new IVec3(1, 1, 0))
    );
    const severedJoints = harness.jointsOf(hangingStructure, new PadSurface(0, 0, 0, 0, 0));
    const caught = SupportAnalysis.locallyUnsupportable(
      hangingStructure,
      severedJoints,
      harness.materials,
      harness.dials.gravity,
      harness.dials.voxelSize,
      1e-9
    );
    assert.ok(caught.length > 0, "a stone block hanging from stone cannot hold itself");
    assert.equal(hangingJoints.jointCount > severedJoints.jointCount, true);
  });
});

describe("StructuralSolver: statically indeterminate structures", () => {
  it("solves a solid block of voxels and keeps every block in equilibrium", () => {
    // Far more unknowns than equations, which is the case a support-propagation heuristic
    // gets to hand-wave and a limit-analysis program has to actually resolve.
    const builder = new BlueprintBuilder().fillBox(
      new IVec3(0, 0, 0),
      new IVec3(2, 2, 2),
      MaterialId.Wood,
      BlockKind.Structural,
      Direction.PosZ
    );
    const structure = harness.structureOf(builder.build("cube"));
    const joints = harness.jointsOf(structure, new PadSurface(0, 0, 2, 0, 2));
    const loads = harness.gravityOf(structure);
    const report = harness.solver.analyse(structure, joints, loads);

    assert.equal(report.status, StructuralStatus.Sound);
    assert.equal(structure.blockCount, 27);
    assert.equal(joints.supportCount(), 9);
    assertEquilibrium(structure, joints, report, loads, 1, 1e-5);
    assertCapacitiesRespected(joints, report, 1e-5);
    // Nine supports sharing 27 voxels: three voxels of weight each against 160 of capacity.
    assert.ok(Math.abs(report.loadFactor - 160 / 15) < 1e-5, report.loadFactor.toString());
  });

  it("is bit-identical across repeated analyses of the same structure", () => {
    const builder = turret(1, 2, 4);
    const first = analyseWithRecoil(builder, 2, true, "determinism-a");
    const second = analyseWithRecoil(builder, 2, true, "determinism-b");
    assert.equal(first.report.loadFactor, second.report.loadFactor);
    assert.equal(first.report.simplexIterations, second.report.simplexIterations);
    assert.equal(first.joints.jointCount, second.joints.jointCount);
    for (let j = 0; j < first.joints.jointCount; j++) {
      assert.equal(first.report.capacityShare(j), second.report.capacityShare(j), "joint " + j.toString());
    }
  });

  it("keeps joint indices stable when a later block is destroyed", () => {
    // Replay events name joints, so the numbering has to be a function of the structure
    // and not of the order damage arrived in.
    const builder = new BlueprintBuilder().fillBox(
      new IVec3(0, 0, 0),
      new IVec3(3, 0, 0),
      MaterialId.Wood,
      BlockKind.Structural,
      Direction.PosZ
    );
    const structure = harness.structureOf(builder.build("row"));
    const pad = new PadSurface(0, 0, 3, 0, 0);
    const before = harness.jointsOf(structure, pad);
    const firstJoint = before.jointAt(0);
    structure.destroy(3);
    const after = harness.jointsOf(structure, pad);
    assert.equal(after.jointAt(0).blockLow, firstJoint.blockLow);
    assert.equal(after.jointAt(0).blockHigh, firstJoint.blockHigh);
    assert.equal(after.jointCount, before.jointCount - 2, "one joint and one support go away");
  });
});

describe("StructuralAnalysisCache", () => {
  it("serves a repeat query and drops it when the structure changes", () => {
    const structure = harness.structureOf(turret(1, 2, 4).build("cached"));
    const pad = new PadSurface(0, -2, 2, -2, 2);
    const cache = new StructuralAnalysisCache();
    assert.equal(cache.lookup(structure, 0), null);
    const report = harness.solver.analyse(structure, harness.jointsOf(structure, pad), harness.gravityOf(structure));
    cache.store(structure, 0, report);
    assert.equal(cache.lookup(structure, 0), report);
    assert.equal(cache.hits, 1);
    // A different loading case is a different question.
    assert.equal(cache.lookup(structure, 1), null);
    // And so is a damaged structure.
    structure.destroy(structure.indexAt(new IVec3(0, 4, 0)));
    assert.equal(cache.lookup(structure, 0), null);
    assert.equal(cache.misses, 3);
    cache.invalidate();
    assert.equal(cache.lookup(structure, 0), null);
  });
});
