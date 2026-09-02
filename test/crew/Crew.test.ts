import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { Dials } from "../../src/config/Dials";
import { AmmoLoadId, AmmoTable } from "../../src/materials/AmmoTable";
import { MaterialId } from "../../src/materials/MaterialId";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { BlockStructure } from "../../src/structure/BlockStructure";
import { AmmoStore } from "../../src/crew/AmmoStore";
import { AssignmentPlan } from "../../src/crew/AssignmentPlan";
import { CrewRole } from "../../src/crew/CrewMember";
import { CrewPool } from "../../src/crew/CrewPool";
import { LogisticsSystem, TripPhase } from "../../src/crew/LogisticsSystem";
import { RepairSystem } from "../../src/crew/RepairSystem";

const materials = MaterialTable.defaults();
const ammo = AmmoTable.defaults(materials);
const dials = Dials.defaults();

describe("AmmoStore", () => {
  it("limits by weight, not by round count", () => {
    // Spec 4.3: a nine-unit rack holds three solid shot or nine firepots.
    const rack = new AmmoStore(dials.stationRackCapacity, ammo);
    assert.equal(rack.roomFor(AmmoLoadId.SolidShot), 3);
    assert.equal(rack.roomFor(AmmoLoadId.Firepot), 9);
    assert.equal(rack.add(AmmoLoadId.SolidShot, 5), 3, "only three fit");
    assert.equal(rack.weight, 9);
    assert.equal(rack.freeWeight, 0);
    assert.equal(rack.add(AmmoLoadId.Firepot, 1), 0, "full is full");
  });

  it("mixes loads by weight", () => {
    const rack = new AmmoStore(dials.stationRackCapacity, ammo);
    rack.add(AmmoLoadId.SolidShot, 2); // 6 units
    assert.equal(rack.roomFor(AmmoLoadId.Firepot), 3);
    rack.add(AmmoLoadId.Firepot, 3);
    assert.equal(rack.weight, 9);
    assert.equal(rack.totalRounds, 5);
  });

  it("removes only what is there", () => {
    const rack = new AmmoStore(12, ammo);
    rack.add(AmmoLoadId.Firepot, 4);
    assert.equal(rack.remove(AmmoLoadId.Firepot, 10), 4);
    assert.equal(rack.isEmpty, true);
    assert.equal(rack.remove(AmmoLoadId.SolidShot, 1), 0);
  });
});

describe("CrewPool and AssignmentPlan", () => {
  it("holds exactly the spec 4.4 pool and starts idle", () => {
    const pool = new CrewPool(dials.crewPool);
    assert.equal(pool.size, 12);
    assert.equal(pool.aliveCount, 12);
    assert.equal(pool.countInRole(CrewRole.Idle), 12);
  });

  it("applies a plan lowest id first", () => {
    const pool = new CrewPool(dials.crewPool);
    const plan = new AssignmentPlan([7, 9], 2, 3);
    assert.equal(plan.crewRequired(dials), 2 + 4 + 3);
    assert.equal(pool.apply(plan, dials), true);
    assert.equal(pool.memberAt(0).role, CrewRole.Gunner);
    assert.equal(pool.memberAt(0).stationedAt, 7);
    assert.equal(pool.memberAt(1).stationedAt, 9);
    assert.equal(pool.countInRole(CrewRole.Repair), 4);
    assert.equal(pool.countInRole(CrewRole.Runner), 3);
    assert.equal(pool.countInRole(CrewRole.Idle), 3);
    assert.equal(pool.repairDetailCount(dials), 2);
  });

  it("refuses a plan that does not fit, changing nothing", () => {
    const pool = new CrewPool(4);
    const plan = new AssignmentPlan([1, 2, 3], 2, 5);
    assert.equal(plan.fitsIn(4, dials), false);
    assert.equal(pool.apply(plan, dials), false);
    assert.equal(pool.countInRole(CrewRole.Idle), 4, "nothing was assigned");
  });

  it("kills crew in a collapsing section and does not bring them back", () => {
    // Spec 4.4: this is the coupling being tested -- structural failure costs you the
    // thing that makes you dangerous.
    const pool = new CrewPool(dials.crewPool);
    pool.apply(new AssignmentPlan([5, 6], 1, 2), dials);
    const dead = pool.killAt([5]);
    assert.deepEqual(dead, [0]);
    assert.equal(pool.aliveCount, 11);
    assert.equal(pool.gunnerAt(5), null, "that gun is silent now");
    assert.notEqual(pool.gunnerAt(6), null);
    assert.deepEqual(pool.killAt([5]), [], "already gone");

    // Reassignment works from the smaller pool, and the attrition arc is visible.
    assert.equal(pool.apply(new AssignmentPlan([6], 1, 2), dials), true);
    assert.equal(pool.aliveCount, 11);
  });

  it("builds a default split that mans what it can", () => {
    const plan = AssignmentPlan.defaultFor([1, 2, 3], 12, dials);
    assert.equal(plan.stationCount, 3);
    assert.equal(plan.repairDetails, 1);
    assert.equal(plan.runners, 12 - 3 - 2);
    assert.equal(plan.crewRequired(dials), 12);

    // With a shrunken pool it mans fewer stations rather than over-committing.
    const thin = AssignmentPlan.defaultFor([1, 2, 3], 2, dials);
    assert.equal(thin.stationCount, 2);
    assert.equal(thin.crewRequired(dials), 2);
    assert.throws(() => new AssignmentPlan([], -1, 0));
  });
});

describe("RepairSystem", () => {
  const repair = new RepairSystem(materials, dials);

  function wall(): BlockStructure {
    const builder = new BlueprintBuilder();
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 2; y++) {
        builder.place(new IVec3(x, y, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
      }
    }
    return new BlockStructure(builder.build("wall"));
  }

  it("rebuilds against the blueprint from the ground up", () => {
    const structure = wall();
    const low = structure.indexAt(new IVec3(1, 0, 0));
    const high = structure.indexAt(new IVec3(1, 1, 0));
    structure.destroy(low);
    structure.destroy(high);

    const pool = new CrewPool(dials.crewPool);
    pool.apply(new AssignmentPlan([], 1, 0), dials);
    // One detail, one voxel every two seconds.
    const outcome = repair.repair(structure, pool, 2);
    assert.deepEqual(Array.from(outcome.rebuilt), [low], "the lower course first");
    assert.equal(structure.isAlive(low), true);
    assert.equal(structure.isAlive(high), false);
    assert.equal(outcome.detailCount, 1);

    repair.repair(structure, pool, 2);
    assert.equal(structure.isAlive(high), true);
  });

  it("scales with the number of details, which is what makes the split a real choice", () => {
    const oneDetail = wall();
    const twoDetails = wall();
    for (let i = 0; i < 4; i++) {
      oneDetail.destroy(i);
      twoDetails.destroy(i);
    }
    const small = new CrewPool(dials.crewPool);
    small.apply(new AssignmentPlan([], 1, 0), dials);
    const large = new CrewPool(dials.crewPool);
    large.apply(new AssignmentPlan([], 2, 0), dials);

    const slow = repair.repair(oneDetail, small, 4);
    const fast = repair.repair(twoDetails, large, 4);
    assert.equal(slow.rebuilt.length, 2);
    assert.equal(fast.rebuilt.length, 4);
  });

  it("patches damage short of destruction", () => {
    const structure = wall();
    structure.applyDamage(0, 5, materials);
    assert.equal(structure.damageOf(0), 5);
    const pool = new CrewPool(dials.crewPool);
    pool.apply(new AssignmentPlan([], 1, 0), dials);
    const outcome = repair.repair(structure, pool, 2);
    assert.deepEqual(Array.from(outcome.patched), [0]);
    assert.equal(structure.damageOf(0), 0);
  });

  it("restores the joints around a repaired block, so margin comes back", () => {
    const structure = wall();
    structure.degradeJoint(0, 1, 0.25);
    assert.equal(structure.jointFactor(0, 1), 0.25);
    structure.destroy(0);
    const pool = new CrewPool(dials.crewPool);
    pool.apply(new AssignmentPlan([], 1, 0), dials);
    repair.repair(structure, pool, 2);
    assert.equal(structure.jointFactor(0, 1), 1, "a repaired frame is not quietly weak");
  });

  it("does nothing without a detail, and reports what is outstanding", () => {
    const structure = wall();
    structure.destroy(2);
    const idle = new CrewPool(dials.crewPool);
    const outcome = repair.repair(structure, idle, 30);
    assert.equal(outcome.isEmpty, true);
    assert.equal(outcome.detailCount, 0);
    assert.deepEqual(repair.outstandingRepairs(structure), [2]);
  });

  it("will not rebuild a block into thin air", () => {
    const builder = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 2, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = new BlockStructure(builder.build("tower"));
    structure.destroy(1);
    structure.destroy(2);
    const pool = new CrewPool(dials.crewPool);
    pool.apply(new AssignmentPlan([], 1, 0), dials);
    const outcome = repair.repair(structure, pool, 2);
    assert.deepEqual(Array.from(outcome.rebuilt), [1], "only the one with an anchor");
  });
});

describe("LogisticsSystem", () => {
  function setUp() {
    const structure = new BlockStructure(SampleBlueprints.standardTurret());
    const logistics = new LogisticsSystem(ammo, dials);
    logistics.configure(structure, AmmoLoadId.SolidShot);
    const crew = new CrewPool(dials.crewPool);
    const stations = logistics.stationBlocks();
    return { structure, logistics, crew, stations };
  }

  it("fills depots and racks for free during the inter-wave window", () => {
    const { structure, logistics, stations } = setUp();
    logistics.resupplyWindow(structure);
    const supply = logistics.supplyOf(stations[0]);
    assert.notEqual(supply, null);
    // Three solid shot is a nine-unit rack full.
    assert.equal((supply as { rack: AmmoStore }).rack.countOf(AmmoLoadId.SolidShot), 3);
    const depot = logistics.depotStoreOf((supply as { nearestDepot: number }).nearestDepot);
    assert.notEqual(depot, null);
    assert.ok((depot as AmmoStore).totalRounds > 0);
  });

  it("only fires with a round in the rack and a gunner present", () => {
    const { structure, logistics, crew, stations } = setUp();
    const station = stations[0];
    crew.apply(new AssignmentPlan([station], 1, 2), dials);
    logistics.resupplyWindow(structure);
    assert.equal(logistics.canFire(structure, crew, station), true);

    // Fire the rack dry.
    assert.equal(logistics.consumeShot(station), true);
    assert.equal(logistics.consumeShot(station), true);
    assert.equal(logistics.consumeShot(station), true);
    assert.equal(logistics.consumeShot(station), false);
    assert.equal(logistics.canFire(structure, crew, station), false);
  });

  it("sends a runner so the gunner never leaves the station", () => {
    // Spec 4.3's optional role, and the reason to spend crew on it.
    const { structure, logistics, crew, stations } = setUp();
    const station = stations[0];
    crew.apply(new AssignmentPlan([station], 0, 2), dials);
    logistics.resupplyWindow(structure);
    for (let i = 0; i < 3; i++) {
      logistics.consumeShot(station);
    }

    const dispatched = logistics.update(structure, crew, 0.1);
    assert.equal(dispatched.tripsStarted, 1);
    assert.equal(logistics.activeTripCount, 1);
    const trip = logistics.tripAt(0);
    assert.equal(trip.byGunner, false, "a runner went");
    assert.equal(trip.station, station);
    assert.equal(trip.rounds, 4, "four solid shot per twelve-unit carry");
    assert.equal(logistics.canFire(structure, crew, station), false, "rack is still empty");

    // The gunner is not the one walking, so he is not marked away.
    const gunner = crew.gunnerAt(station);
    assert.notEqual(gunner, null);
    assert.equal((gunner as { awayOnTrip: boolean }).awayOnTrip, false);

    // Walk the trip out.
    let guard = 0;
    while (logistics.activeTripCount > 0 && guard < 200) {
      logistics.update(structure, crew, 0.5);
      guard++;
    }
    assert.ok(guard < 200, "the trip should finish");
    assert.equal(logistics.canFire(structure, crew, station), true, "the rack was topped up");
  });

  it("sends the gunner when there is no runner, and the gun goes quiet", () => {
    // Spec 4.3: "default: the gunner goes. No new role, and the gun is silent for the
    // round trip. This is the legible baseline penalty."
    const { structure, logistics, crew, stations } = setUp();
    const station = stations[0];
    crew.apply(new AssignmentPlan([station], 1, 0), dials);
    logistics.resupplyWindow(structure);
    for (let i = 0; i < 3; i++) {
      logistics.consumeShot(station);
    }
    logistics.update(structure, crew, 0.1);
    assert.equal(logistics.activeTripCount, 1);
    assert.equal(logistics.tripAt(0).byGunner, true);
    const gunner = crew.gunnerAt(station);
    assert.equal((gunner as { awayOnTrip: boolean }).awayOnTrip, true);

    let guard = 0;
    while (logistics.activeTripCount > 0 && guard < 200) {
      logistics.update(structure, crew, 0.5);
      guard++;
    }
    assert.equal((gunner as { awayOnTrip: boolean }).awayOnTrip, false, "he is back");
    assert.equal(logistics.canFire(structure, crew, station), true);
  });

  it("walks the trip through all four phases rather than teleporting the ammunition", () => {
    const { structure, logistics, crew, stations } = setUp();
    const station = stations[0];
    crew.apply(new AssignmentPlan([station], 0, 1), dials);
    logistics.resupplyWindow(structure);
    for (let i = 0; i < 3; i++) {
      logistics.consumeShot(station);
    }
    logistics.update(structure, crew, 0.1);
    const seen: TripPhase[] = [];
    let guard = 0;
    while (logistics.activeTripCount > 0 && guard < 400) {
      const phase = logistics.tripAt(0).phase;
      if (seen.length === 0 || seen[seen.length - 1] !== phase) {
        seen.push(phase);
      }
      logistics.update(structure, crew, 0.25);
      guard++;
    }
    assert.deepEqual(seen, [
      TripPhase.Outbound,
      TripPhase.Loading,
      TripPhase.Inbound,
      TripPhase.Unloading,
    ]);
  });

  it("marks a station starved when its route to a depot is cut", () => {
    // Spec 4.3: "if no traversable path from a station to any depot exists, the station
    // fires its rack dry and falls silent. This is a new attack vector."
    //
    // A straight corridor rather than the sample turret, because the sample turret's walls
    // give crew a roof to walk over -- which is itself the right behaviour, and exactly why
    // this has to be tested on geometry where the corridor really is the only route.
    const builder = new BlueprintBuilder();
    for (let z = 0; z <= 6; z++) {
      builder.place(new IVec3(0, 0, z), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
    }
    builder.place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    builder.place(new IVec3(0, 1, 6), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    const structure = new BlockStructure(builder.build("corridor"));
    const logistics = new LogisticsSystem(ammo, dials);
    logistics.configure(structure, AmmoLoadId.SolidShot);
    const crew = new CrewPool(dials.crewPool);
    const station = logistics.stationBlocks()[0];
    crew.apply(new AssignmentPlan([station], 0, 2), dials);
    logistics.resupplyWindow(structure);

    const supply = logistics.supplyOf(station);
    assert.notEqual(supply, null);
    assert.equal((supply as { starved: boolean }).starved, false);
    assert.equal((supply as { rack: AmmoStore }).rack.countOf(AmmoLoadId.SolidShot), 3);

    // Cut the corridor halfway along.
    structure.destroy(structure.indexAt(new IVec3(0, 0, 3)));
    const step = logistics.update(structure, crew, 0.5);
    assert.deepEqual(Array.from(step.starvedStations), [station]);
    assert.equal((supply as { starved: boolean }).starved, true);
    assert.equal(step.tripsStarted, 0, "nobody can be sent");

    // It fires the rack dry and then accumulates dry time, which is the visible symptom.
    for (let i = 0; i < 5; i++) {
      logistics.consumeShot(station);
    }
    logistics.update(structure, crew, 1);
    assert.ok((supply as { drySeconds: number }).drySeconds > 0);
  });

  it("abandons a trip whose runner dies", () => {
    const { structure, logistics, crew, stations } = setUp();
    const station = stations[0];
    // No gunner assigned, so there is no fallback carrier and the abandoned trip is
    // visible rather than immediately replaced.
    crew.apply(new AssignmentPlan([], 0, 1), dials);
    logistics.resupplyWindow(structure);
    for (let i = 0; i < 3; i++) {
      logistics.consumeShot(station);
    }
    logistics.update(structure, crew, 0.1);
    assert.equal(logistics.activeTripCount, 1);
    const runnerId = logistics.tripAt(0).crewId;
    crew.memberAt(runnerId).alive = false;
    logistics.update(structure, crew, 0.5);
    assert.equal(logistics.activeTripCount, 0, "a dead runner does not deliver");
    const supply = logistics.supplyOf(station);
    assert.equal((supply as { rack: AmmoStore }).rack.isEmpty, true);
  });

  it("produces the same haul schedule on a re-run", () => {
    const run = (): string => {
      const { structure, logistics, crew, stations } = setUp();
      crew.apply(new AssignmentPlan([stations[0]], 1, 1), dials);
      logistics.resupplyWindow(structure);
      const log: string[] = [];
      for (let tick = 0; tick < 120; tick++) {
        if (tick % 7 === 0) {
          logistics.consumeShot(stations[0]);
        }
        const step = logistics.update(structure, crew, 0.5);
        log.push(step.tripsStarted.toString() + ":" + step.roundsDelivered.toString());
      }
      return log.join(",");
    };
    assert.equal(run(), run());
  });
});
