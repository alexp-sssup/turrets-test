import { AMMO_LOAD_COUNT, AmmoLoadId, AmmoTable } from "../materials/AmmoTable";
import { Blueprint } from "../blueprint/Blueprint";
import { MaterialId } from "../materials/MaterialId";
import { MaterialTable } from "../materials/MaterialTable";
import { ValidationReport } from "../editor/ValidationReport";
import { structuralStatusName } from "../structure/StructuralReport";
import { Replay } from "../sim/ReplayRecorder";
import { RunEventKind, runEventKindName } from "../sim/RunEvent";
import { RunResult, runOutcomeName } from "../sim/RunResult";

/** Formats the reports the other modules produce. No logic, only presentation. */
export class ReportView {
  public static blueprintSummary(
    blueprint: Blueprint,
    materials: MaterialTable,
    budget: number
  ): string[] {
    const bill = blueprint.billOfMaterials();
    return [
      "  blocks    " + blueprint.blockCount.toString(),
      "  materials " +
        bill.countOf(MaterialId.Wood).toString() +
        " wood, " +
        bill.countOf(MaterialId.Stone).toString() +
        " stone",
      "  cost      " + bill.totalCost(materials).toString() + " of " + budget.toString(),
    ];
  }

  public static validation(report: ValidationReport, ammo: AmmoTable): string[] {
    const lines: string[] = [];
    const structural = report.structural;
    lines.push(
      "  structure " +
        structuralStatusName(structural.status) +
        ", load factor " +
        ReportView.number(structural.loadFactor) +
        ", peak utilization " +
        structural.maxUtilization().toFixed(3) +
        ", tipping margin " +
        ReportView.number(structural.tippingMargin)
    );
    lines.push(
      "  joints    " +
        structural.jointCount.toString() +
        " (" +
        structural.criticalJoints.length.toString() +
        " in the limit mechanism, " +
        structural.predictiveHighlight.length.toString() +
        " highlighted)"
    );
    lines.push(
      "  solver    " +
        structural.rowCount.toString() +
        " rows x " +
        structural.columnCount.toString() +
        " columns, " +
        structural.simplexIterations.toString() +
        " simplex iterations"
    );

    if (report.violations.length === 0) {
      lines.push("  violations none");
    } else {
      lines.push("  violations");
      for (let i = 0; i < report.violations.length; i++) {
        lines.push("    - " + report.violations[i].describe());
      }
    }

    for (let i = 0; i < report.stationReadouts.length; i++) {
      const station = report.stationReadouts[i];
      let line =
        "  station " +
        station.position.toString() +
        " arc " +
        (station.arcClearFraction * 100).toFixed(0) +
        "%";
      if (station.hasDepotRoute) {
        line +=
          ", depot " +
          station.nearestDepot.toString() +
          " " +
          (station.depotPath === null ? "?" : station.depotPath.stepCount.toString()) +
          " steps, round trip " +
          station.roundTripSeconds.toFixed(1) +
          "s, rounds/trip";
        for (let load = 0; load < AMMO_LOAD_COUNT; load++) {
          line +=
            " " +
            ammo.get(load as AmmoLoadId).name +
            "=" +
            station.roundsPerTrip(load as AmmoLoadId).toString();
        }
      } else {
        line += ", NO DEPOT ROUTE (will fire its rack dry)";
      }
      if (!station.hasEntryRoute) {
        line += ", NO ROUTE IN";
      }
      lines.push(line);
    }
    return lines;
  }

  public static runSummary(result: RunResult): string[] {
    return [
      "  outcome   " +
        runOutcomeName(result.outcome) +
        " after " +
        result.wavesSurvived.toString() +
        " wave(s), " +
        result.elapsedSeconds.toFixed(0) +
        "s of arena time",
      "  turret    " +
        result.blocksRemaining.toString() +
        " blocks standing, " +
        result.blocksLost.toString() +
        " lost, final load factor " +
        ReportView.number(result.finalLoadFactor),
      "  crew      " +
        result.crewRemaining.toString() +
        " left, " +
        result.crewLost.toString() +
        " lost",
      "  gunnery   " +
        result.shotsFired.toString() +
        " shots, " +
        result.attackersDestroyed.toString() +
        " attackers destroyed, " +
        result.stationDrySeconds.toFixed(0) +
        "s spent dry",
      // Loss-conditions spec 4: silence is a state worth measuring even when it did not
      // end the run, so it is reported next to the dry time it rhymes with.
      "  silence   " + result.silencedSeconds.toFixed(0) + "s with no manned station",
      "  solver    " + result.structuralSolves.toString() + " structural analyses",
    ];
  }

  /** How many of each event kind happened. The shape of a run at a glance. */
  public static eventHistogram(replay: Replay): string[] {
    const lines: string[] = [];
    for (let kind = 0; kind <= (RunEventKind.RunLost as number); kind++) {
      const count = replay.countOf(kind as RunEventKind);
      if (count > 0) {
        lines.push("  " + ReportView.pad(runEventKindName(kind as RunEventKind), 24) + count.toString());
      }
    }
    return lines;
  }

  /** The collapse story: the first joint to shear, then every shear after it. */
  public static collapseStory(replay: Replay, limit: number): string[] {
    const lines: string[] = [];
    if (replay.firstFailedJoint === null) {
      lines.push("  nothing sheared");
      return lines;
    }
    const first = replay.firstFailedJoint;
    lines.push(
      "  first failed joint: " +
        (first.isSupport ? "ground" : "block " + first.blockLow.toString()) +
        " -> block " +
        first.blockHigh.toString()
    );
    const shears = replay.eventsOfKind(RunEventKind.JointSheared);
    const shown = shears.length < limit ? shears.length : limit;
    for (let i = 0; i < shown; i++) {
      lines.push("  " + shears[i].describe());
    }
    if (shears.length > shown) {
      lines.push("  ... and " + (shears.length - shown).toString() + " more");
    }
    return lines;
  }

  public static tail(replay: Replay, count: number): string[] {
    const transcript = replay.transcript();
    const start = transcript.length > count ? transcript.length - count : 0;
    const lines: string[] = [];
    for (let i = start; i < transcript.length; i++) {
      lines.push("  " + transcript[i]);
    }
    return lines;
  }

  private static number(value: number): string {
    if (!Number.isFinite(value)) {
      return "infinite";
    }
    return value.toFixed(3);
  }

  private static pad(text: string, width: number): string {
    let padded = text;
    while (padded.length < width) {
      padded += " ";
    }
    return padded;
  }
}
