import { ArcSample } from "../editor/FiringArc";
import { Path } from "../path/Path";
import { StructuralStatus } from "../structure/StructuralReport";
import { ShotTrace } from "../sim/ShotTrace";
import { FieldDesign } from "./FieldDesign";

/**
 * A station's state, as the Run screen has to show it at a glance (UI spec 3.2).
 *
 * `NoPath` wins over `Dry` when both apply: an empty rack is a symptom, and a severed
 * corridor is the cause the tester can act on. Both get the loudest treatment in the
 * build -- a silent gun the tester does not notice reads as the game cheating.
 */
export enum StationStatus {
  Firing = 0,
  Reloading = 1,
  Dry = 2,
  Unmanned = 3,
  NoPath = 4,
}

export function stationStatusName(status: StationStatus): string {
  if (status === StationStatus.Firing) {
    return "firing";
  }
  if (status === StationStatus.Reloading) {
    return "reloading";
  }
  if (status === StationStatus.Dry) {
    return "dry";
  }
  if (status === StationStatus.Unmanned) {
    return "unmanned";
  }
  return "no path";
}

/** True for the two states that mean "this gun is not shooting and you should know". */
export function isLoudStatus(status: StationStatus): boolean {
  return status === StationStatus.Dry || status === StationStatus.NoPath;
}

export class StationSnapshot {
  public readonly block: number;
  public readonly status: StationStatus;
  public readonly rackRounds: number;
  public readonly rackWeight: number;
  public readonly rackCapacity: number;
  public readonly drySeconds: number;
  public readonly nearestDepot: number;
  public readonly roundTripSeconds: number;
  public readonly arcClearFraction: number;
  /** Crew id manning it, or -1. */
  public readonly gunner: number;
  public readonly gunnerAway: boolean;
  public readonly reloadRemaining: number;
  public readonly firedThisTick: boolean;
  public readonly depotPath: Path | null;
  public readonly preferredLoad: number;
  /** The sampled arc rays and what stopped each one. Drives overlay 5. */
  public readonly arcSamples: readonly ArcSample[];

  public constructor(
    block: number,
    status: StationStatus,
    rackRounds: number,
    rackWeight: number,
    rackCapacity: number,
    drySeconds: number,
    nearestDepot: number,
    roundTripSeconds: number,
    arcClearFraction: number,
    gunner: number,
    gunnerAway: boolean,
    reloadRemaining: number,
    firedThisTick: boolean,
    depotPath: Path | null,
    preferredLoad: number,
    arcSamples: readonly ArcSample[]
  ) {
    this.block = block;
    this.status = status;
    this.rackRounds = rackRounds;
    this.rackWeight = rackWeight;
    this.rackCapacity = rackCapacity;
    this.drySeconds = drySeconds;
    this.nearestDepot = nearestDepot;
    this.roundTripSeconds = roundTripSeconds;
    this.arcClearFraction = arcClearFraction;
    this.gunner = gunner;
    this.gunnerAway = gunnerAway;
    this.reloadRemaining = reloadRemaining;
    this.firedThisTick = firedThisTick;
    this.depotPath = depotPath;
    this.preferredLoad = preferredLoad;
    this.arcSamples = arcSamples;
  }
}

export class DepotSnapshot {
  public readonly block: number;
  public readonly rounds: number;
  public readonly weight: number;
  public readonly capacity: number;
  /**
   * Voxels to the nearest other live depot. Inside the cook-off blast radius means one
   * penetrating round takes both, which is the expensive half of "depot dispersal is
   * two-sided" (spec 4.3).
   */
  public readonly chainDistance: number;

  public constructor(
    block: number,
    rounds: number,
    weight: number,
    capacity: number,
    chainDistance: number
  ) {
    this.block = block;
    this.rounds = rounds;
    this.weight = weight;
    this.capacity = capacity;
    this.chainDistance = chainDistance;
  }

  public get fillFraction(): number {
    return this.capacity > 0 ? this.weight / this.capacity : 0;
  }
}

export class CrewSnapshot {
  public readonly id: number;
  public readonly role: number;
  /** Interpolated world position, in voxel units. */
  public readonly x: number;
  public readonly y: number;
  public readonly z: number;
  /** Ammo load being carried, or -1 for empty-handed. */
  public readonly carrying: number;
  public readonly awayOnTrip: boolean;
  public readonly station: number;

  public constructor(
    id: number,
    role: number,
    x: number,
    y: number,
    z: number,
    carrying: number,
    awayOnTrip: boolean,
    station: number
  ) {
    this.id = id;
    this.role = role;
    this.x = x;
    this.y = y;
    this.z = z;
    this.carrying = carrying;
    this.awayOnTrip = awayOnTrip;
    this.station = station;
  }
}

export class AttackerSnapshot {
  public readonly id: number;
  public readonly kindName: string;
  public readonly laneX: number;
  public readonly laneZ: number;
  public readonly hpFraction: number;
  public readonly engaged: boolean;
  public readonly focused: boolean;

  public constructor(
    id: number,
    kindName: string,
    laneX: number,
    laneZ: number,
    hpFraction: number,
    engaged: boolean,
    focused: boolean
  ) {
    this.id = id;
    this.kindName = kindName;
    this.laneX = laneX;
    this.laneZ = laneZ;
    this.hpFraction = hpFraction;
    this.engaged = engaged;
    this.focused = focused;
  }
}

/**
 * The joint graph's drawable state.
 *
 * Held as parallel typed arrays and shared by reference between consecutive frames whose
 * analysis has not changed. The structure re-solves a few dozen times in a five-wave run
 * and there are five thousand ticks, so almost every frame shares its predecessor's field.
 */
export class JointField {
  public readonly low: Int32Array;
  public readonly high: Int32Array;
  public readonly utilization: Float32Array;
  /** 1 for joints in the failure mechanism at the collapse load. */
  public readonly critical: Uint8Array;
  /** 1 for joints at or above the predictive threshold: what to look at now. */
  public readonly predictive: Uint8Array;
  /** Structure version and load stamp the field came from, so frames can share it. */
  public readonly stamp: number;

  public constructor(
    low: Int32Array,
    high: Int32Array,
    utilization: Float32Array,
    critical: Uint8Array,
    predictive: Uint8Array,
    stamp: number
  ) {
    this.low = low;
    this.high = high;
    this.utilization = utilization;
    this.critical = critical;
    this.predictive = predictive;
    this.stamp = stamp;
  }

  public static empty(): JointField {
    return new JointField(
      new Int32Array(0),
      new Int32Array(0),
      new Float32Array(0),
      new Uint8Array(0),
      new Uint8Array(0),
      -1
    );
  }

  public get count(): number {
    return this.low.length;
  }
}

const BLOCK_ALIVE: number = 1;
const BLOCK_BURNING: number = 2;

/**
 * One tick, as everything downstream of the simulation reads it.
 *
 * This is the `Readonly<SimState>` of UI spec 5.1: the renderer reads it and never writes
 * to it, and the same type serves the editor (a frame with no run in it), the live run and
 * the replay. That is what makes "overlays work in replay exactly as in design and run,
 * same code path" true rather than aspirational.
 */
export class FieldFrame {
  public readonly design: FieldDesign;
  public readonly tick: number;
  public readonly timeSeconds: number;
  public readonly wave: number;
  public readonly waveElapsed: number;
  public readonly waveDuration: number;
  /** Bit flags per block: alive, burning. */
  private readonly blockState: Uint8Array;
  /** Damage taken as a fraction of material integrity, quantised to a byte. */
  private readonly blockDamage: Uint8Array;
  public readonly joints: JointField;
  public readonly loadFactor: number;
  public readonly tippingMargin: number;
  public readonly structuralStatus: StructuralStatus;
  public readonly stations: readonly StationSnapshot[];
  public readonly depots: readonly DepotSnapshot[];
  public readonly crew: readonly CrewSnapshot[];
  public readonly attackers: readonly AttackerSnapshot[];
  /**
   * Rounds that flew on this tick, in both directions (isometric renderer spec 7.5).
   *
   * A shot resolves in the tick it is fired, so this is what makes a shot drawable at all --
   * and drawable along the path the damage actually took rather than as a flash beside it.
   */
  public readonly shots: readonly ShotTrace[];
  /** Events recorded up to and including this tick, as a count into the run's log. */
  public readonly eventCount: number;
  public readonly aliveBlocks: number;
  public readonly crewAlive: number;

  public constructor(
    design: FieldDesign,
    tick: number,
    timeSeconds: number,
    wave: number,
    waveElapsed: number,
    waveDuration: number,
    blockState: Uint8Array,
    blockDamage: Uint8Array,
    joints: JointField,
    loadFactor: number,
    tippingMargin: number,
    structuralStatus: StructuralStatus,
    stations: readonly StationSnapshot[],
    depots: readonly DepotSnapshot[],
    crew: readonly CrewSnapshot[],
    attackers: readonly AttackerSnapshot[],
    shots: readonly ShotTrace[],
    eventCount: number,
    aliveBlocks: number,
    crewAlive: number
  ) {
    this.design = design;
    this.tick = tick;
    this.timeSeconds = timeSeconds;
    this.wave = wave;
    this.waveElapsed = waveElapsed;
    this.waveDuration = waveDuration;
    this.blockState = blockState;
    this.blockDamage = blockDamage;
    this.joints = joints;
    this.loadFactor = loadFactor;
    this.tippingMargin = tippingMargin;
    this.structuralStatus = structuralStatus;
    this.stations = stations;
    this.depots = depots;
    this.crew = crew;
    this.attackers = attackers;
    this.shots = shots;
    this.eventCount = eventCount;
    this.aliveBlocks = aliveBlocks;
    this.crewAlive = crewAlive;
  }

  public get blockCount(): number {
    return this.blockState.length;
  }

  public isAlive(block: number): boolean {
    return (this.blockState[block] & BLOCK_ALIVE) !== 0;
  }

  public isBurning(block: number): boolean {
    return (this.blockState[block] & BLOCK_BURNING) !== 0;
  }

  /** 0 = untouched, 1 = about to break. */
  public damageFraction(block: number): number {
    return this.blockDamage[block] / 255;
  }

  public static packState(alive: boolean, burning: boolean): number {
    return (alive ? BLOCK_ALIVE : 0) | (burning ? BLOCK_BURNING : 0);
  }

  /**
   * The live block in a cell, or -1.
   *
   * The isometric composition asks this three or four times per cell (isometric renderer
   * spec 3), so it takes coordinates rather than a position and allocates nothing.
   */
  public liveBlockAt(x: number, y: number, z: number): number {
    const index = this.design.blueprint.indexOfCell(x, y, z);
    if (index < 0) {
      return -1;
    }
    return this.isAlive(index) ? index : -1;
  }

  public depotAt(block: number): DepotSnapshot | null {
    for (let i = 0; i < this.depots.length; i++) {
      if (this.depots[i].block === block) {
        return this.depots[i];
      }
    }
    return null;
  }

  /** Highest joint utilization in the frame. The headline number of the stress overlay. */
  public maxUtilization(): number {
    let peak = 0;
    for (let j = 0; j < this.joints.count; j++) {
      const value = this.joints.utilization[j];
      if (value > peak) {
        peak = value;
      }
    }
    return peak;
  }

  /** Utilization of the worst joint touching a block; -1 when it has none. */
  public utilizationAtBlock(block: number): number {
    let peak = -1;
    for (let j = 0; j < this.joints.count; j++) {
      if (this.joints.low[j] === block || this.joints.high[j] === block) {
        const value = this.joints.utilization[j];
        if (value > peak) {
          peak = value;
        }
      }
    }
    return peak;
  }
}
