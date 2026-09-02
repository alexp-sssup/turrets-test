import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { MaterialId } from "../../src/materials/MaterialId";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { PadSurface } from "../../src/structure/SupportSurface";
import { StructuralAnalysisCache } from "../../src/structure/StructuralAnalysisCache";
import { StructuralStatus } from "../../src/structure/StructuralReport";
import { assertEquilibrium, Harness } from "./StructureHarness";

const harness = Harness.withDefaults();

/** A hollow tower with a solid floor: the shape an actual turret has. */
function shell(size: number, height: number): BlueprintBuilder {
  const builder = new BlueprintBuilder();
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const onWall = x === 0 || z === 0 || x === size - 1 || z === size - 1;
        if (onWall || y === 0) {
          builder.place(new IVec3(x, y, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
        }
      }
    }
  }
  return builder;
}

/**
 * Spec 1.1 asks whether the solver is *fast enough*, so P0 has to measure it rather than
 * assume it. This is the measurement, with a bound loose enough not to be flaky on shared
 * hardware.
 *
 * Where it lands, on the machine this was developed on: a 52-block turret solves in around
 * 0.3 s, 89 blocks in about 1.2 s, 136 blocks in about 8 s. So the answer for P0 is
 * "readable yes, fast only at small scale": comfortable for editor-time analysis of a few
 * dozen blocks, too slow for live re-analysis of a turret near the 500-unit budget. Both
 * seams for that are already in place -- `StructuralAnalysisCache` (most frames change
 * nothing) and the `LinearProgram` boundary, behind which a sparse LU factorisation and a
 * warm-started dual simplex would replace the dense basis inverse.
 */
describe("StructuralSolver: cost", () => {
  it("solves a realistic turret-sized structure and reports its own size", () => {
    const structure = harness.structureOf(shell(4, 4).build("perf-shell"));
    const pad = new PadSurface(0, 0, 3, 0, 3);
    const joints = harness.jointsOf(structure, pad);
    const loads = harness.gravityOf(structure);

    const start = process.hrtime.bigint();
    const report = harness.solver.analyse(structure, joints, loads);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    assert.equal(report.status, StructuralStatus.Sound);
    assertEquilibrium(structure, joints, report, loads, 1, 1e-4);
    assert.equal(structure.blockCount, 52);
    // Rows are six per block and nothing else: that identity is the reason the model is
    // tractable at all, so it is worth pinning down.
    assert.equal(report.rowCount, 6 * structure.blockCount);
    assert.ok(report.simplexIterations > 0);
    console.log(
      "    solver cost: " +
        structure.blockCount.toString() +
        " blocks, " +
        joints.jointCount.toString() +
        " joints, " +
        report.rowCount.toString() +
        " rows, " +
        report.columnCount.toString() +
        " columns, " +
        report.simplexIterations.toString() +
        " iterations, " +
        elapsedMs.toFixed(0) +
        " ms"
    );
    assert.ok(elapsedMs < 20000, "took " + elapsedMs.toFixed(0) + " ms");
  });

  it("grows superlinearly, which is the finding rather than a defect", () => {
    // Recorded so that a future change to the linear algebra has a baseline to beat.
    const small = shell(3, 3).build("small");
    const larger = shell(4, 4).build("larger");
    const smallStructure = harness.structureOf(small);
    const largerStructure = harness.structureOf(larger);
    const smallReport = harness.solver.analyse(
      smallStructure,
      harness.jointsOf(smallStructure, new PadSurface(0, 0, 2, 0, 2)),
      harness.gravityOf(smallStructure)
    );
    const largerReport = harness.solver.analyse(
      largerStructure,
      harness.jointsOf(largerStructure, new PadSurface(0, 0, 3, 0, 3)),
      harness.gravityOf(largerStructure)
    );
    assert.ok(largerStructure.blockCount > smallStructure.blockCount);
    assert.ok(
      largerReport.simplexIterations > smallReport.simplexIterations,
      "iterations should grow with the model"
    );
  });

  it("the cache is what keeps live damage affordable", () => {
    // Spec 1.1 wants re-evaluation "under live damage". Most ticks change neither the
    // structure nor the loading, and this is the difference between paying for those and
    // not.
    const structure = harness.structureOf(shell(3, 3).build("cached-shell"));
    const pad = new PadSurface(0, 0, 2, 0, 2);
    const cache = new StructuralAnalysisCache();
    const stamp = 7;

    let report = cache.lookup(structure, stamp);
    assert.equal(report, null);
    report = harness.solver.analyse(structure, harness.jointsOf(structure, pad), harness.gravityOf(structure));
    cache.store(structure, stamp, report);

    for (let tick = 0; tick < 100; tick++) {
      assert.notEqual(cache.lookup(structure, stamp), null);
    }
    assert.equal(cache.hits, 100);
    assert.equal(cache.misses, 1);

    // One block destroyed and every cached answer is correctly thrown away.
    structure.destroy(structure.indexAt(new IVec3(0, 2, 0)));
    assert.equal(cache.lookup(structure, stamp), null);
  });
});
