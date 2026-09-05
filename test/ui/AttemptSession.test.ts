import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { Blueprint } from "../../src/blueprint/Blueprint";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { CrewRole } from "../../src/crew/CrewMember";
import { FieldDesign } from "../../src/render/FieldDesign";
import { Arena } from "../../src/sim/Arena";
import { RunPhase } from "../../src/sim/RunLoop";
import { AttemptRecord } from "../../src/telemetry/AttemptRecord";
import { DesignMetrics } from "../../src/telemetry/DesignMetrics";
import { AttemptSession } from "../../src/ui/AttemptSession";

const dials = Dials.defaults();
const arena = Arena.p0();
const SEED = 20260905;

function session(blueprint: Blueprint): AttemptSession {
  const record = new AttemptRecord(
    "test",
    0,
    blueprint.name,
    "hash",
    "text",
    SEED,
    [],
    [],
    DesignMetrics.of(blueprint, 0)
  );
  return new AttemptSession(
    blueprint,
    FieldDesign.withDefaults(blueprint, arena.pad, arena, dials),
    arena,
    dials,
    SEED,
    record
  );
}

/** Living crew in each role, off the frame the Allocate screen is looking at. */
function rolesOnFrame(attempt: AttemptSession): number[] {
  const counts = [0, 0, 0, 0];
  const frame = attempt.frame();
  for (let i = 0; i < frame.crew.length; i++) {
    counts[frame.crew[i].role]++;
  }
  return counts;
}

describe("AttemptSession.previewAllocation", () => {
  it("re-derives the tick-zero frame so the picture follows the plan (crew-visible spec 2.3)", () => {
    const attempt = session(SampleBlueprints.standardTurret());
    const before = rolesOnFrame(attempt);
    assert.equal(before[CrewRole.Gunner as number] + before[CrewRole.Repair as number] + before[CrewRole.Runner as number] + before[CrewRole.Idle as number], dials.crewPool);

    assert.equal(attempt.previewAllocation(0, 0), true);
    const noSupport = rolesOnFrame(attempt);
    assert.equal(noSupport[CrewRole.Repair as number], 0, "no repair detail was asked for");
    assert.equal(noSupport[CrewRole.Runner as number], 0, "and no runners either");

    assert.equal(attempt.previewAllocation(1, 4), true);
    const supported = rolesOnFrame(attempt);
    assert.equal(supported[CrewRole.Repair as number], dials.crewPerRepairDetail);
    assert.equal(supported[CrewRole.Runner as number], 4);
    assert.equal(
      supported[CrewRole.Gunner as number],
      noSupport[CrewRole.Gunner as number],
      "stations are manned first either way"
    );
  });

  it("corrects tick zero rather than appending a second one (crew-visible spec 2.3)", () => {
    const attempt = session(SampleBlueprints.standardTurret());
    assert.equal(attempt.timeline.length, 1);
    attempt.previewAllocation(0, 3);
    attempt.previewAllocation(2, 1);
    assert.equal(attempt.timeline.length, 1, "the replay scrubs by index and tick zero is one tick");
    assert.equal(attempt.frame().tick, 0);
  });

  it("is refused once the run has started, where the input queue owns it (crew-visible spec 2.3)", () => {
    const attempt = session(SampleBlueprints.standardTurret());
    attempt.start();
    attempt.simulateAhead(50);
    assert.notEqual(attempt.phase, RunPhase.Ready);
    assert.equal(attempt.previewAllocation(0, 0), false, "reassignment is a logged command now");
  });

  it("shows the crew before a wave has been flown (crew-visible spec 2.1)", () => {
    // The frame the Allocate screen draws. The editor's own frame carries no crew at all,
    // which is what the screen used to fall back to when no attempt was open (spec 1.1).
    const attempt = session(SampleBlueprints.standardTurret());
    assert.equal(attempt.started, false);
    assert.equal(attempt.frame().crew.length, dials.crewPool);
  });
});
