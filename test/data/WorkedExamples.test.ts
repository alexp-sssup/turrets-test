import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { ConstantBudgetProvider } from "../../src/blueprint/BudgetProvider";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { WorkedExamples } from "../../src/data/WorkedExamples";
import { BlueprintValidator } from "../../src/editor/BlueprintValidator";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { BlockStructure } from "../../src/structure/BlockStructure";
import { WalkGraph } from "../../src/path/WalkGraph";
import { approxEqual } from "../../src/core/Numeric";

const dials = Dials.defaults();
const materials = MaterialTable.defaults();
const pad = SampleBlueprints.pad();
const budget = new ConstantBudgetProvider(dials.materialBudget);
const validator = BlueprintValidator.withDefaults(materials, dials);

/**
 * Gun-ports spec 3: "structurally, nothing." The rule moves crew and nothing else, and the
 * cheapest way to keep that true is to pin the three numbers a shipped design is judged by.
 * Exact values, not ranges: the core is deterministic and a tolerance would hide the drift
 * this suite exists to catch.
 */
const SHIPPED: readonly (readonly [string, number, number, number])[] = [
  // name, cost, load factor, violation count
  ["reaching gun", 101, 0.96, 1],
  ["stone keep", 168, 6.4, 0],
  ["wood frame", 43, 6.4, 0],
];

describe("Worked examples: what the shipped designs measure (gun-ports spec 3)", () => {
  it("keeps every design's cost, load factor and violation count", () => {
    const examples = WorkedExamples.all();
    assert.equal(examples.length, SHIPPED.length);
    for (let i = 0; i < SHIPPED.length; i++) {
      const [name, cost, loadFactor, violations] = SHIPPED[i];
      const blueprint = examples[i].blueprint;
      assert.equal(blueprint.name, name);
      const report = validator.validate(blueprint, pad, budget);
      assert.equal(report.cost, cost, name + " cost");
      // Through the helper, never `===`: the load factor comes out of a linear program
      // (CLAUDE.md, `src/core/Numeric.ts`).
      assert.ok(
        approxEqual(report.structural.loadFactor, loadFactor, 1e-6),
        name + " load factor " + report.structural.loadFactor.toString()
      );
      assert.equal(report.violations.length, violations, name + " violations");
    }
  });

  it("puts every gunner in their own station, none of them on the parapet", () => {
    const designs = WorkedExamples.all().map((example) => example.blueprint);
    designs.push(SampleBlueprints.standardTurret());
    for (let i = 0; i < designs.length; i++) {
      const blueprint = designs[i];
      const report = validator.validate(blueprint, pad, budget);
      assert.ok(report.stationReadouts.length > 0, blueprint.name + " has a station");
      for (let s = 0; s < report.stationReadouts.length; s++) {
        const readout = report.stationReadouts[s];
        assert.notEqual(readout.crewCell, null);
        assert.ok(
          (readout.crewCell as { equals: (other: typeof readout.position) => boolean }).equals(
            readout.position
          ),
          blueprint.name + " station " + s.toString() + " gunner stands in the slit"
        );
      }
    }
  });

  it("mans the reaching gun, whose station has open air under it (gun-ports spec 2.2)", () => {
    const blueprint = WorkedExamples.all()[0].blueprint;
    const structure = new BlockStructure(blueprint);
    const graph = WalkGraph.build(structure, pad);
    const stations = structure.aliveOfKind(BlockKind.Station);
    assert.equal(stations.length, 1);
    const position = structure.positionOf(stations[0]);
    assert.equal(graph.hasFloor(position), false, "the cantilever ends in air");
    assert.equal(graph.isStandable(position), true, "and the gunner stands there anyway");
  });
});
