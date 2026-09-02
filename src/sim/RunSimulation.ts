import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { Dials } from "../config/Dials";
import { AmmoLoadId, AmmoTable } from "../materials/AmmoTable";
import { DamageVerbId } from "../materials/DamageVerbId";
import { MaterialTable } from "../materials/MaterialTable";
import { WeaponClassId, WeaponTable } from "../materials/WeaponTable";
import { BlockKind } from "../blueprint/BlockKind";
import { Blueprint } from "../blueprint/Blueprint";
import { AssignmentPlan } from "../crew/AssignmentPlan";
import { CrewPool } from "../crew/CrewPool";
import { LogisticsSystem } from "../crew/LogisticsSystem";
import { RepairSystem } from "../crew/RepairSystem";
import { DamageSystem } from "../damage/DamageSystem";
import { FireSimulation } from "../damage/FireSimulation";
import { Impact } from "../damage/Impact";
import { KineticVerb } from "../damage/KineticVerb";
import { BlockStructure } from "../structure/BlockStructure";
import { CollapseOutcome, CollapseResolver } from "../structure/CollapseResolver";
import { StructuralSolver } from "../structure/StructuralSolver";
import { Arena } from "./Arena";
import { AttackerController } from "./AttackerController";
import { AttackerKind, AttackerTable } from "./AttackerKind";
import { AttackerUnit } from "./AttackerUnit";
import { CombatLoadCase } from "./CombatLoadCase";
import { InputScript } from "./InputScript";
import { InputKind, Replay, ReplayRecorder } from "./ReplayRecorder";
import { RunEventKind } from "./RunEvent";
import { RunOutcome, RunResult } from "./RunResult";
import { TargetingSystem } from "./TargetingSystem";
import { WaveScript } from "./WaveScript";

/**
 * The run loop: five waves down one lane, fixed timestep, no wall clock and no entropy
 * beyond the seed (spec 4.5).
 *
 * The loop deliberately owns almost no rules. It moves attackers, routes their shots to
 * `DamageSystem`, lets `LogisticsSystem` decide who walks where, hands ignitions to
 * `FireSimulation`, and asks `CollapseResolver` what happened to the structure. Everything
 * a player could learn from is therefore decided by a system they can also inspect in the
 * editor.
 *
 * Structural analysis runs when the structure changes, when the recoil loading changes, or
 * after `structuralIntervalSeconds` -- because a solve is expensive (see
 * docs/structural-solver.md) and most ticks change nothing.
 */
export class RunSimulation {
  private readonly materials: MaterialTable;
  private readonly ammo: AmmoTable;
  private readonly weapons: WeaponTable;
  private readonly attackers: AttackerTable;
  private readonly dials: Dials;
  private readonly arena: Arena;

  public constructor(
    materials: MaterialTable,
    ammo: AmmoTable,
    weapons: WeaponTable,
    attackers: AttackerTable,
    dials: Dials,
    arena: Arena
  ) {
    this.materials = materials;
    this.ammo = ammo;
    this.weapons = weapons;
    this.attackers = attackers;
    this.dials = dials;
    this.arena = arena;
  }

  public static withDefaults(dials: Dials, arena: Arena): RunSimulation {
    const materials = MaterialTable.defaults();
    return new RunSimulation(
      materials,
      AmmoTable.defaults(materials),
      WeaponTable.defaults(dials.stationRackCapacity),
      AttackerTable.defaults(),
      dials,
      arena
    );
  }

  public run(
    blueprint: Blueprint,
    controller: AttackerController,
    script: WaveScript,
    inputs: InputScript,
    seed: number
  ): RunResult {
    const state = new RunState(
      this.materials,
      this.ammo,
      this.weapons,
      this.attackers,
      this.dials,
      this.arena,
      blueprint,
      seed
    );
    return state.execute(controller, script, inputs);
  }
}

/** Mutable state of one run. Split out so `RunSimulation` stays reusable and stateless. */
class RunState {
  private readonly materials: MaterialTable;
  private readonly ammo: AmmoTable;
  private readonly weapons: WeaponTable;
  private readonly attackerTable: AttackerTable;
  private readonly dials: Dials;
  private readonly arena: Arena;
  private readonly blueprint: Blueprint;
  private readonly seed: number;

  private readonly structure: BlockStructure;
  private readonly solver: StructuralSolver;
  private readonly collapse: CollapseResolver;
  private readonly fire: FireSimulation;
  private readonly damage: DamageSystem;
  private readonly logistics: LogisticsSystem;
  private readonly repair: RepairSystem;
  private readonly crew: CrewPool;
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

  public constructor(
    materials: MaterialTable,
    ammo: AmmoTable,
    weapons: WeaponTable,
    attackerTable: AttackerTable,
    dials: Dials,
    arena: Arena,
    blueprint: Blueprint,
    seed: number
  ) {
    this.materials = materials;
    this.ammo = ammo;
    this.weapons = weapons;
    this.attackerTable = attackerTable;
    this.dials = dials;
    this.arena = arena;
    this.blueprint = blueprint;
    this.seed = seed;

    this.structure = new BlockStructure(blueprint);
    this.solver = StructuralSolver.withDefaults(materials, dials);
    this.collapse = CollapseResolver.withDefaults(this.solver, materials, dials);
    this.fire = FireSimulation.withDefaults(materials);
    this.damage = DamageSystem.withDefaults(materials, ammo, this.fire, dials);
    this.logistics = new LogisticsSystem(ammo, dials);
    this.repair = new RepairSystem(materials, dials);
    this.crew = new CrewPool(dials.crewPool);
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
  }

  public execute(
    controller: AttackerController,
    script: WaveScript,
    inputs: InputScript
  ): RunResult {
    this.logistics.configure(this.structure, AmmoLoadId.SolidShot);
    this.assignCrew();

    let outcome = RunOutcome.Won;
    let wavesSurvived = 0;
    const waveCount = script.waveCount < this.dials.waveCount ? script.waveCount : this.dials.waveCount;

    for (let waveIndex = 0; waveIndex < waveCount; waveIndex++) {
      this.wave = waveIndex;
      const wave = script.waveAt(waveIndex);
      this.logistics.resupplyWindow(this.structure);
      controller.beginWave(waveIndex);
      this.units = [];
      this.recorder.record(this.time, waveIndex, RunEventKind.WaveBegan, waveIndex, -1, 0, wave.title);

      let waveTime = 0;
      let lost = false;
      while (waveTime < wave.durationSeconds) {
        const step = this.dials.tickSeconds;
        this.applyInputs(inputs);
        this.spawn(controller, waveTime, step);
        this.advanceAttackers(step);
        const firing = this.fireStations();
        this.advanceLogistics(step);
        this.advanceFire(step);
        this.checkStructure(firing);

        this.time += step;
        waveTime += step;

        if (!this.coreIntact()) {
          outcome = RunOutcome.CoreLost;
          this.recorder.record(this.time, waveIndex, RunEventKind.CoreDestroyed, -1, -1, 0, "");
          lost = true;
          break;
        }
        if (this.structure.aliveCount === 0) {
          outcome = RunOutcome.Wrecked;
          lost = true;
          break;
        }
        if (this.aliveUnitCount() === 0 && controller.isWaveExhausted(waveTime)) {
          break;
        }
      }

      this.recorder.record(
        this.time,
        waveIndex,
        RunEventKind.WaveEnded,
        waveIndex,
        -1,
        this.aliveUnitCount(),
        lost ? "broken off" : "cleared"
      );
      if (lost) {
        break;
      }
      wavesSurvived++;
      this.interWaveWindow();
    }

    this.recorder.record(
      this.time,
      this.wave,
      outcome === RunOutcome.Won ? RunEventKind.RunWon : RunEventKind.RunLost,
      -1,
      -1,
      wavesSurvived,
      ""
    );

    return new RunResult(
      outcome,
      wavesSurvived,
      this.buildReplay(),
      this.crewLost,
      this.crew.aliveCount,
      this.blueprint.blockCount - this.structure.aliveCount,
      this.structure.aliveCount,
      this.attackersDestroyed,
      this.shotsFired,
      this.totalDrySeconds(),
      this.lastLoadFactor,
      this.structuralSolves,
      this.time
    );
  }

  private buildReplay(): Replay {
    return this.recorder.build(this.seed, this.blueprint.name);
  }

  /** Spec 4.4: reassignment happens in the inter-wave window, from whoever is left. */
  private assignCrew(): void {
    const stations = this.structure.aliveOfKind(BlockKind.Station);
    const plan = AssignmentPlan.defaultFor(stations, this.crew.aliveCount, this.dials);
    this.crew.apply(plan, this.dials);
  }

  private applyInputs(inputs: InputScript): void {
    const due = inputs.drain(this.time);
    for (let i = 0; i < due.length; i++) {
      const input = due[i];
      this.recorder.recordInput(input);
      if (input.kind === InputKind.FocusTarget) {
        this.targeting.setFocus(input.value);
      } else if (input.kind === InputKind.ClearFocus) {
        this.targeting.clearFocus();
      } else {
        const supply = this.logistics.supplyOf(input.value);
        if (supply !== null) {
          supply.preferredLoad = input.secondary as AmmoLoadId;
        }
      }
    }
  }

  private spawn(controller: AttackerController, waveTime: number, step: number): void {
    const requests = controller.update(waveTime, step);
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
    const hitBlock = this.structure.indexAt(impact.cell);
    const result = this.damage.applyImpact(this.structure, impact);
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
      this.structure.isAlive(hitBlock) &&
      this.structure.kindOf(hitBlock) === BlockKind.Station &&
      this.ammo.get(kind.load).verb === DamageVerbId.Kinetic
    ) {
      const killed = this.crew.killAt([hitBlock]);
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
    const killedByBlast = this.crew.killAt(result.destroyedBlocks);
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
        this.structure,
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
    const bounds = this.structure.bounds;
    let bestZ = -1;
    let bestY = -1;
    for (let z = this.arena.pad.minZ; z <= this.arena.pad.maxZ; z++) {
      for (let y = bounds.min.y + bounds.size.y - 1; y >= bounds.min.y; y--) {
        if (this.structure.indexAt(new IVec3(laneX, y, z)) >= 0) {
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
    const stations = this.logistics.stationBlocks();
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      if (!this.structure.isAlive(station)) {
        continue;
      }
      const timer = this.reloadTimers.get(station);
      const remaining = timer === undefined ? 0 : timer - this.dials.tickSeconds;
      if (remaining > 0) {
        this.reloadTimers.set(station, remaining);
        continue;
      }
      this.reloadTimers.set(station, 0);

      const target = this.targeting.pickTarget(this.structure, this.arena, weapon, station, this.units);
      if (target === null) {
        continue;
      }
      if (!this.logistics.canFire(this.structure, this.crew, station)) {
        const supply = this.logistics.supplyOf(station);
        if (supply !== null && supply.rack.isEmpty) {
          this.recorder.record(this.time, this.wave, RunEventKind.StationDry, station, -1, 0, "");
        }
        continue;
      }
      const supply = this.logistics.supplyOf(station);
      const load = supply === null ? AmmoLoadId.SolidShot : supply.preferredLoad;
      if (!this.logistics.consumeShot(station)) {
        continue;
      }
      this.reloadTimers.set(station, weapon.reloadSeconds);
      this.shotsFired++;
      firing.push(station);
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
    const logisticsStep = this.logistics.update(this.structure, this.crew, step);
    const starved = logisticsStep.starvedStations;
    for (let i = 0; i < starved.length; i++) {
      this.recorder.record(this.time, this.wave, RunEventKind.StationStarved, starved[i], -1, 0, "");
    }
  }

  private advanceFire(step: number): void {
    const fireStep = this.fire.advance(this.structure, step);
    for (let i = 0; i < fireStep.spread.length; i++) {
      this.recorder.record(this.time, this.wave, RunEventKind.BlockIgnited, fireStep.spread[i], -1, 0, "spread");
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
    const killed = this.crew.killAt(fireStep.consumed);
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
      this.structure.version !== this.lastSolveVersion ||
      stamp !== this.lastLoadStamp ||
      this.time - this.lastSolveTime >= this.dials.structuralIntervalSeconds;
    if (!changed) {
      return;
    }
    this.lastSolveVersion = this.structure.version;
    this.lastLoadStamp = stamp;
    this.lastSolveTime = this.time;
    this.structuralSolves++;

    const outcome = this.collapse.resolve(this.structure, this.arena.pad, this.loadCase, this.time);
    this.recordCollapse(outcome);
    const factor = outcome.finalReport.loadFactor;
    if (RunState.marginCrossed(this.lastLoadFactor, factor)) {
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
    this.lastSolveVersion = this.structure.version;
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
      const killed = this.crew.killAt(event.destroyedBlocks);
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
    const outcome = this.repair.repair(this.structure, this.crew, this.dials.interWaveWindowSeconds);
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
    this.fire.prune(this.structure);
    this.assignCrew();
  }

  private coreIntact(): boolean {
    const cores = this.blueprint.indicesOfKind(BlockKind.Core);
    for (let i = 0; i < cores.length; i++) {
      if (this.structure.isAlive(cores[i])) {
        return true;
      }
    }
    return false;
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
    const stations = this.logistics.stationBlocks();
    for (let i = 0; i < stations.length; i++) {
      const supply = this.logistics.supplyOf(stations[i]);
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
