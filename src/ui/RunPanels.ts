import { AMMO_LOAD_COUNT, AmmoLoadId, AmmoTable } from "../materials/AmmoTable";
import { CrewRole, crewRoleName } from "../crew/CrewMember";
import { FieldFrame, StationStatus, isLoudStatus, stationStatusName } from "../render/FieldFrame";
import { RunEvent, RunEventKind, runEventKindName } from "../sim/RunEvent";
import { RunOutcome, runOutcomeName } from "../sim/RunResult";
import { AttemptRecord } from "../telemetry/AttemptRecord";
import { Dom } from "./Dom";

/** The events the failure chain is made of: structure and severed routes on one timeline. */
const FAILURE_KINDS: readonly RunEventKind[] = [
  RunEventKind.JointSheared,
  RunEventKind.StructureCollapsed,
  RunEventKind.StationStarved,
  RunEventKind.DepotDetonated,
  RunEventKind.BlockConsumedByFire,
  RunEventKind.TurretSilenced,
];

/** One row of the failure chain, with the index of the frame it happened on. */
export class ChainRow {
  public readonly event: RunEvent;
  public readonly frameIndex: number;

  public constructor(event: RunEvent, frameIndex: number) {
    this.event = event;
    this.frameIndex = frameIndex;
  }
}

/**
 * The Run, Replay and Summary panels (UI spec 3.2, 3.3).
 *
 * The Run screen is non-interactive except for focus-fire clicks and pause, and every
 * status it shows is a status the simulation actually holds. Dry and no-path are shouted
 * because §3.2 makes them the loudest thing in the build: a silent gun a tester does not
 * notice reads as the game cheating.
 */
export class RunPanels {
  public static run(
    frame: FieldFrame,
    ammo: AmmoTable,
    paused: boolean,
    stalled: boolean,
    waveIndex: number,
    waveTotal: number,
    waveTitle: string,
    crewCounts: readonly number[],
    focusedTarget: number
  ): string {
    return (
      RunPanels.waveSection(frame, waveIndex, waveTotal, waveTitle, paused, stalled) +
      RunPanels.stationSection(frame, ammo) +
      RunPanels.depotSection(frame) +
      RunPanels.crewSection(frame, crewCounts) +
      RunPanels.attackerSection(frame, focusedTarget)
    );
  }

  private static waveSection(
    frame: FieldFrame,
    waveIndex: number,
    waveTotal: number,
    waveTitle: string,
    paused: boolean,
    stalled: boolean
  ): string {
    const progress =
      frame.waveDuration > 0 ? Math.min(1, frame.waveElapsed / frame.waveDuration) : 0;
    return (
      '<section class="panel" data-group="wave"><h2>wave ' +
      (waveIndex + 1).toString() +
      " of " +
      waveTotal.toString() +
      "</h2>" +
      '<p class="wave-title">' +
      Dom.escape(waveTitle) +
      "</p>" +
      '<div class="bar"><span style="width:' +
      (progress * 100).toFixed(1) +
      '%"></span></div>' +
      '<table class="kv">' +
      RunPanels.row("arena time", frame.timeSeconds.toFixed(1) + "s") +
      RunPanels.row("blocks standing", frame.aliveBlocks.toString()) +
      RunPanels.row("load factor", Dom.number(frame.loadFactor, 2)) +
      "</table>" +
      '<div class="button-row"><button data-action="pause">' +
      (paused ? "resume" : "pause") +
      "</button></div>" +
      (stalled
        ? '<p class="hint warn">playback is waiting on a structural solve. the dev readout ' +
          "has the number; this is the §1.1 answer, not a rendering problem.</p>"
        : "") +
      '<p class="hint">1× only, and no verbs but pause and a focus-fire click. you are here to ' +
      "watch your design fail.</p></section>"
    );
  }

  private static stationSection(frame: FieldFrame, ammo: AmmoTable): string {
    if (frame.stations.length === 0) {
      return (
        '<section class="panel" data-group="stations"><h2>stations</h2>' +
        '<p class="bad">no station standing.</p></section>'
      );
    }
    let html =
      '<section class="panel" data-group="stations"><h2>stations</h2><ul class="status-list">';
    for (let i = 0; i < frame.stations.length; i++) {
      const station = frame.stations[i];
      const loud = isLoudStatus(station.status);
      html +=
        '<li class="status' +
        (loud ? " loud" : "") +
        '" data-action="locate" data-value="' +
        station.block.toString() +
        '">' +
        '<span class="status-name">#' +
        station.block.toString() +
        "</span>" +
        '<span class="status-badge ' +
        RunPanels.statusClass(station.status) +
        '">' +
        Dom.escape(stationStatusName(station.status).toUpperCase()) +
        "</span>" +
        '<span class="status-detail">rack ' +
        station.rackRounds.toString() +
        " × " +
        Dom.escape(ammo.get(station.preferredLoad as AmmoLoadId).name) +
        (station.gunnerAway ? " · gunner hauling" : "") +
        (station.arcClearFraction < 0.5
          ? ' · <span class="bad">arc ' + (station.arcClearFraction * 100).toFixed(0) + "%</span>"
          : "") +
        (station.drySeconds > 0 ? " · dry " + station.drySeconds.toFixed(0) + "s" : "") +
        "</span>" +
        RunPanels.loadButtons(station.block, station.preferredLoad, ammo) +
        "</li>";
    }
    return html + "</ul></section>";
  }

  private static loadButtons(station: number, current: number, ammo: AmmoTable): string {
    let html = '<span class="load-row">';
    for (let load = 0; load < AMMO_LOAD_COUNT; load++) {
      html +=
        '<button class="small' +
        (load === current ? " active" : "") +
        '" data-action="load" data-value="' +
        station.toString() +
        ":" +
        load.toString() +
        '">' +
        Dom.escape(ammo.get(load as AmmoLoadId).name) +
        "</button>";
    }
    return html + "</span>";
  }

  private static statusClass(status: StationStatus): string {
    if (status === StationStatus.NoPath) {
      return "bad";
    }
    if (status === StationStatus.Dry) {
      return "bad";
    }
    if (status === StationStatus.Unmanned) {
      return "warn";
    }
    if (status === StationStatus.Firing) {
      return "good";
    }
    return "";
  }

  private static depotSection(frame: FieldFrame): string {
    if (frame.depots.length === 0) {
      return "";
    }
    let html =
      '<section class="panel" data-group="depots"><h2>depots</h2><ul class="status-list">';
    for (let i = 0; i < frame.depots.length; i++) {
      const depot = frame.depots[i];
      html +=
        '<li class="status" data-action="locate" data-value="' +
        depot.block.toString() +
        '"><span class="status-name">#' +
        depot.block.toString() +
        '</span><span class="status-detail">' +
        depot.rounds.toString() +
        " rounds, " +
        (depot.fillFraction * 100).toFixed(0) +
        "% full" +
        (depot.chainDistance <= 1
          ? ' · <span class="bad">within cook-off range of another depot</span>'
          : "") +
        "</span></li>";
    }
    return html + "</ul></section>";
  }

  private static crewSection(frame: FieldFrame, crewCounts: readonly number[]): string {
    let html =
      '<section class="panel" data-group="crew"><h2>crew</h2><table class="kv">' +
      RunPanels.row("alive", frame.crewAlive.toString());
    for (let role = 1; role <= 3; role++) {
      html += RunPanels.row(crewRoleName(role as CrewRole), crewCounts[role].toString());
    }
    let carrying = 0;
    for (let i = 0; i < frame.crew.length; i++) {
      if (frame.crew[i].carrying >= 0) {
        carrying++;
      }
    }
    html += RunPanels.row("carrying a load", carrying.toString());
    return html + "</table></section>";
  }

  private static attackerSection(frame: FieldFrame, focusedTarget: number): string {
    if (frame.attackers.length === 0) {
      return (
        '<section class="panel" data-group="lane"><h2>lane</h2>' +
        '<p class="hint">nothing on the lane.</p></section>'
      );
    }
    let html = '<section class="panel" data-group="lane"><h2>lane</h2><ul class="status-list">';
    for (let i = 0; i < frame.attackers.length; i++) {
      const unit = frame.attackers[i];
      html +=
        '<li class="status' +
        (unit.id === focusedTarget ? " focused" : "") +
        '" data-action="focus" data-value="' +
        unit.id.toString() +
        '"><span class="status-name">' +
        Dom.escape(unit.kindName) +
        " #" +
        unit.id.toString() +
        '</span><span class="status-detail">' +
        (unit.engaged ? "engaged" : "closing") +
        ", " +
        (unit.hpFraction * 100).toFixed(0) +
        "% · x" +
        unit.laneX.toString() +
        " z" +
        unit.laneZ.toFixed(1) +
        "</span></li>";
    }
    return (
      html +
      '</ul><p class="hint">click a unit to focus fire on it. that is a logged command; ' +
      "everything else you can do here is not.</p></section>"
    );
  }

  // ---------------------------------------------------------------- replay

  /** The failure chain: ordered, clickable, and on the same timeline as severed routes. */
  public static failureChain(rows: readonly ChainRow[], currentFrame: number): string {
    if (rows.length === 0) {
      return '<p class="ok">nothing failed. the design held.</p>';
    }
    let html = '<ol class="chain">';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const event = row.event;
      const active = Math.abs(row.frameIndex - currentFrame) <= 2;
      html +=
        '<li class="' +
        (active ? "active" : "") +
        '" data-action="seek" data-value="' +
        row.frameIndex.toString() +
        '"><span class="chain-time">' +
        event.timeSeconds.toFixed(2) +
        "s</span>" +
        '<span class="chain-kind">' +
        Dom.escape(runEventKindName(event.kind)) +
        "</span>" +
        '<span class="chain-detail">' +
        RunPanels.eventSubject(event) +
        "</span></li>";
    }
    return html + "</ol>";
  }

  private static eventSubject(event: RunEvent): string {
    if (event.kind === RunEventKind.JointSheared) {
      const low = event.subject < 0 ? "ground" : "#" + event.subject.toString();
      return Dom.escape(low + " → #" + event.object.toString());
    }
    if (event.subject < 0) {
      return Dom.escape(event.detail);
    }
    return Dom.escape("#" + event.subject.toString() + (event.detail.length > 0 ? " " + event.detail : ""));
  }

  public static isFailureEvent(event: RunEvent): boolean {
    for (let i = 0; i < FAILURE_KINDS.length; i++) {
      if (event.kind === FAILURE_KINDS[i]) {
        return true;
      }
    }
    return false;
  }

  public static replay(
    frame: FieldFrame,
    frameIndex: number,
    frameCount: number,
    rows: readonly ChainRow[],
    firstFailed: { blockLow: number; blockHigh: number } | null,
    firstFailedFrame: number
  ): string {
    const fraction = frameCount > 1 ? frameIndex / (frameCount - 1) : 0;
    let html =
      '<section class="panel" data-group="wave"><h2>replay</h2>' +
      '<div class="scrub"><input type="range" min="0" max="' +
      Math.max(0, frameCount - 1).toString() +
      '" value="' +
      frameIndex.toString() +
      '" data-input="scrub" /></div>' +
      '<table class="kv">' +
      RunPanels.row("tick", frame.tick.toString() + " / " + frameCount.toString()) +
      RunPanels.row("arena time", frame.timeSeconds.toFixed(2) + "s") +
      RunPanels.row("position", (fraction * 100).toFixed(0) + "%") +
      "</table>" +
      '<div class="button-row"><button data-action="frame-back">◀ frame</button>' +
      '<button data-action="frame-forward">frame ▶</button>' +
      '<button data-action="play">play</button>' +
      '<button data-action="export">export JSON</button></div>' +
      '<p class="hint"><kbd>,</kbd> and <kbd>.</kbd> step one frame. overlays work here ' +
      "exactly as they do in the editor.</p></section>";

    html += '<section class="panel" data-group="chain"><h2>first failure</h2>';
    if (firstFailed === null) {
      html += '<p class="ok">no joint sheared in this attempt.</p>';
    } else {
      const low = firstFailed.blockLow < 0 ? "the ground" : "block #" + firstFailed.blockLow.toString();
      html +=
        '<p class="callout" data-action="seek" data-value="' +
        firstFailedFrame.toString() +
        '"><span class="callout-label">the joint that went first</span>' +
        '<span class="callout-value">' +
        Dom.escape(low + " → block #" + firstFailed.blockHigh.toString()) +
        "</span>" +
        '<span class="callout-hint">click to seek there and highlight it</span></p>';
    }
    html += "</section>";

    html +=
      '<section class="panel" data-group="chain"><h2>failure chain</h2>' +
      RunPanels.failureChain(rows, frameIndex) +
      "</section>";
    return html;
  }

  // ---------------------------------------------------------------- summary

  public static summary(
    record: AttemptRecord,
    outcome: RunOutcome,
    rows: readonly ChainRow[],
    firstFailedFrame: number
  ): string {
    const cause = RunPanels.causeOfLoss(record, outcome, rows);
    return (
      '<section class="panel" data-group="always"><h2>' +
      (record.survived ? "the design held" : "cause of loss") +
      "</h2>" +
      '<p class="callout"><span class="callout-value">' +
      Dom.escape(cause) +
      "</span></p>" +
      '<table class="kv">' +
      RunPanels.row("outcome", Dom.escape(runOutcomeName(outcome))) +
      RunPanels.row("waves survived", record.wavesSurvived.toString() + " of 5") +
      RunPanels.row("arena time", record.runSeconds.toFixed(0) + "s") +
      RunPanels.row("dry station seconds", record.dryStationSeconds.toFixed(0) + "s") +
      RunPanels.row("no-path seconds", record.noPathSeconds.toFixed(0) + "s") +
      RunPanels.row("solver p95", Dom.number(record.solverMsP95, 1) + " ms") +
      RunPanels.row("solves", record.solveCount.toString()) +
      RunPanels.row("stations per cell", Dom.number(record.design.stationsPerCell, 3)) +
      RunPanels.row("enclosed volume", Dom.number(record.design.enclosedVolumeRatio, 3)) +
      (record.previousFirstFailedJoint === null
        ? ""
        : RunPanels.row(
            "same joint as last time",
            record.sameJointFailedAgain
              ? '<span class="bad">yes</span>'
              : '<span class="good">no</span>'
          )) +
      "</table>" +
      '<div class="button-row">' +
      (rows.length > 0
        ? '<button data-action="seek-and-replay" data-value="' +
          firstFailedFrame.toString() +
          '">jump to the moment</button>'
        : "") +
      '<button data-action="replay">open the replay</button>' +
      '<button class="primary" data-action="fix">fix this blueprint</button>' +
      "</div>" +
      '<p class="hint">"fix this blueprint" lands in the editor with the failed joint ' +
      "selected and the stress overlay already on.</p></section>"
    );
  }

  private static causeOfLoss(
    record: AttemptRecord,
    outcome: RunOutcome,
    rows: readonly ChainRow[]
  ): string {
    if (record.survived) {
      return "five waves held.";
    }
    if (outcome === RunOutcome.Wrecked) {
      return "nothing left standing.";
    }
    // Loss-conditions spec 3.2. The outcome says the guns fell silent; the failure chain
    // says what silenced them, which is the half the player can act on.
    if (record.firstFailedJoint !== null) {
      const joint = record.firstFailedJoint;
      const low = joint.blockLow < 0 ? "the ground" : "block #" + joint.blockLow.toString();
      return (
        "the guns went with the structure, which started coming apart at " +
        low +
        " → block #" +
        joint.blockHigh.toString() +
        "."
      );
    }
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].event.kind === RunEventKind.BlockConsumedByFire) {
        return "the guns went after fire ate its way through the frame.";
      }
      if (rows[i].event.kind === RunEventKind.DepotDetonated) {
        return "the guns went after a depot cooked off inside the turret.";
      }
    }
    return "no station left manned. nothing collapsed on the way.";
  }

  public static row(label: string, value: string): string {
    return "<tr><th>" + Dom.escape(label) + "</th><td>" + value + "</td></tr>";
  }

  /** The Allocate screen (UI spec 3): gunners, repair details and runners out of one pool. */
  public static allocate(
    crewPool: number,
    stationCount: number,
    crewPerStation: number,
    crewPerRepairDetail: number,
    repairDetails: number,
    runners: number,
    interWave: boolean
  ): string {
    const forGunners = stationCount * crewPerStation;
    const forRepair = repairDetails * crewPerRepairDetail;
    const spare = crewPool - forGunners - forRepair - runners;
    return (
      '<section class="panel" data-group="always"><h2>' +
      (interWave ? "reassign between waves" : "allocate crew") +
      "</h2>" +
      '<p class="hint">one fixed pool for the whole run. no growth, no replacements. crew ' +
      "inside a collapsing section die and do not come back.</p>" +
      '<table class="kv">' +
      RunPanels.row(
        "gunners",
        forGunners.toString() + " (one per station, " + stationCount.toString() + " stations)"
      ) +
      RunPanels.row(
        "repair details",
        '<span class="stepper"><button class="small" data-action="repair-down">−</button>' +
          repairDetails.toString() +
          '<button class="small" data-action="repair-up">+</button></span> × ' +
          crewPerRepairDetail.toString() +
          " = " +
          forRepair.toString()
      ) +
      RunPanels.row(
        "runners",
        '<span class="stepper"><button class="small" data-action="runners-down">−</button>' +
          runners.toString() +
          '<button class="small" data-action="runners-up">+</button></span>'
      ) +
      RunPanels.row(
        "unassigned",
        '<span class="' + (spare < 0 ? "bad" : "") + '">' + spare.toString() + "</span>"
      ) +
      "</table>" +
      '<p class="hint">a station with no spare runner sends its own gunner for ammunition, ' +
      "and the gun is silent for the whole round trip. that is the baseline penalty.</p>" +
      '<div class="button-row"><button data-action="' +
      (interWave ? "abandon" : "design") +
      '">' +
      (interWave ? "abandon this run" : "← editor") +
      "</button></div>" +
      '<button class="primary" data-action="start">' +
      (interWave ? "next wave →" : "start wave 1 →") +
      "</button></section>"
    );
  }
}
