import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { Arena } from "../../src/sim/Arena";
import { AttackerKindId } from "../../src/sim/AttackerKind";
import { InputScript } from "../../src/sim/InputScript";
import { RunEventKind } from "../../src/sim/RunEvent";
import { RunOutcome, runOutcomeName } from "../../src/sim/RunResult";
import { RunSimulation } from "../../src/sim/RunSimulation";
import { ScriptedAttacker } from "../../src/sim/ScriptedAttacker";
import { SpawnOrder, Wave, WaveScript } from "../../src/sim/WaveScript";

const arena = Arena.p0();
const SEED = 20260904;

/**
 * The P0 dials with a crew pool of `crew` and `waves` waves.
 *
 * A pool of zero is the cheapest way to reach loss-conditions spec 3.2's second cause --
 * "no crew are left alive to stand at the ones that remain" -- without depending on which
 * block a wave happens to shoot off. The stations are there and undamaged; nobody is at
 * them.
 */
function dialsWith(crew: number, waves: number): Dials {
  const base = Dials.defaults();
  return new Dials(
    base.materialBudget,
    crew,
    base.crewPerStation,
    base.crewPerRepairDetail,
    waves,
    base.interWaveWindowSeconds,
    base.crewCarryCapacity,
    base.stationRackCapacity,
    base.rackRefillThreshold,
    base.crewWalkSpeed,
    base.depotCapacity,
    base.tickSeconds,
    base.gravity,
    base.voxelSize,
    base.hatchCapacityFactor,
    base.predictiveThreshold,
    base.repairSecondsPerVoxel,
    base.handlingSeconds,
    base.structuralIntervalSeconds
  );
}

/** `count` short waves, light kinetic down the middle, so a run is cheap to drive. */
function script(count: number): WaveScript {
  const waves: Wave[] = [];
  for (let i = 0; i < count; i++) {
    waves.push(
      new Wave(i, "test wave", 20, [new SpawnOrder(0, AttackerKindId.LightKinetic, arena.laneCentreX)])
    );
  }
  return new WaveScript(waves);
}

function run(crew: number, waves: number) {
  const dials = dialsWith(crew, waves);
  const waveScript = script(waves);
  return RunSimulation.withDefaults(dials, arena).run(
    SampleBlueprints.standardTurret(),
    new ScriptedAttacker(waveScript),
    waveScript,
    InputScript.empty(),
    SEED
  );
}

describe("loss conditions (loss-conditions spec 3)", () => {
  // Spec 3.2: the check runs after the inter-wave window and asks whether the design can
  // fight the *next* wave. With no crew at all it cannot, and it never could.
  it("loses a run with no manned station at the end of an inter-wave window", () => {
    const result = run(0, 2);
    assert.equal(result.outcome, RunOutcome.Unmanned, runOutcomeName(result.outcome));
    // The first wave was still fought to its end, and counted: spec 3.2 makes mid-wave
    // silence a punishment rather than a defeat.
    assert.equal(result.wavesSurvived, 1);
    assert.ok(result.blocksRemaining > 0, "the turret was standing, it just could not shoot");
  });

  // Spec 3.3: there is no wave 6, so a turret that limps over the line silent has still
  // held the lane for the run it was asked to hold.
  it("does not apply the unmanned check after the last wave", () => {
    const result = run(0, 1);
    assert.equal(result.outcome, RunOutcome.Won, runOutcomeName(result.outcome));
    assert.equal(result.wavesSurvived, 1);
  });

  // Spec 4: silence is measured and its edges are recorded, and neither of those is what
  // ends the run.
  it("records the start of a silence and times it", () => {
    const result = run(0, 2);
    const replay = result.replay;
    assert.equal(replay.countOf(RunEventKind.TurretSilenced), 1, "one edge, not one per tick");
    assert.equal(replay.countOf(RunEventKind.TurretRemanned), 0);
    assert.ok(result.silencedSeconds > 0);
  });

  // The control: a manned run never enters the state at all, so the metric is measuring
  // something and not just counting ticks.
  it("reports no silence for a turret that keeps its guns manned", () => {
    const result = run(Dials.defaults().crewPool, 2);
    assert.equal(result.outcome, RunOutcome.Won, runOutcomeName(result.outcome));
    assert.equal(result.silencedSeconds, 0);
    assert.equal(result.replay.countOf(RunEventKind.TurretSilenced), 0);
  });
});
