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
import { LiveInputQueue } from "../../src/sim/InputSource";
import { RunLoop } from "../../src/sim/RunLoop";
import { RunSimulation } from "../../src/sim/RunSimulation";
import { ScriptedAttacker } from "../../src/sim/ScriptedAttacker";
import { WaveScript } from "../../src/sim/WaveScript";
import { CrewRole } from "../../src/crew/CrewMember";
import { Blueprint } from "../../src/blueprint/Blueprint";
import { WorkedExamples } from "../../src/data/WorkedExamples";
import { BlockStructure } from "../../src/structure/BlockStructure";

const dials = Dials.defaults();
const materials = MaterialTable.defaults();
const arena = Arena.p0();
const budget = new ConstantBudgetProvider(dials.materialBudget);

function designFor(blueprint: ReturnType<typeof SampleBlueprints.standardTurret>): FieldDesign {
  return FieldDesign.withDefaults(blueprint, arena.pad, arena, dials);
}

/** A run at tick zero: the crew are assigned and nothing has moved yet. */
function readyRun(blueprint: Blueprint): RunLoop {
  const script = WaveScript.p0(arena.laneCentreX);
  return RunSimulation.withDefaults(dials, arena).begin(
    blueprint,
    new ScriptedAttacker(script),
    script,
    new LiveInputQueue(),
    20260905
  );
}

/** Every design the build ships: the four fixtures and the three worked examples. */
function shippedDesigns(): Blueprint[] {
  const designs: Blueprint[] = [
    SampleBlueprints.standardTurret(),
    SampleBlueprints.buriedStationTurret(),
    SampleBlueprints.severedDepotTurret(),
    SampleBlueprints.overreachingTurret(),
  ];
  const examples = WorkedExamples.all();
  for (let i = 0; i < examples.length; i++) {
    designs.push(examples[i].blueprint);
  }
  return designs;
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

  it("draws no crew member inside a block except a gunner in their own station (crew-visible spec 3)", () => {
    // Before this rule every one of the twelve was inside a live block on every shipped
    // design, and the eleven with no post shared two to four cells between them.
    const designs = shippedDesigns();
    for (let d = 0; d < designs.length; d++) {
      const blueprint = designs[d];
      const loop = readyRun(blueprint);
      const frame = new FrameBuilder(designFor(blueprint)).fromRun(loop);
      assert.equal(frame.crew.length, dials.crewPool, blueprint.name + " flies the whole pool");
      const seen = new Set<string>();
      for (let i = 0; i < frame.crew.length; i++) {
        const member = frame.crew[i];
        const cell = new IVec3(Math.round(member.x), Math.round(member.y), Math.round(member.z));
        const key = cell.x.toString() + "," + cell.y.toString() + "," + cell.z.toString();
        assert.equal(seen.has(key), false, blueprint.name + ": one crew member to a cell");
        seen.add(key);
        const block = blueprint.indexAt(cell);
        if (block < 0 || !loop.structure.isAlive(block)) {
          continue;
        }
        // The one cell a crew member may share with a block: station-terminus spec 2.2 puts
        // the gunner in the slit and crew-visible spec 3.4 keeps them there.
        assert.equal(member.role, CrewRole.Gunner as number, blueprint.name + ": only a gunner");
        assert.equal(
          blueprint.blockAt(block).kind,
          BlockKind.Station,
          blueprint.name + ": and only in a station"
        );
      }
    }
  });

  it("musters crew with no post on the ground behind the turret (crew-visible spec 3.3)", () => {
    const blueprint = SampleBlueprints.standardTurret();
    const loop = readyRun(blueprint);
    const frame = new FrameBuilder(designFor(blueprint)).fromRun(loop);
    const bounds = blueprint.bounds;
    const backZ = bounds.min.z + bounds.size.z - 1 + 1;
    let onTheGround = 0;
    let backRow = 0;
    for (let i = 0; i < frame.crew.length; i++) {
      const member = frame.crew[i];
      if (member.role === (CrewRole.Gunner as number)) {
        continue;
      }
      assert.equal(member.y, arena.pad.level, "off duty is on the ground, not on the roof");
      onTheGround++;
      if (member.z === backZ) {
        backRow++;
      }
    }
    assert.ok(onTheGround > 0, "this design has crew to spare");
    assert.ok(backRow > 0, "and the rank starts on the side away from the lane");
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
