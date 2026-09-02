import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { Dials } from "../../src/config/Dials";
import { AmmoTable } from "../../src/materials/AmmoTable";
import { MaterialId } from "../../src/materials/MaterialId";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { ConstantBudgetProvider } from "../../src/blueprint/BudgetProvider";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { BlueprintValidator } from "../../src/editor/BlueprintValidator";
import { BlueprintLibrary } from "../../src/persistence/BlueprintLibrary";
import { BlockStructure } from "../../src/structure/BlockStructure";
import { GravityLoadCase } from "../../src/structure/LoadCase";
import { StructuralSolver } from "../../src/structure/StructuralSolver";
import { FileBlueprintStore } from "../../src/app/FileBlueprintStore";
import { HeatmapView } from "../../src/app/HeatmapView";
import { ReportView } from "../../src/app/ReportView";

const materials = MaterialTable.defaults();
const ammo = AmmoTable.defaults(materials);
const dials = Dials.defaults();

describe("HeatmapView", () => {
  it("draws one character per block, per level, with the lane at the top", () => {
    const builder = new BlueprintBuilder()
      .fillBox(new IVec3(0, 0, 0), new IVec3(2, 0, 1), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    const structure = new BlockStructure(builder.build("tiny"));
    const kinds = HeatmapView.renderKinds(structure);
    // y=1 first (highest), then y=0.
    assert.equal(kinds[0], "  y=1");
    assert.equal(kinds[1], "     S ");
    assert.equal(kinds[2], "       ");
    assert.equal(kinds[3], "  y=0");
    assert.equal(kinds[4], "    ###");
    assert.equal(kinds[5], "    ###");
  });

  it("maps utilization onto a ramp that tops out at failure", () => {
    const solver = StructuralSolver.withDefaults(materials, dials);
    const pad = SampleBlueprints.pad();
    const loadCase = new GravityLoadCase(materials, dials);

    const sound = new BlockStructure(SampleBlueprints.standardTurret());
    const soundReport = solver.analyse(
      sound,
      solver.buildJointGraph(sound, pad),
      loadCase.build(sound)
    );
    const soundLines = HeatmapView.renderUtilization(sound, soundReport).join("");
    assert.equal(soundLines.indexOf("!"), -1, "a comfortable design shows no failures");

    const bad = new BlockStructure(SampleBlueprints.overreachingTurret());
    const badReport = solver.analyse(bad, solver.buildJointGraph(bad, pad), loadCase.build(bad));
    assert.ok(badReport.loadFactor < 1);
    const badLines = HeatmapView.renderUtilization(bad, badReport).join("");
    assert.ok(badLines.indexOf("!") >= 0, "an overloaded design shows where");
    assert.ok(HeatmapView.utilizationLegend().length > 0);
  });
});

describe("ReportView", () => {
  it("summarises a blueprint and its validation without throwing", () => {
    const validator = BlueprintValidator.withDefaults(materials, dials);
    const budget = new ConstantBudgetProvider(dials.materialBudget);
    const design = SampleBlueprints.standardTurret();
    const summary = ReportView.blueprintSummary(design, materials, dials.materialBudget);
    assert.ok(summary.length === 3);
    assert.ok(summary[2].indexOf("93 of 500") >= 0);

    const report = validator.validate(design, SampleBlueprints.pad(), budget);
    const lines = ReportView.validation(report, ammo);
    let sawStation = false;
    let sawViolationsNone = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("rounds/trip") >= 0) {
        sawStation = true;
      }
      if (lines[i].indexOf("violations none") >= 0) {
        sawViolationsNone = true;
      }
    }
    assert.equal(sawStation, true, "the haul readout must be shown");
    assert.equal(sawViolationsNone, true);
  });

  it("reports a design with no depot route in a way a player can act on", () => {
    const validator = BlueprintValidator.withDefaults(materials, dials);
    const report = validator.validate(
      SampleBlueprints.severedDepotTurret(),
      SampleBlueprints.pad(),
      new ConstantBudgetProvider(dials.materialBudget)
    );
    const text = ReportView.validation(report, ammo).join("\n");
    assert.ok(text.indexOf("NO DEPOT ROUTE") >= 0);
    assert.ok(text.indexOf("fire its rack dry") >= 0);
  });
});

describe("FileBlueprintStore", () => {
  it("writes and reads a library through the filesystem", () => {
    const directory = mkdtempSync(join(tmpdir(), "turrets-test-"));
    try {
      const path = join(directory, "library.txt");
      const store = new FileBlueprintStore(path);
      assert.equal(store.read().size, 0, "a missing file is an empty library");

      const library = new BlueprintLibrary();
      library.save(SampleBlueprints.standardTurret());
      library.save(SampleBlueprints.overreachingTurret());
      store.write(library);

      const reloaded = store.read();
      assert.deepEqual(reloaded.names(), library.names());
      assert.equal(reloaded.encode(), library.encode());
      assert.equal(store.location, path);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
