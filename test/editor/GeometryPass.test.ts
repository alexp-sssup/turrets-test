import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { ConstantBudgetProvider } from "../../src/blueprint/BudgetProvider";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { BlueprintValidator } from "../../src/editor/BlueprintValidator";
import { ArcSample, FiringArc } from "../../src/editor/FiringArc";
import { ViolationKind } from "../../src/editor/Violation";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { WeaponClassId, WeaponTable } from "../../src/materials/WeaponTable";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlockStructure } from "../../src/structure/BlockStructure";

const dials = Dials.defaults();
const materials = MaterialTable.defaults();
const budget = new ConstantBudgetProvider(dials.materialBudget);
const pad = SampleBlueprints.pad();

/** The two violation kinds only the linear program can find. */
const STRUCTURAL_KINDS: readonly ViolationKind[] = [
  ViolationKind.StructurallyUnsound,
  ViolationKind.Tipping,
];

function isStructural(kind: ViolationKind): boolean {
  for (let i = 0; i < STRUCTURAL_KINDS.length; i++) {
    if (STRUCTURAL_KINDS[i] === kind) {
      return true;
    }
  }
  return false;
}

describe("BlueprintValidator.validateGeometry", () => {
  it("finds everything the full pass finds except what needs the solver", () => {
    const validator = BlueprintValidator.withDefaults(materials, dials);
    // A design with a blocked arc, a severed depot and a structural problem between them.
    const cases = [
      SampleBlueprints.standardTurret(),
      SampleBlueprints.buriedStationTurret(),
      SampleBlueprints.severedDepotTurret(),
      SampleBlueprints.overreachingTurret(),
    ];
    for (let c = 0; c < cases.length; c++) {
      const blueprint = cases[c];
      const full = validator.validate(blueprint, pad, budget);
      const cheap = validator.validateGeometry(blueprint, pad, budget);

      const expected: string[] = [];
      for (let i = 0; i < full.violations.length; i++) {
        if (!isStructural(full.violations[i].kind)) {
          expected.push(full.violations[i].describe());
        }
      }
      const actual: string[] = [];
      for (let i = 0; i < cheap.violations.length; i++) {
        actual.push(cheap.violations[i].describe());
      }
      assert.deepEqual(actual, expected, blueprint.name + ": same violations, same order");
      assert.equal(cheap.cost, full.cost, blueprint.name + ": same bill");
      assert.equal(
        cheap.stationReadouts.length,
        full.stationReadouts.length,
        blueprint.name + ": same station readouts"
      );
    }
  });

  it("is fast enough to run on every placed voxel, which the full pass is not", () => {
    const validator = BlueprintValidator.withDefaults(materials, dials);
    const blueprint = SampleBlueprints.standardTurret();
    // Warm up, so the comparison is not measuring the first-call cost of the simplex.
    validator.validate(blueprint, pad, budget);
    validator.validateGeometry(blueprint, pad, budget);

    const geometryStart = Date.now();
    for (let i = 0; i < 20; i++) {
      validator.validateGeometry(blueprint, pad, budget);
    }
    const geometryMs = (Date.now() - geometryStart) / 20;

    const fullStart = Date.now();
    validator.validate(blueprint, pad, budget);
    const fullMs = Date.now() - fullStart;

    assert.ok(
      geometryMs * 4 < fullMs || fullMs < 4,
      "the cheap pass has to be a different order of cost: " +
        geometryMs.toFixed(1) +
        " ms vs " +
        fullMs.toFixed(1) +
        " ms"
    );
  });

  it("locates a station readout by block, which is what the panel selects on", () => {
    const validator = BlueprintValidator.withDefaults(materials, dials);
    const blueprint = SampleBlueprints.standardTurret();
    const cheap = validator.validateGeometry(blueprint, pad, budget);
    const stations = blueprint.indicesOfKind(BlockKind.Station);
    for (let i = 0; i < stations.length; i++) {
      const readout = cheap.readoutOf(stations[i]);
      assert.notEqual(readout, null);
      assert.equal((readout as { block: number }).block, stations[i]);
    }
    assert.equal(cheap.readoutOf(9999), null);
  });
});

describe("FiringArc.samples", () => {
  it("returns the same fraction the validator prints, from one walk", () => {
    const weapon = WeaponTable.defaults(dials.stationRackCapacity).get(WeaponClassId.Gun);
    const cases = [SampleBlueprints.standardTurret(), SampleBlueprints.buriedStationTurret()];
    for (let c = 0; c < cases.length; c++) {
      const structure = new BlockStructure(cases[c]);
      const stations = structure.aliveOfKind(BlockKind.Station);
      for (let i = 0; i < stations.length; i++) {
        const facing = structure.blueprint.blockAt(stations[i]).facing;
        const samples: ArcSample[] = FiringArc.samples(
          structure,
          stations[i],
          facing,
          weapon.arcHalfAngle,
          weapon.range
        );
        assert.equal(samples.length, FiringArc.SAMPLE_COUNT);
        let clear = 0;
        for (let s = 0; s < samples.length; s++) {
          if (samples[s].clear) {
            clear++;
          }
          assert.ok(samples[s].steps >= 1, "a ray travels at least one voxel");
          if (!samples[s].clear) {
            assert.ok(samples[s].blockedBy >= 0, "a blocked ray names what stopped it");
            assert.notEqual(samples[s].blockedBy, stations[i], "a gun does not block itself");
          }
        }
        const fraction = FiringArc.clearFraction(
          structure,
          stations[i],
          facing,
          weapon.arcHalfAngle,
          weapon.range
        );
        assert.ok(Math.abs(clear / samples.length - fraction) < 1e-9);
      }
    }
  });
});
