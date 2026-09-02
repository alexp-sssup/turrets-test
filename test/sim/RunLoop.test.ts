import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { Blueprint } from "../../src/blueprint/Blueprint";
import { Arena } from "../../src/sim/Arena";
import { InputScript } from "../../src/sim/InputScript";
import { LiveInputQueue } from "../../src/sim/InputSource";
import { InputKind } from "../../src/sim/ReplayRecorder";
import { RunPhase } from "../../src/sim/RunLoop";
import { RunResult } from "../../src/sim/RunResult";
import { RunSimulation } from "../../src/sim/RunSimulation";
import { ScriptedAttacker } from "../../src/sim/ScriptedAttacker";
import { WaveScript } from "../../src/sim/WaveScript";
import { CrewRole } from "../../src/crew/CrewMember";

const SEED = 20260902;

function arena(): Arena {
  return Arena.p0();
}

function script(): WaveScript {
  return WaveScript.p0(arena().laneCentreX);
}

/**
 * A hash over everything a replay could disagree about: the ordered event log and the
 * final state of every block. UI spec 5.1 asks CI for exactly this -- "a canned attempt
 * replays to an identical final state hash headlessly" -- because the browser build steps
 * the same loop from an animation frame, and a loop that can tell how fast it is being
 * stepped is a loop whose replay is a lie.
 */
function stateHash(blueprint: Blueprint, result: RunResult): string {
  const parts: string[] = [];
  parts.push(result.outcome.toString());
  parts.push(result.wavesSurvived.toString());
  parts.push(result.elapsedSeconds.toFixed(4));
  parts.push(result.blocksRemaining.toString());
  parts.push(result.crewRemaining.toString());
  parts.push(result.shotsFired.toString());
  parts.push(result.structuralSolves.toString());
  const events = result.replay.events;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    parts.push(
      event.timeSeconds.toFixed(4) +
        ":" +
        (event.kind as number).toString() +
        ":" +
        event.subject.toString() +
        ":" +
        event.object.toString() +
        ":" +
        event.detail
    );
  }
  void blueprint;
  let hash = 0x811c9dc5;
  const text = parts.join("|");
  for (let i = 0; i < text.length; i++) {
    hash = hash ^ text.charCodeAt(i);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) | 0;
  }
  const unsigned = hash < 0 ? hash + 4294967296 : hash;
  return unsigned.toString(16);
}

describe("RunLoop", () => {
  it("gives the same run stepped one tick at a time as run in one go", () => {
    const dials = Dials.defaults();
    const blueprint = SampleBlueprints.standardTurret();

    const whole = RunSimulation.withDefaults(dials, arena()).run(
      blueprint,
      new ScriptedAttacker(script()),
      script(),
      InputScript.empty(),
      SEED
    );

    // The renderer's path: build a loop and step it from outside, as an animation frame
    // does, with no idea how many ticks a frame will get through.
    const loop = RunSimulation.withDefaults(dials, arena()).begin(
      blueprint,
      new ScriptedAttacker(script()),
      script(),
      InputScript.empty(),
      SEED
    );
    let steps = 0;
    while (loop.step()) {
      steps++;
      assert.ok(steps < 100000, "the loop has to terminate");
    }
    const stepped = loop.result();

    assert.equal(stateHash(blueprint, stepped), stateHash(blueprint, whole));
    assert.equal(stepped.replay.events.length, whole.replay.events.length);
    assert.equal(loop.phase, RunPhase.Finished);
  });

  it("replays to an identical final state hash twice over", () => {
    const dials = Dials.defaults();
    const blueprint = SampleBlueprints.overreachingTurret();
    const first = RunSimulation.withDefaults(dials, arena()).run(
      blueprint,
      new ScriptedAttacker(script()),
      script(),
      InputScript.empty(),
      SEED
    );
    const second = RunSimulation.withDefaults(dials, arena()).run(
      blueprint,
      new ScriptedAttacker(script()),
      script(),
      InputScript.empty(),
      SEED
    );
    assert.equal(stateHash(blueprint, second), stateHash(blueprint, first));
  });

  it("stamps a live command with the tick it was consumed on, so the log re-drives it", () => {
    const dials = Dials.defaults();
    const blueprint = SampleBlueprints.standardTurret();
    const queue = new LiveInputQueue();
    const loop = RunSimulation.withDefaults(dials, arena()).begin(
      blueprint,
      new ScriptedAttacker(script()),
      script(),
      queue,
      SEED
    );
    // Ten ticks in, the player clicks a target.
    for (let i = 0; i < 10; i++) {
      loop.step();
    }
    const clickedAt = loop.timeSeconds;
    queue.push(InputKind.FocusTarget, 0, -1);
    loop.step();

    const inputs = loop.replay().inputs;
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0].kind, InputKind.FocusTarget);
    assert.equal(inputs[0].timeSeconds, clickedAt);
    assert.equal(loop.focusedTarget, 0);
  });

  it("applies a crew allocation command, and trims it to the pool that is left", () => {
    const dials = Dials.defaults();
    const blueprint = SampleBlueprints.standardTurret();
    const queue = new LiveInputQueue();
    const loop = RunSimulation.withDefaults(dials, arena()).begin(
      blueprint,
      new ScriptedAttacker(script()),
      script(),
      queue,
      SEED
    );
    // Two stations, twelve crew: two gunners, three repair details is six, four runners.
    queue.push(InputKind.SetAllocation, 3, 4);
    loop.step();
    assert.equal(loop.crew.countInRole(CrewRole.Gunner), 2);
    assert.equal(loop.crew.countInRole(CrewRole.Repair), 6);
    assert.equal(loop.crew.countInRole(CrewRole.Runner), 4);

    // Asking for more than exists is trimmed rather than refused: the pool shrinks as crew
    // die, and a plan that stopped being affordable must not silently leave guns unmanned.
    queue.push(InputKind.SetAllocation, 20, 20);
    loop.step();
    assert.equal(loop.crew.countInRole(CrewRole.Gunner), 2);
    assert.ok(loop.crew.countInRole(CrewRole.Repair) <= 10);
    assert.equal(
      loop.crew.countInRole(CrewRole.Gunner) +
        loop.crew.countInRole(CrewRole.Repair) +
        loop.crew.countInRole(CrewRole.Runner) <=
        dials.crewPool,
      true
    );
  });

  it("reports the phase a renderer needs to label the screen", () => {
    const dials = Dials.defaults();
    const loop = RunSimulation.withDefaults(dials, arena()).begin(
      SampleBlueprints.standardTurret(),
      new ScriptedAttacker(script()),
      script(),
      InputScript.empty(),
      SEED
    );
    assert.equal(loop.phase, RunPhase.Ready);
    assert.equal(loop.tick, 0);
    loop.step();
    assert.equal(loop.phase, RunPhase.WaveRunning);
    assert.equal(loop.tick, 1);
    assert.equal(loop.waveTotal, dials.waveCount);
  });
});
