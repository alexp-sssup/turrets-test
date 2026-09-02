import { IVec3 } from "../core/IVec3";
import { AmmoLoadId } from "../materials/AmmoTable";
import { BlockKind } from "../blueprint/BlockKind";
import { CrewRole } from "../crew/CrewMember";
import { SupplyTrip, TripPhase } from "../crew/LogisticsSystem";
import { ArcSample, FiringArc } from "../editor/FiringArc";
import { GeometryReport } from "../editor/GeometryReport";
import { Path } from "../path/Path";
import { RunLoop, RunPhase } from "../sim/RunLoop";
import { BlockStructure } from "../structure/BlockStructure";
import { StructuralReport, StructuralStatus } from "../structure/StructuralReport";
import { FieldDesign } from "./FieldDesign";
import {
  AttackerSnapshot,
  CrewSnapshot,
  DepotSnapshot,
  FieldFrame,
  JointField,
  StationSnapshot,
  StationStatus,
} from "./FieldFrame";

/**
 * Turns simulation state into a frame the renderer can draw.
 *
 * This is the only place that reads the live systems, and it reads them without writing to
 * any of them. Everything downstream -- five overlay layers, the panels, the replay
 * timeline, the telemetry -- sees frames and nothing else, which is why adding an overlay
 * cannot accidentally reach into the simulation.
 */
export class FrameBuilder {
  private readonly design: FieldDesign;
  private lastJointField: JointField;
  private lastJointStamp: number;

  public constructor(design: FieldDesign) {
    this.design = design;
    this.lastJointField = JointField.empty();
    this.lastJointStamp = -1;
  }

  /**
   * A frame for the current tick of a live run.
   *
   * The joint field is shared with the previous frame when the analysis behind it has not
   * been redone, which is the common case: a five-wave run solves a hundred-odd times
   * across five thousand ticks.
   */
  public fromRun(loop: RunLoop): FieldFrame {
    const structure = loop.structure;
    const report = loop.lastReport;
    const stamp = report === null ? -1 : structure.version * 1000003 + loop.solveCount;
    let joints = this.lastJointField;
    if (stamp !== this.lastJointStamp) {
      joints = FrameBuilder.jointFieldOf(report, this.design.dials.predictiveThreshold, stamp);
      this.lastJointField = joints;
      this.lastJointStamp = stamp;
    }

    const state = new Uint8Array(structure.blockCount);
    const damage = new Uint8Array(structure.blockCount);
    for (let i = 0; i < structure.blockCount; i++) {
      const alive = structure.isAlive(i);
      state[i] = FieldFrame.packState(alive, loop.fire.isBurning(i));
      damage[i] = FrameBuilder.damageByte(structure, i, this.design);
    }

    return new FieldFrame(
      this.design,
      loop.tick,
      loop.timeSeconds,
      loop.waveIndex,
      loop.waveElapsed,
      loop.waveDuration,
      state,
      damage,
      joints,
      report === null ? Number.POSITIVE_INFINITY : report.loadFactor,
      report === null ? Number.POSITIVE_INFINITY : report.tippingMargin,
      report === null ? StructuralStatus.Sound : report.status,
      this.stationsOf(loop),
      this.depotsOf(loop),
      this.crewOf(loop),
      this.attackersOf(loop),
      loop.eventCount,
      structure.aliveCount,
      loop.crew.aliveCount
    );
  }

  /**
   * A frame for the editor: the design at rest, with whatever analysis has landed.
   *
   * There is no run behind it, so there are no attackers and no crew on the field. Station
   * rows carry the editor's own answer to the question the Run screen asks with a status
   * light -- can this gun see out, and can anybody get it ammunition.
   */
  public fromDesign(
    structure: BlockStructure,
    report: StructuralReport | null,
    geometry: GeometryReport | null
  ): FieldFrame {
    const stamp = report === null ? -1 : structure.version * 1000003 + report.jointCount + 7;
    let joints = this.lastJointField;
    if (stamp !== this.lastJointStamp) {
      joints = FrameBuilder.jointFieldOf(report, this.design.dials.predictiveThreshold, stamp);
      this.lastJointField = joints;
      this.lastJointStamp = stamp;
    }

    const state = new Uint8Array(structure.blockCount);
    const damage = new Uint8Array(structure.blockCount);
    for (let i = 0; i < structure.blockCount; i++) {
      state[i] = FieldFrame.packState(structure.isAlive(i), false);
      damage[i] = FrameBuilder.damageByte(structure, i, this.design);
    }

    const stations: StationSnapshot[] = [];
    const stationBlocks = structure.aliveOfKind(BlockKind.Station);
    for (let i = 0; i < stationBlocks.length; i++) {
      const block = stationBlocks[i];
      const readout = geometry === null ? null : geometry.readoutOf(block);
      const hasRoute = readout !== null && readout.hasDepotRoute;
      const samples = FiringArc.samples(
        structure,
        block,
        structure.blueprint.blockAt(block).facing,
        this.design.gun.arcHalfAngle,
        this.design.gun.range
      );
      stations.push(
        new StationSnapshot(
          block,
          hasRoute ? StationStatus.Reloading : StationStatus.NoPath,
          0,
          0,
          this.design.dials.stationRackCapacity,
          0,
          readout === null ? -1 : readout.nearestDepot,
          readout === null ? Number.POSITIVE_INFINITY : readout.roundTripSeconds,
          FrameBuilder.clearFractionOf(samples),
          -1,
          false,
          0,
          false,
          readout === null ? null : readout.depotPath,
          AmmoLoadId.SolidShot as number,
          samples
        )
      );
    }

    const depots: DepotSnapshot[] = [];
    const depotBlocks = structure.aliveOfKind(BlockKind.Depot);
    for (let i = 0; i < depotBlocks.length; i++) {
      depots.push(
        new DepotSnapshot(
          depotBlocks[i],
          0,
          this.design.dials.depotCapacity,
          this.design.dials.depotCapacity,
          FrameBuilder.chainDistance(structure, depotBlocks[i], depotBlocks)
        )
      );
    }

    return new FieldFrame(
      this.design,
      0,
      0,
      -1,
      0,
      0,
      state,
      damage,
      joints,
      report === null ? Number.POSITIVE_INFINITY : report.loadFactor,
      report === null ? Number.POSITIVE_INFINITY : report.tippingMargin,
      report === null ? StructuralStatus.Sound : report.status,
      stations,
      depots,
      [],
      [],
      0,
      structure.aliveCount,
      this.design.dials.crewPool
    );
  }

  // ---------------------------------------------------------------- pieces

  private static jointFieldOf(
    report: StructuralReport | null,
    predictiveThreshold: number,
    stamp: number
  ): JointField {
    if (report === null) {
      return JointField.empty();
    }
    const count = report.jointCount;
    const low = new Int32Array(count);
    const high = new Int32Array(count);
    const utilization = new Float32Array(count);
    const critical = new Uint8Array(count);
    const predictive = new Uint8Array(count);
    for (let j = 0; j < count; j++) {
      const joint = report.joints.jointAt(j);
      low[j] = joint.blockLow;
      high[j] = joint.blockHigh;
      const value = report.utilization(j);
      utilization[j] = value;
      predictive[j] = value >= predictiveThreshold ? 1 : 0;
    }
    const criticalJoints = report.criticalJoints;
    for (let i = 0; i < criticalJoints.length; i++) {
      critical[criticalJoints[i]] = 1;
    }
    return new JointField(low, high, utilization, critical, predictive, stamp);
  }

  private static damageByte(structure: BlockStructure, block: number, design: FieldDesign): number {
    const integrity = design.materials.get(structure.materialOf(block)).integrity;
    if (integrity <= 0) {
      return 0;
    }
    const fraction = structure.damageOf(block) / integrity;
    const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    return Math.round(clamped * 255);
  }

  private stationsOf(loop: RunLoop): StationSnapshot[] {
    const snapshots: StationSnapshot[] = [];
    const structure = loop.structure;
    const blocks = loop.logistics.stationBlocks();
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!structure.isAlive(block)) {
        continue;
      }
      const supply = loop.logistics.supplyOf(block);
      const gunner = loop.crew.gunnerAt(block);
      const rackRounds = supply === null ? 0 : supply.rack.countOf(supply.preferredLoad);
      const starved = supply !== null && supply.starved;
      const fired = FrameBuilder.contains(loop.firingThisTick, block);
      let status: StationStatus;
      if (loop.phase === RunPhase.Ready || loop.phase === RunPhase.BetweenWaves) {
        // No wave is on the lane, and the racks are filled by the resupply window when one
        // opens -- so between waves an empty rack says nothing about the design. Shouting
        // DRY at a tester who is choosing their next allocation, or who has not pressed
        // start at all, would be a lie about their blueprint.
        status = StationStatus.Reloading;
      } else if (starved) {
        status = StationStatus.NoPath;
      } else if (rackRounds <= 0) {
        status = StationStatus.Dry;
      } else if (gunner === null || gunner.awayOnTrip) {
        status = StationStatus.Unmanned;
      } else if (fired) {
        status = StationStatus.Firing;
      } else {
        status = StationStatus.Reloading;
      }
      const path = supply === null ? null : supply.depotPath;
      const samples = FiringArc.samples(
        structure,
        block,
        structure.blueprint.blockAt(block).facing,
        this.design.gun.arcHalfAngle,
        this.design.gun.range
      );
      snapshots.push(
        new StationSnapshot(
          block,
          status,
          rackRounds,
          supply === null ? 0 : supply.rack.weight,
          supply === null ? 0 : supply.rack.capacity,
          supply === null ? 0 : supply.drySeconds,
          supply === null ? -1 : supply.nearestDepot,
          path === null
            ? Number.POSITIVE_INFINITY
            : path.roundTripDuration(this.design.dials.crewWalkSpeed) +
              2 * this.design.dials.handlingSeconds,
          FrameBuilder.clearFractionOf(samples),
          gunner === null ? -1 : gunner.id,
          gunner !== null && gunner.awayOnTrip,
          loop.reloadRemaining(block),
          fired,
          path,
          supply === null ? (AmmoLoadId.SolidShot as number) : (supply.preferredLoad as number),
          samples
        )
      );
    }
    return snapshots;
  }

  private depotsOf(loop: RunLoop): DepotSnapshot[] {
    const snapshots: DepotSnapshot[] = [];
    const structure = loop.structure;
    const blocks = structure.aliveOfKind(BlockKind.Depot);
    for (let i = 0; i < blocks.length; i++) {
      const store = loop.logistics.depotStoreOf(blocks[i]);
      snapshots.push(
        new DepotSnapshot(
          blocks[i],
          store === null ? 0 : store.totalRounds,
          store === null ? 0 : store.weight,
          store === null ? this.design.dials.depotCapacity : store.capacity,
          FrameBuilder.chainDistance(structure, blocks[i], blocks)
        )
      );
    }
    return snapshots;
  }

  /**
   * Where every living crew member is.
   *
   * A trip is a phase and a timer rather than a walker, so a position has to be
   * reconstructed from it -- interpolated along the same cached path the editor draws and
   * the pathfinder produced. That is deliberate: what the tester watches walking down the
   * corridor is the route the simulation actually costed, so when the corridor is cut the
   * runner visibly stops using it.
   */
  private crewOf(loop: RunLoop): CrewSnapshot[] {
    const snapshots: CrewSnapshot[] = [];
    const structure = loop.structure;
    const parkAt = FrameBuilder.parkingCell(structure);
    let parked = 0;
    for (let id = 0; id < loop.crew.size; id++) {
      const member = loop.crew.memberAt(id);
      if (!member.alive) {
        continue;
      }
      const trip = FrameBuilder.tripOf(loop, id);
      if (trip !== null) {
        const supply = loop.logistics.supplyOf(trip.station);
        const path = supply === null ? null : supply.depotPath;
        const along = FrameBuilder.tripProgress(trip);
        const carrying =
          trip.phase === TripPhase.Inbound || trip.phase === TripPhase.Unloading
            ? (trip.load as number)
            : -1;
        const cell = FrameBuilder.pointOnPath(path, along, structure, trip.station);
        snapshots.push(
          new CrewSnapshot(id, member.role as number, cell.x, cell.y, cell.z, carrying, true, trip.station)
        );
        continue;
      }
      if (member.role === CrewRole.Gunner && member.stationedAt >= 0) {
        const cell = FrameBuilder.stationCell(loop, member.stationedAt, structure);
        snapshots.push(
          new CrewSnapshot(
            id,
            member.role as number,
            cell.x,
            cell.y,
            cell.z,
            -1,
            false,
            member.stationedAt
          )
        );
        continue;
      }
      // Repair details, spare runners and the unassigned wait by the hatch. They are not
      // simulated as walkers, so showing them anywhere more specific would be a lie.
      snapshots.push(
        new CrewSnapshot(
          id,
          member.role as number,
          parkAt.x,
          parkAt.y + 0.05 * (parked % 3),
          parkAt.z + 0.28 * (parked % 4) - 0.4,
          -1,
          false,
          -1
        )
      );
      parked++;
    }
    return snapshots;
  }

  private attackersOf(loop: RunLoop): AttackerSnapshot[] {
    const snapshots: AttackerSnapshot[] = [];
    const units = loop.attackerUnits;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit.alive) {
        continue;
      }
      const kind = loop.attackerKinds.get(unit.kind);
      snapshots.push(
        new AttackerSnapshot(
          unit.id,
          kind.name,
          unit.laneX,
          unit.laneZ,
          kind.hitPoints > 0 ? unit.hitPoints / kind.hitPoints : 0,
          unit.engaged,
          loop.focusedTarget === unit.id
        )
      );
    }
    return snapshots;
  }

  private static tripOf(loop: RunLoop, crewId: number): SupplyTrip | null {
    for (let i = 0; i < loop.logistics.activeTripCount; i++) {
      const trip = loop.logistics.tripAt(i);
      if (trip.crewId === crewId) {
        return trip;
      }
    }
    return null;
  }

  /** 0 at the station, 1 at the depot. */
  private static tripProgress(trip: SupplyTrip): number {
    if (trip.legSeconds <= 0) {
      return trip.phase === TripPhase.Outbound || trip.phase === TripPhase.Loading ? 1 : 0;
    }
    const fraction = trip.timer / trip.legSeconds;
    const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
    if (trip.phase === TripPhase.Outbound) {
      return 1 - clamped;
    }
    if (trip.phase === TripPhase.Loading) {
      return 1;
    }
    if (trip.phase === TripPhase.Inbound) {
      return clamped;
    }
    return 0;
  }

  private static pointOnPath(
    path: Path | null,
    along: number,
    structure: BlockStructure,
    fallbackBlock: number
  ): CellPoint {
    if (path === null || path.cellCount === 0) {
      const position = structure.positionOf(fallbackBlock);
      return new CellPoint(position.x, position.y, position.z);
    }
    const steps = path.stepCount;
    if (steps === 0) {
      const only = path.cellAt(0);
      return new CellPoint(only.x, only.y, only.z);
    }
    const exact = along * steps;
    let index = Math.floor(exact);
    if (index < 0) {
      index = 0;
    }
    if (index >= steps) {
      index = steps - 1;
    }
    const fraction = exact - index;
    const a = path.cellAt(index);
    const b = path.cellAt(index + 1);
    return new CellPoint(
      a.x + (b.x - a.x) * fraction,
      a.y + (b.y - a.y) * fraction,
      a.z + (b.z - a.z) * fraction
    );
  }

  /** Where a gunner stands: the crew cell its route starts from, else the station itself. */
  private static stationCell(loop: RunLoop, station: number, structure: BlockStructure): CellPoint {
    const supply = loop.logistics.supplyOf(station);
    if (supply !== null && supply.depotPath !== null) {
      const start = supply.depotPath.start;
      return new CellPoint(start.x, start.y, start.z);
    }
    const position = structure.positionOf(station);
    return new CellPoint(position.x, position.y, position.z);
  }

  private static parkingCell(structure: BlockStructure): CellPoint {
    const hatches = structure.aliveOfKind(BlockKind.Hatch);
    if (hatches.length > 0) {
      const position = structure.positionOf(hatches[0]);
      return new CellPoint(position.x, position.y, position.z);
    }
    const bounds = structure.blueprint.bounds;
    return new CellPoint(bounds.min.x, bounds.min.y, bounds.min.z);
  }

  /** Chebyshev distance to the nearest other depot, or Infinity when it stands alone. */
  private static chainDistance(
    structure: BlockStructure,
    depot: number,
    depots: readonly number[]
  ): number {
    const here = structure.positionOf(depot);
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < depots.length; i++) {
      if (depots[i] === depot) {
        continue;
      }
      const other = structure.positionOf(depots[i]);
      const distance = FrameBuilder.chebyshev(here, other);
      if (distance < best) {
        best = distance;
      }
    }
    return best;
  }

  private static chebyshev(a: IVec3, b: IVec3): number {
    const dx = a.x > b.x ? a.x - b.x : b.x - a.x;
    const dy = a.y > b.y ? a.y - b.y : b.y - a.y;
    const dz = a.z > b.z ? a.z - b.z : b.z - a.z;
    let best = dx;
    if (dy > best) {
      best = dy;
    }
    if (dz > best) {
      best = dz;
    }
    return best;
  }

  /** Same number the validation panel prints, derived from the same walk. */
  private static clearFractionOf(samples: readonly ArcSample[]): number {
    if (samples.length === 0) {
      return 0;
    }
    let clear = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].clear) {
        clear++;
      }
    }
    return clear / samples.length;
  }

  private static contains(values: readonly number[], value: number): boolean {
    for (let i = 0; i < values.length; i++) {
      if (values[i] === value) {
        return true;
      }
    }
    return false;
  }
}

/** A world position that need not sit on a voxel centre, because a walker is between cells. */
export class CellPoint {
  public readonly x: number;
  public readonly y: number;
  public readonly z: number;

  public constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}
