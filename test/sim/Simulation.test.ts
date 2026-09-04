import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { Dials } from "../../src/config/Dials";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { WeaponClassId, WeaponTable } from "../../src/materials/WeaponTable";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { BlockStructure } from "../../src/structure/BlockStructure";
import { Arena } from "../../src/sim/Arena";
import { AttackerKindId, AttackerTable } from "../../src/sim/AttackerKind";
import { AttackerUnit } from "../../src/sim/AttackerUnit";
import { CombatLoadCase } from "../../src/sim/CombatLoadCase";
import { InputScript } from "../../src/sim/InputScript";
import { InputKind, ReplayInput } from "../../src/sim/ReplayRecorder";
import { RunEventKind } from "../../src/sim/RunEvent";
import { RunOutcome, runOutcomeName } from "../../src/sim/RunResult";
import { RunSimulation } from "../../src/sim/RunSimulation";
import { ScriptedAttacker } from "../../src/sim/ScriptedAttacker";
import { TargetingSystem } from "../../src/sim/TargetingSystem";
import { SpawnOrder, Wave, WaveScript } from "../../src/sim/WaveScript";

const dials = Dials.defaults();
const arena = Arena.p0();
const materials = MaterialTable.defaults();
const weapons = WeaponTable.defaults(dials.stationRackCapacity);
const attackerTable = AttackerTable.defaults();

/** A single short wave, so most tests do not pay for a full five-wave run. */
function shortScript(): WaveScript {
  return new WaveScript([
    new Wave(0, "test wave", 40, [
      new SpawnOrder(0, AttackerKindId.LightKinetic, arena.laneCentreX),
      new SpawnOrder(4, AttackerKindId.LightKinetic, arena.laneCentreX),
    ]),
  ]);
}

describe("Arena", () => {
  it("places the lane in front of the pad", () => {
    assert.equal(arena.frontZ, 0);
    assert.equal(arena.spawnZ, -40);
    assert.equal(arena.laneCentreX, 2);
    assert.equal(arena.laneY, 1);
    assert.equal(arena.clampLaneX(-5), 0);
    assert.equal(arena.clampLaneX(9), 4);
    assert.ok(arena.cellAt(2, -3.4).equals(new IVec3(2, 1, -3)));
  });
});

describe("WaveScript", () => {
  const script = WaveScript.p0(arena.laneCentreX);

  it("has the five waves spec 4.5 lists, in order", () => {
    assert.equal(script.waveCount, 5);
    assert.equal(script.waveAt(0).title, "light kinetic, single approach");
    assert.equal(script.waveAt(4).title, "mixed, sustained");
  });

  it("wave 1 uses one lane and wave 2 uses two", () => {
    const first = script.waveAt(0);
    const lanesInFirst = new Set<number>();
    for (let i = 0; i < first.spawnCount; i++) {
      lanesInFirst.add(first.spawnAt(i).laneX);
    }
    assert.equal(lanesInFirst.size, 1, "teaches arcs");

    const second = script.waveAt(1);
    const lanesInSecond = new Set<number>();
    for (let i = 0; i < second.spawnCount; i++) {
      lanesInSecond.add(second.spawnAt(i).laneX);
    }
    assert.equal(lanesInSecond.size, 2, "teaches coverage");
  });

  it("wave 3 is all incendiary and wave 4 is all heavy on one face", () => {
    const third = script.waveAt(2);
    for (let i = 0; i < third.spawnCount; i++) {
      assert.equal(third.spawnAt(i).kind, AttackerKindId.Incendiary);
    }
    const fourth = script.waveAt(3);
    const lanes = new Set<number>();
    for (let i = 0; i < fourth.spawnCount; i++) {
      assert.equal(fourth.spawnAt(i).kind, AttackerKindId.HeavyKinetic);
      lanes.add(fourth.spawnAt(i).laneX);
    }
    assert.equal(lanes.size, 1, "concentrated on one face");
  });

  it("wave 5 mixes every kind", () => {
    const fifth = script.waveAt(4);
    const kinds = new Set<number>();
    for (let i = 0; i < fifth.spawnCount; i++) {
      kinds.add(fifth.spawnAt(i).kind as number);
    }
    assert.equal(kinds.size, 3);
  });
});

describe("ScriptedAttacker", () => {
  it("releases units at their scripted times and then reports itself exhausted", () => {
    const attacker = new ScriptedAttacker(shortScript());
    attacker.beginWave(0);
    assert.equal(attacker.update(0, 0).length, 1, "the first order is due at zero");
    assert.equal(attacker.update(0, 1).length, 0);
    assert.equal(attacker.isWaveExhausted(1), false);
    assert.equal(attacker.update(3, 1).length, 1, "the second at four seconds");
    assert.equal(attacker.isWaveExhausted(5), true);
  });

  it("is a controller behind the interface, with no state of its own between waves", () => {
    const attacker = new ScriptedAttacker(WaveScript.p0(arena.laneCentreX));
    attacker.beginWave(2);
    assert.equal((attacker.currentWave as Wave).title, "incendiary");
    attacker.beginWave(0);
    assert.equal((attacker.currentWave as Wave).title, "light kinetic, single approach");
    assert.equal(attacker.update(0, 0).length, 1, "restarted from the top");
  });
});

describe("TargetingSystem", () => {
  const structure = new BlockStructure(SampleBlueprints.standardTurret());
  const station = structure.aliveOfKind(BlockKind.Station)[0];
  const weapon = weapons.get(WeaponClassId.Gun);

  function unit(id: number, laneX: number, laneZ: number): AttackerUnit {
    return new AttackerUnit(id, AttackerKindId.LightKinetic, laneX, laneZ, 20, 3);
  }

  it("auto-fires at the nearest valid target in arc", () => {
    const targeting = new TargetingSystem();
    const far = unit(0, 2, -15);
    const near = unit(1, 2, -6);
    const picked = targeting.pickTarget(structure, arena, weapon, station, [far, near]);
    assert.notEqual(picked, null);
    assert.equal((picked as AttackerUnit).id, 1);
  });

  it("ignores targets out of range or behind the gun", () => {
    const targeting = new TargetingSystem();
    assert.equal(targeting.pickTarget(structure, arena, weapon, station, [unit(0, 2, -100)]), null);
    assert.equal(targeting.pickTarget(structure, arena, weapon, station, [unit(0, 2, 10)]), null);
    const dead = unit(0, 2, -6);
    dead.alive = false;
    assert.equal(targeting.pickTarget(structure, arena, weapon, station, [dead]), null);
  });

  it("honours a focus override and falls back when it becomes invalid", () => {
    // Spec 4.6: auto-fire with a click-to-focus override.
    const targeting = new TargetingSystem();
    const near = unit(1, 2, -6);
    const far = unit(2, 2, -14);
    targeting.setFocus(2);
    assert.equal((targeting.pickTarget(structure, arena, weapon, station, [near, far]) as AttackerUnit).id, 2);
    far.alive = false;
    assert.equal((targeting.pickTarget(structure, arena, weapon, station, [near, far]) as AttackerUnit).id, 1);
    targeting.clearFocus();
    assert.equal(targeting.focus, -1);
  });

  it("breaks ties on unit id so two stations never disagree", () => {
    const targeting = new TargetingSystem();
    const a = unit(5, 2, -6);
    const b = unit(3, 2, -6);
    assert.equal((targeting.pickTarget(structure, arena, weapon, station, [a, b]) as AttackerUnit).id, 3);
    assert.equal((targeting.pickTarget(structure, arena, weapon, station, [b, a]) as AttackerUnit).id, 3);
  });
});

describe("CombatLoadCase", () => {
  it("pushes the frame back along the barrel, and only while firing", () => {
    // Spec 7: recoil ships as a per-shot impulse at the station block.
    const structure = new BlockStructure(SampleBlueprints.standardTurret());
    const station = structure.aliveOfKind(BlockKind.Station)[0];
    assert.equal(structure.blueprint.blockAt(station).facing, Direction.NegZ);
    const loadCase = new CombatLoadCase(materials, dials, weapons.get(WeaponClassId.Gun));

    const quiet = loadCase.build(structure);
    assert.equal(quiet.forceOf(station).z, 0);

    loadCase.setFiring([station]);
    const firing = loadCase.build(structure);
    assert.equal(firing.forceOf(station).z, weapons.get(WeaponClassId.Gun).recoilImpulse);
    assert.equal(loadCase.firingCount, 1);

    // The stamp has to change, or the analysis cache would serve a no-recoil answer.
    const firingStamp = loadCase.stamp();
    loadCase.clearFiring();
    assert.notEqual(loadCase.stamp(), firingStamp);
    assert.equal(loadCase.build(structure).forceOf(station).z, 0);
  });
});

describe("RunSimulation", () => {
  it("drives a short wave and records a coherent story", () => {
    const script = shortScript();
    const simulation = RunSimulation.withDefaults(dials, arena);
    const result = simulation.run(
      SampleBlueprints.standardTurret(),
      new ScriptedAttacker(script),
      script,
      InputScript.empty(),
      1
    );
    assert.equal(result.wavesSurvived, 1);
    assert.equal(result.outcome, RunOutcome.Won, runOutcomeName(result.outcome));

    const replay = result.replay;
    assert.equal(replay.blueprintName, "standard turret");
    assert.equal(replay.seed, 1);
    assert.equal(replay.countOf(RunEventKind.WaveBegan), 1);
    assert.equal(replay.countOf(RunEventKind.WaveEnded), 1);
    assert.equal(replay.countOf(RunEventKind.AttackerSpawned), 2);
    assert.ok(replay.countOf(RunEventKind.StationFired) > 0, "the turret fought back");
    assert.ok(result.shotsFired > 0);
    assert.ok(result.structuralSolves > 0, "soundness was re-checked during the wave");

    // Timestamps never go backwards, which is what makes the transcript readable.
    const events = replay.events;
    for (let i = 1; i < events.length; i++) {
      assert.ok(
        events[i].timeSeconds >= events[i - 1].timeSeconds - 1e-9,
        "event " + i.toString() + " goes back in time"
      );
    }
    assert.equal(replay.transcript().length, events.length);
  });

  it("reproduces a run exactly, which is the whole basis of the loop", () => {
    // Spec 4.5: "the loop in 1.2 only works if a blueprint change is the only variable
    // between two attempts."
    const runOnce = (): string[] => {
      const script = shortScript();
      const simulation = RunSimulation.withDefaults(dials, arena);
      const result = simulation.run(
        SampleBlueprints.standardTurret(),
        new ScriptedAttacker(script),
        script,
        InputScript.empty(),
        7
      );
      const lines = result.replay.transcript();
      lines.push(
        "summary " +
          result.outcome.toString() +
          " " +
          result.shotsFired.toString() +
          " " +
          result.attackersDestroyed.toString() +
          " " +
          result.blocksLost.toString() +
          " " +
          result.crewLost.toString() +
          " " +
          result.finalLoadFactor.toString()
      );
      return lines;
    };
    const first = runOnce();
    const second = runOnce();
    assert.equal(first.length, second.length);
    for (let i = 0; i < first.length; i++) {
      assert.equal(first[i], second[i], "line " + i.toString());
    }
  });

  it("records the player's clicks in the replay so it can be re-driven", () => {
    const script = shortScript();
    const inputs = new InputScript([
      new ReplayInput(1, InputKind.FocusTarget, 0, -1),
      new ReplayInput(3, InputKind.ClearFocus, -1, -1),
    ]);
    const simulation = RunSimulation.withDefaults(dials, arena);
    const result = simulation.run(
      SampleBlueprints.standardTurret(),
      new ScriptedAttacker(script),
      script,
      inputs,
      3
    );
    assert.equal(result.replay.inputs.length, 2);
    assert.equal(result.replay.inputs[0].kind, InputKind.FocusTarget);
    assert.equal(result.replay.inputs[1].kind, InputKind.ClearFocus);

    // Re-driving from the recorded inputs reproduces the run.
    const rerun = RunSimulation.withDefaults(dials, arena).run(
      SampleBlueprints.standardTurret(),
      new ScriptedAttacker(shortScript()),
      shortScript(),
      new InputScript(result.replay.inputs),
      3
    );
    assert.deepEqual(rerun.replay.transcript(), result.replay.transcript());
  });

  it("names the joint that sheared when a bad design comes apart", () => {
    // The second half of spec 1.2's loop. The overreaching turret is unsound before the
    // first attacker arrives, so the replay should say so and say where.
    const script = shortScript();
    const simulation = RunSimulation.withDefaults(dials, arena);
    const result = simulation.run(
      SampleBlueprints.overreachingTurret(),
      new ScriptedAttacker(script),
      script,
      InputScript.empty(),
      1
    );
    assert.ok(result.replay.countOf(RunEventKind.JointSheared) > 0, "something should shear");
    assert.notEqual(result.replay.firstFailedJoint, null);
    assert.ok(result.blocksLost > 0, "and something should fall");

    const shears = result.replay.eventsOfKind(RunEventKind.JointSheared);
    assert.ok(shears[0].value < 1, "the load factor at failure is recorded: " + shears[0].value.toString());
    assert.ok(shears[0].timeSeconds >= 0);
  });

  it("distinguishes two blueprints under the identical script", () => {
    // The comparison a player makes between attempts.
    const script = shortScript();
    const good = RunSimulation.withDefaults(dials, arena).run(
      SampleBlueprints.standardTurret(),
      new ScriptedAttacker(script),
      script,
      InputScript.empty(),
      11
    );
    const bad = RunSimulation.withDefaults(dials, arena).run(
      SampleBlueprints.overreachingTurret(),
      new ScriptedAttacker(shortScript()),
      shortScript(),
      InputScript.empty(),
      11
    );
    assert.equal(good.replay.countOf(RunEventKind.JointSheared), 0);
    assert.ok(bad.replay.countOf(RunEventKind.JointSheared) > 0);
    assert.ok(good.blocksRemaining > bad.blocksRemaining);
  });
});

describe("RunSimulation: the full P0 run", () => {
  it("survives five waves manned, and exercises every system on the way", () => {
    const script = WaveScript.p0(arena.laneCentreX);
    const simulation = RunSimulation.withDefaults(dials, arena);
    const result = simulation.run(
      SampleBlueprints.standardTurret(),
      new ScriptedAttacker(script),
      script,
      InputScript.empty(),
      2026
    );

    // Loss-conditions spec 3.3's win condition.
    assert.equal(result.outcome, RunOutcome.Won, runOutcomeName(result.outcome));
    assert.equal(result.wavesSurvived, 5);
    assert.equal(result.won, true);

    const replay = result.replay;
    assert.equal(replay.countOf(RunEventKind.WaveBegan), 5);
    // The systems P0 is meant to test all leave a mark.
    assert.ok(replay.countOf(RunEventKind.TurretHit) > 0, "it took fire");
    assert.ok(replay.countOf(RunEventKind.BlockDestroyed) > 0, "it lost blocks");
    assert.ok(replay.countOf(RunEventKind.BlockIgnited) > 0, "wave 3 set fires");
    assert.ok(replay.countOf(RunEventKind.BlockConsumedByFire) > 0, "and they burned through");
    assert.ok(replay.countOf(RunEventKind.DepotDetonated) > 0, "a depot cooked off");
    assert.ok(replay.countOf(RunEventKind.CrewKilled) > 0, "crew were lost");
    assert.ok(replay.countOf(RunEventKind.RepairCompleted) > 0, "repair details worked");
    assert.ok(replay.countOf(RunEventKind.StationDry) > 0, "haul produced burst and lull");
    assert.ok(result.stationDrySeconds > 0);
    assert.ok(result.attackersDestroyed > 0);
    assert.ok(result.crewLost > 0 && result.crewRemaining < dials.crewPool, "the attrition arc");
  });
});
