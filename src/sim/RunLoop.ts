import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { Dials } from "../config/Dials";
import { AmmoLoadId, AmmoTable } from "../materials/AmmoTable";
import { DamageVerbId } from "../materials/DamageVerbId";
import { MaterialTable } from "../materials/MaterialTable";
import { WeaponClass, WeaponClassId, WeaponTable } from "../materials/WeaponTable";
import { BlockKind } from "../blueprint/BlockKind";
import { Blueprint } from "../blueprint/Blueprint";
import { AssignmentPlan } from "../crew/AssignmentPlan";
import { CrewRole } from "../crew/CrewMember";
import { CrewPool } from "../crew/CrewPool";
import { LogisticsSystem } from "../crew/LogisticsSystem";
import { RepairSystem } from "../crew/RepairSystem";
import { DamageSystem } from "../damage/DamageSystem";
import { FireSimulation } from "../damage/FireSimulation";
import { Impact } from "../damage/Impact";
import { KineticVerb } from "../damage/KineticVerb";
import { BlockStructure } from "../structure/BlockStructure";
import { CollapseOutcome, CollapseResolver, JointRef } from "../structure/CollapseResolver";
import { StructuralReport } from "../structure/StructuralReport";
import { StructuralSolver } from "../structure/StructuralSolver";
import { Arena } from "./Arena";
import { AttackerController } from "./AttackerController";
import { AttackerKind, AttackerTable } from "./AttackerKind";
import { AttackerUnit } from "./AttackerUnit";
import { CombatLoadCase } from "./CombatLoadCase";
import { InputSource } from "./InputSource";
import { InputKind, Replay, ReplayRecorder } from "./ReplayRecorder";
import { RunEvent, RunEventKind } from "./RunEvent";
import { RunOutcome, RunResult, runOutcomeName } from "./RunResult";
import { ShotTrace } from "./ShotTrace";
import { TargetingSystem } from "./TargetingSystem";
import { WaveScript } from "./WaveScript";

/** Where a run has got to. Read by the UI's phase indicator. */
export enum RunPhase {
  /** Constructed, nothing simulated yet. */
  Ready = 0,
  /** A wave is on the lane. */
  WaveRunning = 1,
  /** Between waves: repairs done, reassignment allowed, next wave not yet begun. */
  BetweenWaves = 2,
  Finished = 3,
}

/**
 * One run, advanced one tick at a time.
 *
 * The loop was originally written as a single `while` over the whole run, which is all a
 * headless harness needs. A renderer needs the inverse shape: it owns the frame clock, and
 * the simulation has to be something it can step, inspect and stop. So the body is the same
 * code in the same order -- the recorder call sequence is deliberately unchanged, because a
 * change there would silently change every replay -- and only the control flow is turned
 * inside out.
 *
 * The loop deliberately owns almost no rules. It moves attackers, routes their shots to
 * `DamageSystem`, lets `LogisticsSystem` decide who walks where, hands ignitions to
 * `FireSimulation`, and asks `CollapseResolver` what happened to the structure. Everything
 * a player could learn from is therefore decided by a system they can also inspect in the
 * editor.
 *
 * No wall clock, no entropy beyond the seed (spec 4.5). The caller decides how much real
 * time a tick is allowed to take; the tick itself cannot tell.
 */
export class RunLoop {
  private readonly materials: MaterialTable;
  private readonly ammo: AmmoTable;
  private readonly weapons: WeaponTable;
  private readonly attackerTable: AttackerTable;
  private readonly dials: Dials;
  private readonly arena: Arena;
  private readonly blueprint: Blueprint;
  private readonly seed: number;
  private readonly controller: AttackerController;
  private readonly script: WaveScript;
  private readonly inputs: InputSource;

  private readonly structureValue: BlockStructure;
  private readonly solver: StructuralSolver;
  private readonly collapse: CollapseResolver;
  private readonly fireValue: FireSimulation;
  private readonly damage: DamageSystem;
  private readonly logisticsValue: LogisticsSystem;
  private readonly repair: RepairSystem;
  private readonly crewValue: CrewPool;
  private readonly targeting: TargetingSystem;
  private readonly loadCase: CombatLoadCase;
  private readonly recorder: ReplayRecorder;
  private readonly reloadTimers: Map<number, number>;

  private units: AttackerUnit[];
  private nextUnitId: number;
  private time: number;
  private wave: number;
  private shotsFired: number;
  private attackersDestroyed: number;
  private crewLost: number;
  private structuralSolves: number;
  private lastSolveTime: number;
  private lastSolveVersion: number;
  private lastLoadStamp: number;
  private lastLoadFactor: number;
  /** Loss-conditions spec 4: how long the turret has had no manned station, in total. */
  private silencedSeconds: number;
  /** The state the last silence check saw, so the two events fire on the edges only. */
  private silenced: boolean;

  private phaseValue: RunPhase;
  private outcome: RunOutcome;
  private wavesSurvivedValue: number;
  private waveTime: number;
  private lost: boolean;
  private readonly waveCount: number;
  private firingThisTickValue: number[];
  private shotsThisTickValue: ShotTrace[];
  private lastReportValue: StructuralReport | null;
  private requestedRepairDetails: number;
  private requestedRunners: number;
  private allocationRequested: boolean;

  public constructor(
    materials: MaterialTable,
    ammo: AmmoTable,
    weapons: WeaponTable,
    attackerTable: AttackerTable,
    dials: Dials,
    arena: Arena,
    blueprint: Blueprint,
    seed: number,
    controller: AttackerController,
    script: WaveScript,
    inputs: InputSource
  ) {
    this.materials = materials;
    this.ammo = ammo;
    this.weapons = weapons;
    this.attackerTable = attackerTable;
    this.dials = dials;
    this.arena = arena;
    this.blueprint = blueprint;
    this.seed = seed;
    this.controller = controller;
    this.script = script;
    this.inputs = inputs;

    this.structureValue = new BlockStructure(blueprint);
    this.solver = StructuralSolver.withDefaults(materials, dials);
    this.collapse = CollapseResolver.withDefaults(this.solver, materials, dials);
    this.fireValue = FireSimulation.withDefaults(materials);
    this.damage = DamageSystem.withDefaults(materials, ammo, this.fireValue, dials);
    this.logisticsValue = new LogisticsSystem(ammo, dials, arena.pad);
    this.repair = new RepairSystem(materials, dials);
    this.crewValue = new CrewPool(dials.crewPool);
    this.targeting = new TargetingSystem();
    this.loadCase = new CombatLoadCase(materials, dials, weapons.get(WeaponClassId.Gun));
    this.recorder = new ReplayRecorder();
    this.reloadTimers = new Map<number, number>();

    this.units = [];
    this.nextUnitId = 0;
    this.time = 0;
    this.wave = 0;
    this.shotsFired = 0;
    this.attackersDestroyed = 0;
    this.crewLost = 0;
    this.structuralSolves = 0;
    this.lastSolveTime = -1e9;
    this.lastSolveVersion = -1;
    this.lastLoadStamp = -1;
    this.lastLoadFactor = Number.POSITIVE_INFINITY;

    this.phaseValue = RunPhase.Ready;
    this.silencedSeconds = 0;
    this.silenced = false;
    this.outcome = RunOutcome.Won;
    this.wavesSurvivedValue = 0;
    this.waveTime = 0;
    this.lost = false;
    this.waveCount = script.waveCount < dials.waveCount ? script.waveCount : dials.waveCount;
    this.firingThisTickValue = [];
    this.shotsThisTickValue = [];
    this.lastReportValue = null;
    this.requestedRepairDetails = -1;
    this.requestedRunners = -1;
    this.allocationRequested = false;

    this.logisticsValue.configure(this.structureValue, AmmoLoadId.SolidShot);
    this.assignCrew();
    if (this.waveCount === 0) {
      this.finish();
    }
  }

  // ---------------------------------------------------------------- observation

  public get phase(): RunPhase {
    return this.phaseValue;
  }

  public get finished(): boolean {
    return this.phaseValue === RunPhase.Finished;
  }

  public get timeSeconds(): number {
    return this.time;
  }

  /** Ticks simulated so far. The dev readout's tick counter. */
  public get tick(): number {
    return Math.round(this.time / this.dials.tickSeconds);
  }

  public get waveIndex(): number {
    return this.wave;
  }

  public get waveTotal(): number {
    return this.waveCount;
  }

  public get wavesSurvived(): number {
    return this.wavesSurvivedValue;
  }

  /** Seconds into the current wave. */
  public get waveElapsed(): number {
    return this.waveTime;
  }

  public get waveDuration(): number {
    return this.wave < this.waveCount ? this.script.waveAt(this.wave).durationSeconds : 0;
  }

  public get waveTitle(): string {
    return this.wave < this.waveCount ? this.script.waveAt(this.wave).title : "";
  }

  public get structure(): BlockStructure {
    return this.structureValue;
  }

  public get crew(): CrewPool {
    return this.crewValue;
  }

  public get logistics(): LogisticsSystem {
    return this.logisticsValue;
  }

  public get fire(): FireSimulation {
    return this.fireValue;
  }

  public get attackerUnits(): readonly AttackerUnit[] {
    return this.units;
  }

  public get attackerKinds(): AttackerTable {
    return this.attackerTable;
  }

  public get gun(): WeaponClass {
    return this.weapons.get(WeaponClassId.Gun);
  }

  public get focusedTarget(): number {
    return this.targeting.focus;
  }

  /** The most recent structural analysis, or null before the first one. */
  public get lastReport(): StructuralReport | null {
    return this.lastReportValue;
  }

  public get solveCount(): number {
    return this.structuralSolves;
  }

  /** Stations that fired on the tick just simulated. Drives the muzzle flash. */
  public get firingThisTick(): readonly number[] {
    return this.firingThisTickValue;
  }

  /**
   * Every round that flew on the tick just simulated, in both directions.
   *
   * Reporting only, for the renderer to draw a shot along the path the damage actually took
   * (isometric renderer spec 7.5). A fresh array per tick, so a frame that keeps the
   * reference keeps a stable one.
   */
  public get shotsThisTick(): readonly ShotTrace[] {
    return this.shotsThisTickValue;
  }

  public reloadRemaining(station: number): number {
    const timer = this.reloadTimers.get(station);
    return timer === undefined ? 0 : timer;
  }

  public get eventCount(): number {
    return this.recorder.eventCount;
  }

  /** The event log so far, for the replay timeline to read incrementally. */
  public events(): readonly RunEvent[] {
    return this.recorder.eventsSoFar();
  }

  public get firstFailedJoint(): JointRef | null {
    return this.recorder.firstFailedJointSoFar;
  }

  public get repairDetailsRequested(): number {
    return this.requestedRepairDetails;
  }

  public get runnersRequested(): number {
    return this.requestedRunners;
  }

  // ---------------------------------------------------------------- stepping

  /**
   * Advances the run by one tick, doing whatever wave bookkeeping that tick implies.
   * Returns false once the run is over.
   */
  public step(): boolean {
    if (this.phaseValue === RunPhase.Finished) {
      return false;
    }
    if (this.phaseValue === RunPhase.Ready || this.phaseValue === RunPhase.BetweenWaves) {
      this.beginWave();
    }
    const stop = this.tickOnce();
    if (stop === TickResult.Continue) {
      return true;
    }
    this.endWave();
    return !this.finished;
  }

  /** Runs to completion. What the headless harness and the CI determinism check use. */
  public runToCompletion(): RunResult {
    while (this.step()) {
      // Every exit condition lives in step().
    }
    return this.result();
  }

  public result(): RunResult {
    return new RunResult(
      this.outcome,
      this.wavesSurvivedValue,
      this.recorder.build(this.seed, this.blueprint.name),
      this.crewLost,
      this.crewValue.aliveCount,
      this.blueprint.blockCount - this.structureValue.aliveCount,
      this.structureValue.aliveCount,
      this.attackersDestroyed,
      this.shotsFired,
      this.totalDrySeconds(),
      this.silencedSeconds,
      this.lastLoadFactor,
      this.structuralSolves,
      this.time
    );
  }

  public replay(): Replay {
    return this.recorder.build(this.seed, this.blueprint.name);
  }

  private beginWave(): void {
    const wave = this.script.waveAt(this.wave);
    this.logisticsValue.resupplyWindow(this.structureValue);
    this.controller.beginWave(this.wave);
    this.units = [];
    this.recorder.record(this.time, this.wave, RunEventKind.WaveBegan, this.wave, -1, 0, wave.title);
    this.waveTime = 0;
    this.lost = false;
    this.phaseValue = RunPhase.WaveRunning;
  }

  /** The tick body, in the order the headless loop ran it. */
  private tickOnce(): TickResult {
    const step = this.dials.tickSeconds;
    this.applyInputs();
    this.shotsThisTickValue = [];
    this.spawn();
    this.advanceAttackers(step);
    this.firingThisTickValue = this.fireStations();
    this.advanceLogistics(step);
    this.advanceFire(step);
    this.checkStructure(this.firingThisTickValue);

    this.time += step;
    this.waveTime += step;

    this.trackSilence(step);
    if (this.structureValue.aliveCount === 0) {
      this.outcome = RunOutcome.Wrecked;
      this.lost = true;
      return TickResult.WaveOver;
    }
    if (this.aliveUnitCount() === 0 && this.controller.isWaveExhausted(this.waveTime)) {
      return TickResult.WaveOver;
    }
    if (this.waveTime >= this.script.waveAt(this.wave).durationSeconds) {
      return TickResult.WaveOver;
    }
    return TickResult.Continue;
  }

  private endWave(): void {
    this.recorder.record(
      this.time,
      this.wave,
      RunEventKind.WaveEnded,
      this.wave,
      -1,
      this.aliveUnitCount(),
      this.lost ? "broken off" : "cleared"
    );
    if (this.lost) {
      this.finish();
      return;
    }
    this.wavesSurvivedValue++;
    this.interWaveWindow();
    if (this.wave + 1 >= this.waveCount) {
      this.finish();
      return;
    }
    // Loss-conditions spec 3.2, and 3.3 for why it sits after the wave-count test: the
    // question is "can this design fight the next wave", so it is only asked when there is
    // one, and only once repair has rebuilt what it could and crew have re-manned.
    if (!this.hasMannedStation()) {
      this.outcome = RunOutcome.Unmanned;
      this.lost = true;
      this.finish();
      return;
    }
    this.wave++;
    this.phaseValue = RunPhase.BetweenWaves;
  }

  private finish(): void {
    this.recorder.record(
      this.time,
      this.wave,
      this.outcome === RunOutcome.Won ? RunEventKind.RunWon : RunEventKind.RunLost,
      -1,
      -1,
      this.wavesSurvivedValue,
      // Loss-conditions spec 3 gives a run two ways to be lost, so the line that ends the
      // replay has to say which one it was.
      runOutcomeName(this.outcome)
    );
    this.phaseValue = RunPhase.Finished;
  }

  // ---------------------------------------------------------------- systems

  /**
   * Spec 4.4: crew are divided between gunners, repair and runners. The division is a
   * player decision, so it arrives as a logged command; the default below is the baseline
   * that decision is meant to beat.
   */
  private assignCrew(): void {
    const stations = this.structureValue.aliveOfKind(BlockKind.Station);
    const plan = this.allocationRequested
      ? this.requestedPlan(stations)
      : AssignmentPlan.defaultFor(stations, this.crewValue.aliveCount, this.dials);
    this.crewValue.apply(plan, this.dials);
  }

  /**
   * The player's split, trimmed to what the surviving pool can actually pay for. Stations
   * are manned first: a design's guns are the reason the other two roles exist.
   */
  private requestedPlan(stations: readonly number[]): AssignmentPlan {
    const available = this.crewValue.aliveCount;
    const manned: number[] = [];
    let spent = 0;
    for (let i = 0; i < stations.length; i++) {
      if (spent + this.dials.crewPerStation > available) {
        break;
      }
      manned.push(stations[i]);
      spent += this.dials.crewPerStation;
    }
    let details = 0;
    while (details < this.requestedRepairDetails && spent + this.dials.crewPerRepairDetail <= available) {
      details++;
      spent += this.dials.crewPerRepairDetail;
    }
    let runners = this.requestedRunners;
    if (runners > available - spent) {
      runners = available - spent;
    }
    if (runners < 0) {
      runners = 0;
    }
    return new AssignmentPlan(manned, details, runners);
  }

  /**
   * The allocation, applied before the run starts (crew-visible spec 2.3).
   *
   * The Allocate screen draws the run's own tick-zero frame, so the crew standing on it have
   * to be the crew the plan being edited puts there. Refused once the clock is moving: from
   * there on the split arrives as a logged `SetAllocation` on a tick like every other
   * command, and a second path into it would be a command the replay never saw.
   *
   * Before the first tick there is no such risk. The screen queues the same command anyway
   * when the wave starts, so this is a projection of a command the log will carry rather
   * than a command of its own -- spec 4.5's replay re-drives from that log unchanged.
   */
  public previewAllocation(repairDetails: number, runners: number): boolean {
    if (this.phaseValue !== RunPhase.Ready) {
      return false;
    }
    this.requestedRepairDetails = repairDetails;
    this.requestedRunners = runners;
    this.allocationRequested = true;
    this.assignCrew();
    return true;
  }

  private applyInputs(): void {
    const due = this.inputs.drain(this.time);
    for (let i = 0; i < due.length; i++) {
      const input = due[i];
      this.recorder.recordInput(input);
      if (input.kind === InputKind.FocusTarget) {
        this.targeting.setFocus(input.value);
      } else if (input.kind === InputKind.ClearFocus) {
        this.targeting.clearFocus();
      } else if (input.kind === InputKind.SetAllocation) {
        this.requestedRepairDetails = input.value;
        this.requestedRunners = input.secondary;
        this.allocationRequested = true;
        this.assignCrew();
      } else {
        const supply = this.logisticsValue.supplyOf(input.value);
        if (supply !== null) {
          supply.preferredLoad = input.secondary as AmmoLoadId;
        }
      }
    }
  }

  private spawn(): void {
    const requests = this.controller.update(this.waveTime, this.dials.tickSeconds);
    for (let i = 0; i < requests.length; i++) {
      const kind = this.attackerTable.get(requests[i].kind);
      const unit = new AttackerUnit(
        this.nextUnitId,
        requests[i].kind,
        this.arena.clampLaneX(requests[i].laneX),
        this.arena.spawnZ,
        kind.hitPoints,
        kind.reloadSeconds
      );
      this.nextUnitId++;
      this.units.push(unit);
      this.recorder.record(
        this.time,
        this.wave,
        RunEventKind.AttackerSpawned,
        unit.id,
        -1,
        unit.laneX,
        kind.name
      );
    }
  }

  private advanceAttackers(step: number): void {
    for (let i = 0; i < this.units.length; i++) {
      const unit = this.units[i];
      if (!unit.alive) {
        continue;
      }
      const kind = this.attackerTable.get(unit.kind);
      const holdZ = this.arena.frontZ - kind.standoff;
      // The reload clock runs during the approach, so a unit that survives the walk in
      // shoots almost as soon as it arrives.
      unit.reloadTimer -= step;
      if (unit.laneZ < holdZ) {
        unit.laneZ += kind.speed * step;
        if (unit.laneZ > holdZ) {
          unit.laneZ = holdZ;
        }
        continue;
      }
      unit.engaged = true;
      if (unit.reloadTimer > 0) {
        continue;
      }
      unit.reloadTimer = kind.reloadSeconds;
      this.attackerShoot(unit, kind);
    }
  }

  private attackerShoot(unit: AttackerUnit, kind: AttackerKind): void {
    const impact = this.chooseImpact(unit, kind);
    if (impact === null) {
      return;
    }
    const hitBlock = this.structureValue.indexAt(impact.cell);
    this.shotsThisTickValue.push(
      new ShotTrace(
        unit.laneX + 0.5,
        this.arena.pad.level + 0.5,
        unit.laneZ + 0.5,
        impact.cell.x + 0.5,
        impact.cell.y + 0.5,
        impact.cell.z + 0.5,
        impact.heading === Direction.NegY,
        false
      )
    );
    const result = this.damage.applyImpact(this.structureValue, impact);
    this.recorder.record(
      this.time,
      this.wave,
      RunEventKind.TurretHit,
      unit.id,
      hitBlock,
      kind.damage,
      kind.name
    );

    // Spec 4.2: "crew at a station can be killed through the port without destroying the
    // block, silencing that gun."
    if (
      hitBlock >= 0 &&
      this.structureValue.isAlive(hitBlock) &&
      this.structureValue.kindOf(hitBlock) === BlockKind.Station &&
      this.ammo.get(kind.load).verb === DamageVerbId.Kinetic
    ) {
      const killed = this.crewValue.killAt([hitBlock]);
      this.noteCrewDeaths(killed, "through the port");
    }

    for (let i = 0; i < result.destroyedBlocks.length; i++) {
      this.recorder.record(
        this.time,
        this.wave,
        RunEventKind.BlockDestroyed,
        result.destroyedBlocks[i],
        unit.id,
        0,
        ""
      );
    }
    for (let i = 0; i < result.detonatedDepots.length; i++) {
      this.recorder.record(
        this.time,
        this.wave,
        RunEventKind.DepotDetonated,
        result.detonatedDepots[i],
        -1,
        0,
        ""
      );
    }
    for (let i = 0; i < result.ignitions.length; i++) {
      this.recorder.record(this.time, this.wave, RunEventKind.BlockIgnited, result.ignitions[i], -1, 0, "");
    }
    const killedByBlast = this.crewValue.killAt(result.destroyedBlocks);
    this.noteCrewDeaths(killedByBlast, "lost with the block");
  }

  /**
   * Where a round lands. Kinetic rounds go in a straight line and bite the first thing they
   * meet; a firepot is lobbed over the parapet so its contents run down inside, which is
   * what makes an open frame worse than a closed one.
   */
  private chooseImpact(unit: AttackerUnit, kind: AttackerKind): Impact | null {
    const origin = this.arena.cellAt(unit.laneX, unit.laneZ);
    if (this.ammo.get(kind.load).verb === DamageVerbId.Kinetic) {
      const contact = KineticVerb.firstContact(
        this.structureValue,
        origin,
        Direction.PosZ,
        this.arena.laneLength + 16
      );
      if (contact === null) {
        return null;
      }
      return new Impact(contact, Direction.PosZ, kind.load, kind.damage, kind.penetrationDepth);
    }
    const target = this.lobTarget(unit.laneX);
    if (target === null) {
      return null;
    }
    return new Impact(target, Direction.NegY, kind.load, kind.damage, kind.penetrationDepth);
  }

  /** The cell just above the tallest thing in a lane column, inside the pad. */
  private lobTarget(laneX: number): IVec3 | null {
    const bounds = this.structureValue.bounds;
    let bestZ = -1;
    let bestY = -1;
    for (let z = this.arena.pad.minZ; z <= this.arena.pad.maxZ; z++) {
      for (let y = bounds.min.y + bounds.size.y - 1; y >= bounds.min.y; y--) {
        if (this.structureValue.indexAt(new IVec3(laneX, y, z)) >= 0) {
          if (y > bestY) {
            bestY = y;
            bestZ = z;
          }
          break;
        }
      }
    }
    if (bestY < 0) {
      return null;
    }
    return new IVec3(laneX, bestY + 1, bestZ);
  }

  /** Every station that fired this tick, so their recoil loads the frame. */
  private fireStations(): number[] {
    const firing: number[] = [];
    const weapon = this.weapons.get(WeaponClassId.Gun);
    const stations = this.logisticsValue.stationBlocks();
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      if (!this.structureValue.isAlive(station)) {
        continue;
      }
      const timer = this.reloadTimers.get(station);
      const remaining = timer === undefined ? 0 : timer - this.dials.tickSeconds;
      if (remaining > 0) {
        this.reloadTimers.set(station, remaining);
        continue;
      }
      this.reloadTimers.set(station, 0);

      const target = this.targeting.pickTarget(
        this.structureValue,
        this.arena,
        weapon,
        station,
        this.units
      );
      if (target === null) {
        continue;
      }
      if (!this.logisticsValue.canFire(this.structureValue, this.crewValue, station)) {
        const supply = this.logisticsValue.supplyOf(station);
        if (supply !== null && supply.rack.isEmpty) {
          this.recorder.record(this.time, this.wave, RunEventKind.StationDry, station, -1, 0, "");
        }
        continue;
      }
      const supply = this.logisticsValue.supplyOf(station);
      const load = supply === null ? AmmoLoadId.SolidShot : supply.preferredLoad;
      if (!this.logisticsValue.consumeShot(station)) {
        continue;
      }
      this.reloadTimers.set(station, weapon.reloadSeconds);
      this.shotsFired++;
      firing.push(station);
      const muzzle = this.structureValue.blueprint.blockAt(station).position;
      this.shotsThisTickValue.push(
        new ShotTrace(
          muzzle.x + 0.5,
          muzzle.y + 0.5,
          muzzle.z + 0.5,
          target.laneX + 0.5,
          this.arena.pad.level + 0.5,
          target.laneZ + 0.5,
          false,
          true
        )
      );
      this.recorder.record(
        this.time,
        this.wave,
        RunEventKind.StationFired,
        station,
        target.id,
        0,
        this.ammo.get(load).name
      );

      target.hitPoints -= this.ammo.get(load).impactDamage;
      if (target.hitPoints <= 0) {
        target.alive = false;
        this.attackersDestroyed++;
        this.recorder.record(
          this.time,
          this.wave,
          RunEventKind.AttackerDestroyed,
          target.id,
          station,
          0,
          ""
        );
        if (this.targeting.focus === target.id) {
          this.targeting.clearFocus();
        }
      }
    }
    return firing;
  }

  private advanceLogistics(step: number): void {
    const logisticsStep = this.logisticsValue.update(this.structureValue, this.crewValue, step);
    const starved = logisticsStep.starvedStations;
    for (let i = 0; i < starved.length; i++) {
      this.recorder.record(this.time, this.wave, RunEventKind.StationStarved, starved[i], -1, 0, "");
    }
  }

  private advanceFire(step: number): void {
    const fireStep = this.fireValue.advance(this.structureValue, step);
    for (let i = 0; i < fireStep.spread.length; i++) {
      this.recorder.record(
        this.time,
        this.wave,
        RunEventKind.BlockIgnited,
        fireStep.spread[i],
        -1,
        0,
        "spread"
      );
    }
    for (let i = 0; i < fireStep.consumed.length; i++) {
      this.recorder.record(
        this.time,
        this.wave,
        RunEventKind.BlockConsumedByFire,
        fireStep.consumed[i],
        -1,
        0,
        ""
      );
    }
    const killed = this.crewValue.killAt(fireStep.consumed);
    this.noteCrewDeaths(killed, "burned");
  }

  /**
   * Re-checks soundness and resolves any collapse. Skipped on ticks where neither the
   * structure nor the loading changed and the interval has not elapsed.
   */
  private checkStructure(firing: readonly number[]): void {
    this.loadCase.setFiring(firing);
    const stamp = this.loadCase.stamp();
    const changed =
      this.structureValue.version !== this.lastSolveVersion ||
      stamp !== this.lastLoadStamp ||
      this.time - this.lastSolveTime >= this.dials.structuralIntervalSeconds;
    if (!changed) {
      return;
    }
    this.lastSolveVersion = this.structureValue.version;
    this.lastLoadStamp = stamp;
    this.lastSolveTime = this.time;
    this.structuralSolves++;

    const outcome = this.collapse.resolve(
      this.structureValue,
      this.arena.pad,
      this.loadCase,
      this.time
    );
    this.recordCollapse(outcome);
    this.lastReportValue = outcome.finalReport;
    const factor = outcome.finalReport.loadFactor;
    if (RunLoop.marginCrossed(this.lastLoadFactor, factor)) {
      this.recorder.record(
        this.time,
        this.wave,
        RunEventKind.MarginChanged,
        -1,
        -1,
        factor,
        factor < 1 ? "over capacity" : "back in margin"
      );
    }
    this.lastLoadFactor = factor;
    this.lastSolveVersion = this.structureValue.version;
  }

  private recordCollapse(outcome: CollapseOutcome): void {
    for (let e = 0; e < outcome.events.length; e++) {
      const event = outcome.events[e];
      const severed = event.severedJoints;
      for (let j = 0; j < severed.length; j++) {
        this.recorder.record(
          event.timeSeconds,
          this.wave,
          RunEventKind.JointSheared,
          severed[j].blockLow,
          severed[j].blockHigh,
          event.loadFactorBefore,
          severed[j].isSupport ? "support" : ""
        );
      }
      if (event.destroyedBlocks.length > 0) {
        this.recorder.record(
          event.timeSeconds,
          this.wave,
          RunEventKind.StructureCollapsed,
          event.round,
          -1,
          event.destroyedBlocks.length,
          ""
        );
      }
      const killed = this.crewValue.killAt(event.destroyedBlocks);
      this.noteCrewDeaths(killed, "in the collapse");
    }
    if (outcome.firstFailedJoint !== null) {
      this.recorder.noteFirstFailedJoint(outcome.firstFailedJoint);
    }
  }

  private noteCrewDeaths(ids: readonly number[], detail: string): void {
    for (let i = 0; i < ids.length; i++) {
      this.crewLost++;
      this.recorder.record(this.time, this.wave, RunEventKind.CrewKilled, ids[i], -1, 0, detail);
    }
    if (ids.length > 0) {
      this.assignCrew();
    }
  }

  /** Spec 5: a thirty-second window of repair, then reassignment. */
  private interWaveWindow(): void {
    const outcome = this.repair.repair(
      this.structureValue,
      this.crewValue,
      this.dials.interWaveWindowSeconds
    );
    if (!outcome.isEmpty) {
      this.recorder.record(
        this.time,
        this.wave,
        RunEventKind.RepairCompleted,
        outcome.rebuilt.length,
        outcome.patched.length,
        outcome.detailCount,
        ""
      );
    }
    this.fireValue.prune(this.structureValue);
    this.assignCrew();
  }

  /**
   * Loss-conditions spec 3.2: is there an alive station block with a live gunner assigned
   * to it?
   *
   * Spec 4.2 makes this the whole of the turret's ability to fight -- "firepower equals
   * manned stations" -- so it is false in exactly the two cases spec 3.2 names: the
   * stations are gone, or the crew are.
   *
   * The question is about the *assignment*, not about where the gunner is standing this
   * tick. `CrewPool.gunnerAt` answers the second one, because a gunner away on a resupply
   * trip has `stationedAt` pointing at the depot they walked to -- which is right for "can
   * this gun fire right now" and wrong here. Spec 4.3 designs that walk in as the lull that
   * makes rate of fire burst-and-lull; a turret whose gunner is fetching shot has not lost
   * its guns, and counting it as silent would both inflate spec 4's metric and, at the
   * inter-wave check, end runs on a crew member being three voxels from their post.
   */
  private hasMannedStation(): boolean {
    if (this.crewValue.countInRole(CrewRole.Gunner) === 0) {
      return false;
    }
    // The blueprint's index, not `aliveOfKind`, because this runs every tick and that one
    // builds an array to hand back.
    const stations = this.blueprint.indicesOfKind(BlockKind.Station);
    for (let i = 0; i < stations.length; i++) {
      if (this.structureValue.isAlive(stations[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Loss-conditions spec 4: silence during a wave is a state, not an outcome. It is timed,
   * and its two edges are recorded, so the replay can say when the guns stopped and whether
   * they ever started again -- but the run continues, because the wave the player is losing
   * is already the punishment.
   */
  private trackSilence(step: number): void {
    const nowSilenced = !this.hasMannedStation();
    if (nowSilenced) {
      this.silencedSeconds += step;
    }
    if (nowSilenced === this.silenced) {
      return;
    }
    this.silenced = nowSilenced;
    this.recorder.record(
      this.time,
      this.wave,
      this.silenced ? RunEventKind.TurretSilenced : RunEventKind.TurretRemanned,
      -1,
      -1,
      this.silencedSeconds,
      ""
    );
  }

  private aliveUnitCount(): number {
    let count = 0;
    for (let i = 0; i < this.units.length; i++) {
      if (this.units[i].alive) {
        count++;
      }
    }
    return count;
  }

  private totalDrySeconds(): number {
    let total = 0;
    const stations = this.logisticsValue.stationBlocks();
    for (let i = 0; i < stations.length; i++) {
      const supply = this.logisticsValue.supplyOf(stations[i]);
      if (supply !== null) {
        total += supply.drySeconds;
      }
    }
    return total;
  }

  /** True when the margin crossed the 1.0 line in either direction. */
  private static marginCrossed(before: number, after: number): boolean {
    const wasSound = before >= 1;
    const isSound = after >= 1;
    return wasSound !== isSound;
  }
}

/** What one tick decided about the wave it belongs to. */
enum TickResult {
  Continue = 0,
  WaveOver = 1,
}
