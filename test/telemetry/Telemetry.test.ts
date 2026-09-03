import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { MaterialId } from "../../src/materials/MaterialId";
import { OverlayMode } from "../../src/render/ViewState";
import { JointRef } from "../../src/structure/CollapseResolver";
import { AttemptExport } from "../../src/telemetry/AttemptExport";
import { AttemptOutcome } from "../../src/telemetry/AttemptRecord";
import { DesignMetrics } from "../../src/telemetry/DesignMetrics";
import { SampleSet } from "../../src/telemetry/SampleSet";
import { MemorySessionStore, SESSION_ID_KEY, SessionId } from "../../src/telemetry/SessionStore";
import { Telemetry } from "../../src/telemetry/Telemetry";
import { WorkedExamples } from "../../src/data/WorkedExamples";

const dials = Dials.defaults();

/** A sealed 3x3x3 stone shell with a hollow middle: one cell of enclosed void. */
function sealedBox(): ReturnType<BlueprintBuilder["build"]> {
  const builder = new BlueprintBuilder();
  for (let y = 0; y <= 2; y++) {
    for (let z = 0; z <= 2; z++) {
      for (let x = 0; x <= 2; x++) {
        if (x === 1 && y === 1 && z === 1) {
          continue;
        }
        builder.place(new IVec3(x, y, z), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
      }
    }
  }
  return builder.build("sealed box");
}

describe("DesignMetrics", () => {
  it("counts sealed-in void, which is the shape half of the anti-blob question", () => {
    const metrics = DesignMetrics.of(sealedBox(), 78);
    assert.equal(metrics.blockCount, 26);
    assert.equal(metrics.boundingVolume, 27);
    assert.equal(metrics.enclosedVoidCells, 1);
    assert.ok(Math.abs(metrics.enclosedVolumeRatio - 1 / 27) < 1e-9);
    assert.ok(Math.abs(metrics.fillRatio - 26 / 27) < 1e-9);
  });

  it("counts an open frame's interior as reachable, not enclosed", () => {
    // The standard turret is a walled pad with an open top: its interior connects out.
    const metrics = DesignMetrics.of(SampleBlueprints.standardTurret(), 93);
    assert.equal(metrics.enclosedVoidCells, 0);
    assert.equal(metrics.stationCount, 2);
    assert.ok(metrics.stationsPerCell > 0);
  });

  it("gives the worked examples different shapes, which is the point of shipping three", () => {
    const examples = WorkedExamples.all();
    assert.equal(examples.length, 3);
    const byKey = new Map<string, DesignMetrics>();
    for (let i = 0; i < examples.length; i++) {
      byKey.set(examples[i].key, DesignMetrics.of(examples[i].blueprint, 0));
    }
    const box = byKey.get("stone-box") as DesignMetrics;
    const frame = byKey.get("wood-frame") as DesignMetrics;
    assert.ok(box.blockCount > frame.blockCount, "the keep is the heavier design");
    assert.ok(
      frame.stationsPerCell > box.stationsPerCell,
      "the cheap frame carries more gun per cell than the keep"
    );
  });
});

describe("SampleSet", () => {
  it("reports the percentile the performance targets are written against", () => {
    const samples = new SampleSet(100);
    for (let i = 1; i <= 100; i++) {
      samples.push(i);
    }
    assert.equal(samples.count, 100);
    assert.equal(samples.max, 100);
    assert.equal(samples.p95, 96);
    assert.equal(samples.latest, 100);
  });

  it("keeps a bounded window, so a long session does not outgrow its own metrics", () => {
    const samples = new SampleSet(4);
    for (let i = 0; i < 20; i++) {
      samples.push(i);
    }
    assert.equal(samples.count, 20);
    assert.equal(samples.latest, 19);
    assert.ok(samples.p95 >= 16, "the window holds the recent samples");
  });
});

describe("Telemetry", () => {
  it("answers the one field the whole prototype is in: did the same joint go again", () => {
    const telemetry = new Telemetry("abc123");
    const blueprint = SampleBlueprints.standardTurret();

    const first = telemetry.beginAttempt(blueprint, 93, 1, 0);
    telemetry.finishAttempt(AttemptOutcome.Lost, new JointRef(1, 4), 1000);
    assert.equal(first.sameJointFailedAgain, false, "there was nothing to compare to");

    telemetry.noteReplayOpened(1100);
    const second = telemetry.beginAttempt(blueprint, 93, 1, 1200);
    assert.equal(second.editedAfterReplay, true, "the replay was open before this attempt");
    telemetry.finishAttempt(AttemptOutcome.Lost, new JointRef(1, 4), 2000);
    assert.equal(second.sameJointFailedAgain, true, "the fix did not work");

    const third = telemetry.beginAttempt(blueprint, 93, 1, 2100);
    telemetry.finishAttempt(AttemptOutcome.Survived, null, 3000);
    assert.equal(third.survived, true);

    const summary = telemetry.summary();
    assert.equal(summary.attempts, 3);
    assert.equal(summary.attemptsToFirstSurvival, 3);
    assert.equal(summary.repeatedFailures, 1);
  });

  it("charges overlay dwell to before or during the run, which is what §1.1 asks", () => {
    const telemetry = new Telemetry("abc123");
    const record = telemetry.beginAttempt(SampleBlueprints.standardTurret(), 93, 1, 0);
    telemetry.noteOverlay(OverlayMode.Stress, 0);
    telemetry.noteRunning(false, 4000); // four seconds on stress, before the run
    telemetry.noteRunning(true, 4000);
    telemetry.noteOverlay(OverlayMode.Material, 9000); // five seconds of stress during it
    telemetry.finishAttempt(AttemptOutcome.Lost, null, 9000);

    assert.ok(record.overlayDwell.beforeRun[OverlayMode.Stress as number] >= 3.9);
    assert.ok(record.overlayDwell.duringRun[OverlayMode.Stress as number] >= 4.9);
    assert.equal(record.overlayDwell.consultedSolverBeforeRun, true);
  });

  it("tracks how much of a replay was watched and how hard it was to find the moment", () => {
    const telemetry = new Telemetry("abc123");
    const record = telemetry.beginAttempt(SampleBlueprints.standardTurret(), 93, 1, 0);
    telemetry.noteReplayOpened(100);
    telemetry.noteScrub(0.4);
    telemetry.noteScrub(0.2);
    telemetry.noteReplayProgress(0.75);
    assert.equal(record.replayOpened, true);
    assert.equal(record.replayScrubCount, 2);
    assert.ok(Math.abs(record.replayWatchFraction - 0.75) < 1e-9, "the furthest point reached");
  });
});

describe("SessionId", () => {
  it("generates a quotable id once and then remembers it", () => {
    const store = new MemorySessionStore();
    let calls = 0;
    const random = (): number => {
      calls++;
      return 0.5;
    };
    const first = SessionId.resolve(store, random);
    const second = SessionId.resolve(store, random);
    assert.equal(first.length, 6);
    assert.equal(second, first);
    assert.equal(store.read(SESSION_ID_KEY), first);
    assert.equal(calls, 6, "the second visit generates nothing");
    assert.equal(/[il o01]/.test(first), false, "no characters that get misread aloud");
  });
});

describe("AttemptExport", () => {
  it("exports one attempt as data, with the metrics the hypotheses are written against", () => {
    const telemetry = new Telemetry("abc123");
    const blueprint = SampleBlueprints.standardTurret();
    const record = telemetry.beginAttempt(blueprint, 93, 7, 0);
    record.outcome = AttemptOutcome.Lost;
    record.wavesSurvived = 2;
    record.runSeconds = 130.25;
    record.dryStationSeconds = 12.5;
    record.noPathSeconds = 3;
    record.firstFailedJoint = new JointRef(1, 4);
    record.solverMsP95 = 104.5;
    record.solveCount = 58;
    record.cellCount = blueprint.blockCount;

    const parsed = JSON.parse(AttemptExport.toJson(record, telemetry.summary())) as {
      format: string;
      sessionId: string;
      seed: number;
      blueprint: string;
      metrics: {
        loop: { firstFailedJoint: string; sameJointFailedAgain: boolean };
        resupply: { dryStationSeconds: number; noPathSeconds: number };
        antiBlob: { stationsPerCell: number };
        performance: { solverMsP95: number; cellCount: number };
        readability: { consultedSolverBeforeRun: boolean };
      };
      notes?: unknown;
    };

    assert.equal(parsed.format, "turrets-p0-attempt");
    assert.equal(parsed.sessionId, "abc123");
    assert.equal(parsed.seed, 7);
    assert.equal(parsed.metrics.loop.firstFailedJoint, "block 1 -> block 4");
    assert.equal(parsed.metrics.resupply.dryStationSeconds, 12.5);
    assert.equal(parsed.metrics.performance.solverMsP95, 104.5);
    assert.equal(parsed.metrics.performance.cellCount, blueprint.blockCount);
    assert.ok(parsed.metrics.antiBlob.stationsPerCell > 0);
    // Note capture (UI spec 7.4) is deliberately not in this build.
    assert.equal(parsed.notes, undefined);

    // The blueprint travels as the persistence codec's own text, so a headless batch
    // runner needs nothing but `BlueprintCodec.decode` to fly it again.
    assert.equal(typeof parsed.blueprint, "string");
    assert.ok(parsed.blueprint.indexOf("standard turret") > 0);
  });

  /**
   * Mobile UI spec 9.1 and 9.2. Every §7.3 metric is reported segmented by `layoutMode`, so
   * the segment has to be in the file: without it a compact-device attempt gets pooled into
   * a single overall readability number, and §10's risk becomes invisible.
   */
  it("carries the device the attempt was flown on, at format 2 (mobile UI spec 9.1)", () => {
    const telemetry = new Telemetry("mob001");
    const record = telemetry.beginAttempt(SampleBlueprints.standardTurret(), 93, 7, 0);
    record.device.layoutMode = "compact";
    record.device.pointerKind = "coarse";
    record.device.viewportW = 390;
    record.device.viewportH = 844;
    record.device.devicePixelRatio = 3;
    record.device.orientationChanges = 2;
    record.device.keyboardUsed = false;
    record.device.taps = 14;
    record.device.drags = 3;
    record.device.longPresses = 5;
    record.device.pinches = 2;
    record.device.doubleTaps = 1;

    const parsed = JSON.parse(AttemptExport.toJson(record, null)) as {
      formatVersion: number;
      metrics: {
        device: {
          layoutMode: string;
          pointerKind: string;
          viewportW: number;
          viewportH: number;
          devicePixelRatio: number;
          orientationChanges: number;
          keyboardUsed: boolean;
          gestureCounts: {
            taps: number;
            drags: number;
            longPresses: number;
            pinches: number;
            doubleTaps: number;
          };
        };
      };
    };

    assert.equal(parsed.formatVersion, 2);
    assert.equal(parsed.metrics.device.layoutMode, "compact");
    assert.equal(parsed.metrics.device.pointerKind, "coarse");
    assert.equal(parsed.metrics.device.viewportW, 390);
    assert.equal(parsed.metrics.device.viewportH, 844);
    // As reported, before the 8.3 cap: the cap is a rendering decision, not a fact about
    // the tester's screen, and the analysis needs the fact.
    assert.equal(parsed.metrics.device.devicePixelRatio, 3);
    assert.equal(parsed.metrics.device.orientationChanges, 2);
    assert.equal(parsed.metrics.device.keyboardUsed, false);
    assert.equal(parsed.metrics.device.gestureCounts.taps, 14);
    assert.equal(parsed.metrics.device.gestureCounts.drags, 3);
    assert.equal(parsed.metrics.device.gestureCounts.longPresses, 5);
    assert.equal(parsed.metrics.device.gestureCounts.pinches, 2);
    assert.equal(parsed.metrics.device.gestureCounts.doubleTaps, 1);
  });

  it("defaults an attempt nobody touched to a fine pointer on a wide layout", () => {
    const telemetry = new Telemetry("mob002");
    const record = telemetry.beginAttempt(SampleBlueprints.standardTurret(), 93, 7, 0);
    assert.equal(record.device.layoutMode, "wide");
    assert.equal(record.device.pointerKind, "fine");
    assert.equal(record.device.taps, 0);
  });

  it("names the file after the session, the attempt and the design", () => {
    const telemetry = new Telemetry("zz9zz9");
    const record = telemetry.beginAttempt(SampleBlueprints.standardTurret(), 93, 1, 0);
    const name = AttemptExport.fileName(record);
    assert.ok(name.startsWith("turrets-p0-zz9zz9-attempt1-"));
    assert.ok(name.endsWith(".json"));
  });
});

describe("dials", () => {
  it("keeps the tick fixed, because a replay is an input log and not a state capture", () => {
    assert.equal(dials.tickSeconds, 0.05);
    assert.equal(dials.waveCount, 5);
  });
});
