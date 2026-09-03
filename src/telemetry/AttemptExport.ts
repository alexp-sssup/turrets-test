import { OverlayMode, overlayName } from "../render/ViewState";
import { AttemptOutcome, AttemptRecord } from "./AttemptRecord";
import { SessionSummary } from "./Telemetry";

/**
 * One JSON file per attempt (UI spec 7.5): session id, blueprint, blueprint hash, seed,
 * command log, event stream and metrics.
 *
 * One artifact, three uses -- the thing a tester pastes into feedback, the replay format,
 * and the input to a headless batch re-run -- so it is written as plain data with no class
 * names and no object graph. `blueprint` is the persistence codec's own text, which means a
 * batch runner can decode it with `BlueprintCodec.decode` and nothing else.
 *
 * The `notes` field of §7.4 is absent: note capture was cut from this build on request.
 */
export class AttemptExport {
  /**
   * Two, since the mobile UI spec 9.1 device fields landed. One artifact, three uses, and
   * still one file per attempt: the export stays the replay format and the batch input.
   */
  public static readonly FORMAT_VERSION: number = 2;

  public static toJson(record: AttemptRecord, summary: SessionSummary | null): string {
    return JSON.stringify(AttemptExport.toObject(record, summary));
  }

  public static toPrettyJson(record: AttemptRecord, summary: SessionSummary | null): string {
    return JSON.stringify(AttemptExport.toObject(record, summary), null, 2);
  }

  public static fileName(record: AttemptRecord): string {
    return (
      "turrets-p0-" +
      record.sessionId +
      "-attempt" +
      (record.attemptIndex + 1).toString() +
      "-" +
      record.blueprintHash +
      ".json"
    );
  }

  private static toObject(record: AttemptRecord, summary: SessionSummary | null): object {
    const commands: object[] = [];
    for (let i = 0; i < record.commandLog.length; i++) {
      const command = record.commandLog[i];
      commands.push({
        t: Number(command.timeSeconds.toFixed(3)),
        kind: command.kind,
        value: command.value,
        secondary: command.secondary,
      });
    }
    const events: object[] = [];
    for (let i = 0; i < record.events.length; i++) {
      const event = record.events[i];
      events.push({
        t: Number(event.timeSeconds.toFixed(3)),
        wave: event.wave,
        kind: event.kind,
        subject: event.subject,
        object: event.object,
        value: Number.isFinite(event.value) ? Number(event.value.toFixed(4)) : null,
        detail: event.detail,
      });
    }

    const dwell: { [key: string]: object } = {};
    const overlays: readonly OverlayMode[] = [
      OverlayMode.Material,
      OverlayMode.Stress,
      OverlayMode.Predict,
      OverlayMode.Logistics,
      OverlayMode.Arcs,
    ];
    for (let i = 0; i < overlays.length; i++) {
      const index = overlays[i] as number;
      dwell[overlayName(overlays[i])] = {
        beforeRunSeconds: Number(record.overlayDwell.beforeRun[index].toFixed(2)),
        duringRunSeconds: Number(record.overlayDwell.duringRun[index].toFixed(2)),
        openedBeforeRun: record.overlayDwell.openedBeforeRun[index] === 1,
      };
    }

    return {
      format: "turrets-p0-attempt",
      formatVersion: AttemptExport.FORMAT_VERSION,
      sessionId: record.sessionId,
      attemptIndex: record.attemptIndex,
      seed: record.seed,
      blueprintName: record.blueprintName,
      blueprintHash: record.blueprintHash,
      blueprint: record.blueprintText,
      outcome: AttemptExport.outcomeName(record.outcome),
      wavesSurvived: record.wavesSurvived,
      runSeconds: Number(record.runSeconds.toFixed(2)),
      commandLog: commands,
      events: events,
      metrics: {
        readability: {
          overlayDwell: dwell,
          consultedSolverBeforeRun: record.overlayDwell.consultedSolverBeforeRun,
          solverDwellBeforeRunSeconds: Number(record.overlayDwell.solverDwellBeforeRun.toFixed(2)),
          predictOpenedDuringRun: record.predictOpenedDuringRun,
        },
        loop: {
          replayOpened: record.replayOpened,
          replayWatchFraction: Number(record.replayWatchFraction.toFixed(3)),
          replayScrubCount: record.replayScrubCount,
          editedAfterReplay: record.editedAfterReplay,
          firstFailedJoint: AttemptExport.jointName(record.firstFailedJoint),
          previousFirstFailedJoint: AttemptExport.jointName(record.previousFirstFailedJoint),
          sameJointFailedAgain: record.sameJointFailedAgain,
        },
        antiBlob: {
          blockCount: record.design.blockCount,
          stationCount: record.design.stationCount,
          depotCount: record.design.depotCount,
          cost: record.design.cost,
          stationsPerCell: Number(record.design.stationsPerCell.toFixed(4)),
          enclosedVolumeRatio: Number(record.design.enclosedVolumeRatio.toFixed(4)),
          fillRatio: Number(record.design.fillRatio.toFixed(4)),
          boundingVolume: record.design.boundingVolume,
        },
        device: {
          layoutMode: record.device.layoutMode,
          pointerKind: record.device.pointerKind,
          viewportW: record.device.viewportW,
          viewportH: record.device.viewportH,
          devicePixelRatio: Number(record.device.devicePixelRatio.toFixed(3)),
          orientationChanges: record.device.orientationChanges,
          keyboardUsed: record.device.keyboardUsed,
          gestureCounts: {
            taps: record.device.taps,
            drags: record.device.drags,
            longPresses: record.device.longPresses,
            pinches: record.device.pinches,
            doubleTaps: record.device.doubleTaps,
          },
        },
        resupply: {
          dryStationSeconds: Number(record.dryStationSeconds.toFixed(2)),
          noPathSeconds: Number(record.noPathSeconds.toFixed(2)),
        },
        performance: {
          solverMsP95: Number(record.solverMsP95.toFixed(2)),
          solverMsMax: Number(record.solverMsMax.toFixed(2)),
          renderMsP95: Number(record.renderMsP95.toFixed(2)),
          solveCount: record.solveCount,
          cellCount: record.cellCount,
        },
      },
      session:
        summary === null
          ? null
          : {
              attempts: summary.attempts,
              flown: summary.flown,
              attemptsToFirstSurvival: summary.attemptsToFirstSurvival,
              attemptsSinceSurvival: summary.attemptsSinceSurvival,
              fixesAfterReplay: summary.fixesAfterReplay,
              repeatedFailures: summary.repeatedFailures,
            },
    };
  }

  private static outcomeName(outcome: AttemptOutcome): string {
    if (outcome === AttemptOutcome.Survived) {
      return "survived";
    }
    if (outcome === AttemptOutcome.Lost) {
      return "lost";
    }
    return "not flown";
  }

  private static jointName(joint: { blockLow: number; blockHigh: number } | null): string | null {
    if (joint === null) {
      return null;
    }
    const low = joint.blockLow < 0 ? "ground" : "block " + joint.blockLow.toString();
    return low + " -> block " + joint.blockHigh.toString();
  }
}
