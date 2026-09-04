import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { Dials } from "../../src/config/Dials";
import { AmmoLoadId } from "../../src/materials/AmmoTable";
import { MaterialId } from "../../src/materials/MaterialId";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { ConstantBudgetProvider } from "../../src/blueprint/BudgetProvider";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { BlueprintValidator } from "../../src/editor/BlueprintValidator";
import { Path } from "../../src/path/Path";
import { StationReadout } from "../../src/editor/StationReadout";
import { ViolationKind } from "../../src/editor/Violation";
import { StructuralStatus } from "../../src/structure/StructuralReport";

const materials = MaterialTable.defaults();
const dials = Dials.defaults();
const validator = BlueprintValidator.withDefaults(materials, dials);
const pad = SampleBlueprints.pad();
const budget = new ConstantBudgetProvider(dials.materialBudget);

describe("BlueprintValidator: the standard turret", () => {
  const report = validator.validate(SampleBlueprints.standardTurret(), pad, budget);

  it("passes every check", () => {
    assert.equal(
      report.isValid,
      true,
      "violations: " + report.violations.map((v) => v.describe()).join("; ")
    );
    assert.equal(report.structural.status, StructuralStatus.Sound);
    assert.equal(report.structural.isStanding, true);
  });

  it("reports cost against the budget", () => {
    // 25 stone at 3 plus 18 wood at 1.
    assert.equal(report.cost, 93);
    assert.equal(report.budget, 500);
    assert.equal(report.remainingBudget, 407);
  });

  it("gives every station the readout spec 4.3 makes mandatory", () => {
    assert.equal(report.stationReadouts.length, 2, "two stations cover the two approaches");
    const station: StationReadout = report.stationReadouts[0];
    assert.ok(station.position.equals(new IVec3(1, 1, 0)));

    // A clear line down the lane, and most of the arc with it.
    assert.equal(station.arcCentreClear, true);
    assert.ok(station.arcClearFraction >= 0.5, station.arcClearFraction.toString());

    // Gun-ports spec 2.4: the gunner is in the slit, so the crew cell is the station itself
    // and not the parapet cell above it that direction order used to hand them.
    assert.notEqual(station.crewCell, null);
    assert.ok((station.crewCell as IVec3).equals(station.position));
    assert.equal(station.hasEntryRoute, true);
    assert.equal(station.hasDepotRoute, true);
    assert.ok(station.nearestDepot >= 0);

    // The three numbers the editor has to show: route, round-trip time, rounds per trip.
    // This station's depot is the cell directly behind its port, so the route is real and
    // zero steps long -- a magazine behind the gun costs no walk, and pays cook-off instead
    // (gun-ports spec 3).
    assert.notEqual(station.depotPath, null);
    assert.equal((station.depotPath as Path).stepCount, 0);
    assert.equal(station.roundTripSeconds, 2);
    assert.equal(report.stationReadouts[1].roundTripSeconds, 4);
    assert.equal(station.roundsPerTrip(AmmoLoadId.SolidShot), 4);
    assert.equal(station.roundsPerTrip(AmmoLoadId.Firepot), 12);
  });

  it("derives the round trip from the real path, not from a coefficient", () => {
    const station = report.stationReadouts[0];
    const path = station.depotPath;
    assert.notEqual(path, null);
    const expected =
      (path as { roundTripDuration: (speed: number) => number }).roundTripDuration(dials.crewWalkSpeed) +
      2 * dials.handlingSeconds;
    assert.ok(Math.abs(station.roundTripSeconds - expected) < 1e-9);
  });
});

describe("BlueprintValidator: designs that should not pass", () => {
  it("flags a station with no arc, which is what makes a blob lose on its own", () => {
    const report = validator.validate(SampleBlueprints.buriedStationTurret(), pad, budget);
    assert.equal(report.isValid, false);
    assert.equal(report.has(ViolationKind.StationArcBlocked), true);
    assert.equal(report.countOf(ViolationKind.StationArcBlocked), 1, "only the buried one");
    assert.equal(report.stationReadouts.length, 3);
  });

  it("flags a station with no route to a depot", () => {
    const report = validator.validate(SampleBlueprints.severedDepotTurret(), pad, budget);
    assert.equal(report.has(ViolationKind.StationNoDepotPath), true);
    let silent = 0;
    for (let i = 0; i < report.stationReadouts.length; i++) {
      if (!report.stationReadouts[i].hasDepotRoute) {
        silent++;
        assert.equal(report.stationReadouts[i].roundTripSeconds, Number.POSITIVE_INFINITY);
      }
    }
    assert.equal(silent, 1);
  });

  it("flags a design that comes apart under its own weight", () => {
    const report = validator.validate(SampleBlueprints.overreachingTurret(), pad, budget);
    assert.equal(report.isValid, false);
    assert.equal(report.has(ViolationKind.StructurallyUnsound), true);
    assert.ok(report.structural.loadFactor < 1);
    // And it says where: the heatmap is populated before wave 1, not after it.
    assert.ok(report.structural.criticalJoints.length > 0);
  });

  it("flags missing required blocks", () => {
    const bare = new BlueprintBuilder()
      .fillBox(new IVec3(0, 0, 0), new IVec3(1, 0, 1), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .build("bare");
    const report = validator.validate(bare, pad, budget);
    assert.equal(report.has(ViolationKind.NoStation), true);
    assert.equal(report.has(ViolationKind.NoDepot), true);
    // Crew-access spec 2.4: there is no "no hatch" rule to break any more.
    assert.equal(report.stationReadouts.length, 0);
  });

  /**
   * Crew-access spec 2.4: `NoHatch` is deleted, and nothing replaces it, because nothing
   * needs to. A station upstairs with no ladder simply cannot reach a way in, and 2.3
   * reports that -- so the rule that used to be declared now falls out of the geometry.
   */
  it("reports a station stranded upstairs, and a hatch is what fixes it", () => {
    function twoStorey(withHatch: boolean) {
      const builder = new BlueprintBuilder();
      builder.fillBox(new IVec3(0, 0, 0), new IVec3(2, 0, 2), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
      // Ground floor: a ring with a doorway at (1, 1, 0), and a room behind it.
      for (let x = 0; x <= 2; x++) {
        for (let z = 0; z <= 2; z++) {
          const room = x === 1 && z === 1;
          const doorway = x === 1 && z === 0;
          if (!room && !doorway) {
            builder.place(new IVec3(x, 1, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
          }
          // The deck over it, with or without a hatch through the middle.
          const hatch = withHatch && room;
          builder.place(
            new IVec3(x, 2, z),
            MaterialId.Wood,
            hatch ? BlockKind.Hatch : BlockKind.Structural,
            Direction.PosZ
          );
        }
      }
      builder.place(new IVec3(1, 3, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
      builder.place(new IVec3(1, 1, 2), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
      return validator.validate(builder.build(withHatch ? "laddered" : "stranded"), pad, budget);
    }

    assert.equal(
      twoStorey(false).has(ViolationKind.StationNoEntryPath),
      true,
      "no ladder down to the ground floor"
    );
    assert.equal(
      twoStorey(true).has(ViolationKind.StationNoEntryPath),
      false,
      "a hatch through the deck is the whole fix"
    );
  });

  // Loss-conditions spec 2: neither "no core block" nor "more than one core block" is a
  // rule any more, and a second station is redundancy rather than a violation.
  it("does not object to a second station", () => {
    const builder = BlueprintBuilder.fromBlueprint(SampleBlueprints.standardTurret());
    builder.place(new IVec3(2, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    const report = validator.validate(builder.build("three stations"), pad, budget);
    assert.equal(report.isValid, true, report.violations.map((v) => v.describe()).join("; "));
  });

  it("flags going over budget, using the provider rather than a constant", () => {
    const tight = new ConstantBudgetProvider(50);
    const report = validator.validate(SampleBlueprints.standardTurret(), pad, tight);
    assert.equal(report.has(ViolationKind.OverBudget), true);
    assert.equal(report.remainingBudget, -43);
    // The same design is fine against the real budget, so nothing else changed.
    assert.equal(validator.validate(SampleBlueprints.standardTurret(), pad, budget).isValid, true);
  });

  it("flags blocks with no path to the pad", () => {
    const builder = BlueprintBuilder.fromBlueprint(SampleBlueprints.standardTurret());
    builder.place(new IVec3(2, 6, 2), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const report = validator.validate(builder.build("floating bit"), pad, budget);
    assert.equal(report.has(ViolationKind.DisconnectedBlocks), true);
  });

  it("flags a turret standing off its pad", () => {
    // The pad is the arena's, not the blueprint's: a design that hangs off it has nothing
    // holding it up.
    const offPad = new BlueprintBuilder()
      .fillBox(new IVec3(20, 0, 20), new IVec3(21, 0, 21), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(20, 1, 20), MaterialId.Wood, BlockKind.Hatch, Direction.PosZ)
      .build("off pad");
    const report = validator.validate(offPad, pad, budget);
    assert.equal(report.has(ViolationKind.DisconnectedBlocks), true);
  });
});

describe("FiringArc: direction test used at runtime", () => {
  it("accepts targets inside the arc and rejects those behind", () => {
    const { FiringArc } = require("../../src/editor/FiringArc") as typeof import("../../src/editor/FiringArc");
    const halfAngle = Math.PI / 3;
    assert.equal(FiringArc.containsDirection(Direction.NegZ, halfAngle, 0, -10), true);
    assert.equal(FiringArc.containsDirection(Direction.NegZ, halfAngle, 5, -10), true);
    assert.equal(FiringArc.containsDirection(Direction.NegZ, halfAngle, 10, -1), false);
    assert.equal(FiringArc.containsDirection(Direction.NegZ, halfAngle, 0, 10), false);
    assert.equal(FiringArc.containsDirection(Direction.NegZ, halfAngle, 0, 0), false);
  });
});
