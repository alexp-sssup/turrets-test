import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { IVec3 } from "../../src/core/IVec3";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { ConstantBudgetProvider } from "../../src/blueprint/BudgetProvider";
import { BlueprintValidator } from "../../src/editor/BlueprintValidator";
import { GeometryReport } from "../../src/editor/GeometryReport";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { FieldDesign } from "../../src/render/FieldDesign";
import { StationStatus } from "../../src/render/FieldFrame";
import { FrameBuilder } from "../../src/render/FrameBuilder";
import { PredictAnalysis } from "../../src/render/PredictAnalysis";
import { Arena } from "../../src/sim/Arena";
import { BlockStructure } from "../../src/structure/BlockStructure";

const dials = Dials.defaults();
const materials = MaterialTable.defaults();
const arena = Arena.p0();
const budget = new ConstantBudgetProvider(dials.materialBudget);

function designFor(blueprint: ReturnType<typeof SampleBlueprints.standardTurret>): FieldDesign {
  return FieldDesign.withDefaults(blueprint, arena.pad, arena, dials);
}

describe("FrameBuilder", () => {
  it("builds an editor frame whose joint field is the report's utilization field", () => {
    const blueprint = SampleBlueprints.standardTurret();
    const validator = BlueprintValidator.withDefaults(materials, dials);
    const report = validator.validate(blueprint, arena.pad, budget);
    const geometry = new GeometryReport(
      report.violations,
      report.stationReadouts,
      report.cost,
      report.budget,
      report.structural.floatingBlocks
    );
    const frame = new FrameBuilder(designFor(blueprint)).fromDesign(
      new BlockStructure(blueprint),
      report.structural,
      geometry
    );

    assert.equal(frame.joints.count, report.structural.jointCount);
    for (let j = 0; j < frame.joints.count; j++) {
      const joint = report.structural.joints.jointAt(j);
      assert.equal(frame.joints.low[j], joint.blockLow);
      assert.equal(frame.joints.high[j], joint.blockHigh);
      assert.ok(Math.abs(frame.joints.utilization[j] - report.structural.utilization(j)) < 1e-5);
    }
    // The heatmap cannot disagree with the headline margin: its peak is 1/loadFactor.
    assert.ok(
      Math.abs(frame.maxUtilization() - 1 / report.structural.loadFactor) < 1e-4,
      "peak utilization should be 1/loadFactor"
    );
    assert.equal(frame.attackers.length, 0);
    assert.equal(frame.crew.length, 0);
  });

  it("reports a station with no route to a depot as no-path, not as dry", () => {
    const blueprint = SampleBlueprints.severedDepotTurret();
    const validator = BlueprintValidator.withDefaults(materials, dials);
    const report = validator.validate(blueprint, arena.pad, budget);
    const geometry = new GeometryReport(
      report.violations,
      report.stationReadouts,
      report.cost,
      report.budget,
      report.structural.floatingBlocks
    );
    const frame = new FrameBuilder(designFor(blueprint)).fromDesign(
      new BlockStructure(blueprint),
      report.structural,
      geometry
    );
    assert.equal(frame.stations.length, 1);
    assert.equal(frame.stations[0].status, StationStatus.NoPath);
  });

  it("derives the arc percentage from the same ray walk the overlay draws", () => {
    const blueprint = SampleBlueprints.buriedStationTurret();
    const frame = new FrameBuilder(designFor(blueprint)).fromDesign(
      new BlockStructure(blueprint),
      null,
      null
    );
    let buried = 0;
    for (let i = 0; i < frame.stations.length; i++) {
      const station = frame.stations[i];
      let clear = 0;
      for (let s = 0; s < station.arcSamples.length; s++) {
        if (station.arcSamples[s].clear) {
          clear++;
        }
      }
      assert.ok(
        Math.abs(station.arcClearFraction - clear / station.arcSamples.length) < 1e-9,
        "the number and the picture come from one walk"
      );
      if (station.arcClearFraction === 0) {
        buried++;
      }
    }
    assert.equal(buried, 1, "the station behind another station reports no arc at all");
  });
});

describe("BlockStructure.clone", () => {
  it("isolates speculation from the live structure", () => {
    const blueprint = SampleBlueprints.standardTurret();
    const live = new BlockStructure(blueprint);
    const copy = live.clone();
    copy.destroy(0);
    copy.severJoint(1, 2);
    assert.equal(live.isAlive(0), true);
    assert.equal(live.jointFactor(1, 2), 1);
    assert.equal(copy.isAlive(0), false);
    assert.equal(copy.jointFactor(1, 2), 0);
    assert.equal(live.aliveCount, blueprint.blockCount);
    assert.equal(copy.aliveCount, blueprint.blockCount - 1);
  });
});

describe("PredictAnalysis", () => {
  it("answers what follows a cell's death without touching the live structure", () => {
    // A wood arm with a gun on the end of it: killing the root takes the whole arm.
    const blueprint = SampleBlueprints.overreachingTurret();
    const structure = new BlockStructure(blueprint);
    const analysis = new PredictAnalysis(materials, dials, arena.pad);
    const armRoot = blueprint.indexAt(new IVec3(1, 3, 0));
    assert.ok(armRoot >= 0, "the fixture should have an arm root at (1,3,0)");

    const before = structure.aliveCount;
    const outcome = analysis.analyse(structure, new IVec3(1, 3, 0), armRoot);
    assert.equal(structure.aliveCount, before, "the live structure is untouched");
    assert.ok(outcome.collapses, "the rest of the arm has nothing left to hang from");
    assert.ok(outcome.lostBlocks.length >= 1);
    for (let i = 0; i < outcome.lostBlocks.length; i++) {
      assert.notEqual(outcome.lostBlocks[i], armRoot, "the killed cell is not double counted");
    }
  });

  it("returns nothing for an empty cell", () => {
    const blueprint = SampleBlueprints.standardTurret();
    const analysis = new PredictAnalysis(materials, dials, arena.pad);
    const outcome = analysis.analyse(new BlockStructure(blueprint), new IVec3(9, 9, 9), -1);
    assert.equal(outcome.collapses, false);
    assert.equal(outcome.block, -1);
  });
});

describe("FieldDesign", () => {
  it("offers the design's own cross-sections, widened to the pad", () => {
    const design = designFor(SampleBlueprints.standardTurret());
    assert.equal(design.sliceMin, 0);
    assert.equal(design.sliceMax, 4);
    assert.equal(design.clampSlice(-4), 0);
    assert.equal(design.clampSlice(9), 4);
    assert.equal(design.blocksInSlice(2).length > 0, true);
  });

  it("frames the lane out to gun range so 'out of range' and 'silent' look different", () => {
    const design = designFor(SampleBlueprints.standardTurret());
    const bounds = design.viewBounds;
    assert.ok(bounds.min.z <= arena.pad.minZ - design.gun.range, "gun range is inside the frame");
    assert.ok(bounds.min.y <= arena.pad.level, "the ground line is inside the frame");
  });

  it("keeps a station's own block out of its arc obstructions", () => {
    const blueprint = SampleBlueprints.standardTurret();
    const frame = new FrameBuilder(designFor(blueprint)).fromDesign(
      new BlockStructure(blueprint),
      null,
      null
    );
    assert.equal(frame.stations.length, blueprint.countOfKind(BlockKind.Station));
    for (let i = 0; i < frame.stations.length; i++) {
      assert.ok(frame.stations[i].arcClearFraction > 0.5, "these two guns can see the lane");
    }
  });
});
