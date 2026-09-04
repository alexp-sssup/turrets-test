import { Dials } from "../config/Dials";
import { AmmoLoadId, AmmoTable } from "../materials/AmmoTable";
import { BlockKind } from "../blueprint/BlockKind";
import { AStar } from "../path/AStar";
import { Path } from "../path/Path";
import { SupportSurface } from "../structure/SupportSurface";
import { WalkGraph } from "../path/WalkGraph";
import { BlockStructure } from "../structure/BlockStructure";
import { AmmoStore } from "./AmmoStore";
import { CrewMember, CrewRole } from "./CrewMember";
import { CrewPool } from "./CrewPool";

export enum TripPhase {
  /** Walking from the station to the depot. */
  Outbound = 0,
  Loading = 1,
  /** Walking back with the load. */
  Inbound = 2,
  Unloading = 3,
}

/** One resupply run in progress. Ammunition does not teleport (spec 4.3). */
export class SupplyTrip {
  public readonly crewId: number;
  public readonly station: number;
  public readonly depot: number;
  public readonly load: AmmoLoadId;
  public readonly rounds: number;
  /** True when the gunner went himself, so the gun is silent until he is back. */
  public readonly byGunner: boolean;
  public phase: TripPhase;
  public timer: number;
  public readonly legSeconds: number;

  public constructor(
    crewId: number,
    station: number,
    depot: number,
    load: AmmoLoadId,
    rounds: number,
    byGunner: boolean,
    legSeconds: number
  ) {
    this.crewId = crewId;
    this.station = station;
    this.depot = depot;
    this.load = load;
    this.rounds = rounds;
    this.byGunner = byGunner;
    this.phase = TripPhase.Outbound;
    this.timer = legSeconds;
    this.legSeconds = legSeconds;
  }
}

/** A station's ready rack and its supply situation. */
export class StationSupply {
  public readonly block: number;
  public readonly rack: AmmoStore;
  public preferredLoad: AmmoLoadId;
  /** True when no traversable route to any depot exists. */
  public starved: boolean;
  /** Seconds the station has spent unable to fire for want of ammunition. */
  public drySeconds: number;
  public depotPath: Path | null;
  public nearestDepot: number;

  public constructor(block: number, rack: AmmoStore, preferredLoad: AmmoLoadId) {
    this.block = block;
    this.rack = rack;
    this.preferredLoad = preferredLoad;
    this.starved = false;
    this.drySeconds = 0;
    this.depotPath = null;
    this.nearestDepot = -1;
  }
}

/** What one logistics update did. */
export class LogisticsStep {
  public readonly tripsStarted: number;
  public readonly tripsCompleted: number;
  public readonly roundsDelivered: number;
  private readonly newlyStarved: number[];

  public constructor(
    tripsStarted: number,
    tripsCompleted: number,
    roundsDelivered: number,
    newlyStarved: number[]
  ) {
    this.tripsStarted = tripsStarted;
    this.tripsCompleted = tripsCompleted;
    this.roundsDelivered = roundsDelivered;
    this.newlyStarved = newlyStarved;
  }

  /** Stations that lost their route to a depot during this update. */
  public get starvedStations(): readonly number[] {
    return this.newlyStarved;
  }
}

/**
 * Spec 4.3, simulated rather than abstracted: "ammunition does not teleport. It is carried,
 * by a crew member, along a path, and the path can be cut."
 *
 * The three consequences the spec asks this to produce, and where each one comes from:
 *
 * * **Burst and lull, not a flat multiplier.** A station fires from its rack; when the rack
 *   drops below the refill threshold somebody walks. Rate of fire is therefore a rhythm set
 *   by haul distance.
 * * **Severing a corridor silences a gun without destroying it.** If the pathfinder cannot
 *   reach a depot the station is marked starved, fires its rack dry and falls silent. No
 *   coefficient anywhere -- the structural sim bites the weapon system directly.
 * * **Depot dispersal is two-sided.** Nothing here enforces that; it falls out of trip
 *   length against the cook-off radius in `DamageSystem`.
 *
 * Dispatch is by ascending station index and then ascending crew id, and every route comes
 * from the deterministic pathfinder, so a run reproduces (spec 4.5).
 */
export class LogisticsSystem {
  private readonly ammo: AmmoTable;
  private readonly dials: Dials;
  private readonly surface: SupportSurface;
  private readonly supplies: Map<number, StationSupply>;
  private readonly depots: Map<number, AmmoStore>;
  private trips: SupplyTrip[];
  private graph: WalkGraph | null;
  private pathfinder: AStar | null;
  private graphVersion: number;

  /**
   * The surface is the pad: standable-ground spec 2 lets crew walk on it and on its apron,
   * so a runner's route may leave the turret through one opening and come back in through
   * another.
   */
  public constructor(ammo: AmmoTable, dials: Dials, surface: SupportSurface) {
    this.ammo = ammo;
    this.dials = dials;
    this.surface = surface;
    this.supplies = new Map<number, StationSupply>();
    this.depots = new Map<number, AmmoStore>();
    this.trips = [];
    this.graph = null;
    this.pathfinder = null;
    this.graphVersion = -1;
  }

  /** Creates a rack for every station and a store for every depot in the design. */
  public configure(structure: BlockStructure, defaultLoad: AmmoLoadId): void {
    this.supplies.clear();
    this.depots.clear();
    this.trips = [];
    const stations = structure.aliveOfKind(BlockKind.Station);
    for (let i = 0; i < stations.length; i++) {
      this.supplies.set(
        stations[i],
        new StationSupply(stations[i], new AmmoStore(this.dials.stationRackCapacity, this.ammo), defaultLoad)
      );
    }
    const depots = structure.aliveOfKind(BlockKind.Depot);
    for (let i = 0; i < depots.length; i++) {
      this.depots.set(depots[i], new AmmoStore(this.dials.depotCapacity, this.ammo));
    }
  }

  public stationBlocks(): number[] {
    const blocks: number[] = [];
    this.supplies.forEach((_supply: StationSupply, block: number): void => {
      blocks.push(block);
    });
    blocks.sort((a: number, b: number): number => a - b);
    return blocks;
  }

  public supplyOf(station: number): StationSupply | null {
    const supply = this.supplies.get(station);
    return supply === undefined ? null : supply;
  }

  public depotStoreOf(depot: number): AmmoStore | null {
    const store = this.depots.get(depot);
    return store === undefined ? null : store;
  }

  public get activeTripCount(): number {
    return this.trips.length;
  }

  public tripAt(index: number): SupplyTrip {
    return this.trips[index];
  }

  /**
   * Spec 4.3: "depots refill for free during the inter-wave window." Racks are topped up
   * too, on the grounds that thirty seconds is plenty of time to walk a turret's corridors
   * -- the interesting hauling is the kind that happens under fire.
   */
  public resupplyWindow(structure: BlockStructure): void {
    this.trips = [];
    const depots = this.sortedKeys(this.depots);
    for (let i = 0; i < depots.length; i++) {
      const store = this.depots.get(depots[i]) as AmmoStore;
      store.clear();
      if (structure.isAlive(depots[i])) {
        // Split the depot evenly between the two loads by weight.
        store.add(AmmoLoadId.SolidShot, Math.floor(store.roomFor(AmmoLoadId.SolidShot) / 2));
        store.fill(AmmoLoadId.Firepot);
      }
    }
    const stations = this.stationBlocks();
    for (let i = 0; i < stations.length; i++) {
      const supply = this.supplies.get(stations[i]) as StationSupply;
      supply.drySeconds = 0;
      if (!structure.isAlive(stations[i])) {
        continue;
      }
      const source = this.nearestStockedDepot(structure, supply);
      if (source < 0) {
        continue;
      }
      const store = this.depots.get(source) as AmmoStore;
      const wanted = supply.rack.roomFor(supply.preferredLoad);
      const taken = store.remove(supply.preferredLoad, wanted);
      const stowed = supply.rack.add(supply.preferredLoad, taken);
      if (stowed < taken) {
        store.add(supply.preferredLoad, taken - stowed);
      }
    }
  }

  /** True when the station has a round of its load and somebody there to fire it. */
  public canFire(structure: BlockStructure, crew: CrewPool, station: number): boolean {
    const supply = this.supplies.get(station);
    if (supply === undefined || !structure.isAlive(station)) {
      return false;
    }
    if (supply.rack.countOf(supply.preferredLoad) <= 0) {
      return false;
    }
    const gunner = crew.gunnerAt(station);
    if (gunner === null || gunner.awayOnTrip) {
      return false;
    }
    return true;
  }

  /** Takes one round out of the rack. Returns false when there was none. */
  public consumeShot(station: number): boolean {
    const supply = this.supplies.get(station);
    if (supply === undefined) {
      return false;
    }
    return supply.rack.remove(supply.preferredLoad, 1) === 1;
  }

  /** Advances every trip and dispatches new ones where a rack has run low. */
  public update(
    structure: BlockStructure,
    crew: CrewPool,
    seconds: number
  ): LogisticsStep {
    this.refreshGraph(structure);
    let completed = 0;
    let delivered = 0;
    const remaining: SupplyTrip[] = [];

    for (let i = 0; i < this.trips.length; i++) {
      const trip = this.trips[i];
      const member = crew.memberAt(trip.crewId);
      if (!member.alive || !structure.isAlive(trip.station)) {
        // The trip is abandoned; a dead runner does not deliver.
        member.awayOnTrip = false;
        continue;
      }
      trip.timer -= seconds;
      if (trip.timer > 0) {
        remaining.push(trip);
        continue;
      }
      if (trip.phase === TripPhase.Outbound) {
        trip.phase = TripPhase.Loading;
        trip.timer = this.dials.handlingSeconds;
        member.stationedAt = trip.depot;
        remaining.push(trip);
      } else if (trip.phase === TripPhase.Loading) {
        trip.phase = TripPhase.Inbound;
        trip.timer = trip.legSeconds;
        remaining.push(trip);
      } else if (trip.phase === TripPhase.Inbound) {
        trip.phase = TripPhase.Unloading;
        trip.timer = this.dials.handlingSeconds;
        member.stationedAt = trip.station;
        remaining.push(trip);
      } else {
        const store = this.depots.get(trip.depot);
        const supply = this.supplies.get(trip.station);
        if (store !== undefined && supply !== undefined) {
          const taken = store.remove(trip.load, trip.rounds);
          const stowed = supply.rack.add(trip.load, taken);
          if (stowed < taken) {
            store.add(trip.load, taken - stowed);
          }
          delivered += stowed;
        }
        member.awayOnTrip = false;
        completed++;
      }
    }
    this.trips = remaining;

    const started = this.dispatch(structure, crew);
    const starved = this.updateStarvation(structure, crew, seconds);
    return new LogisticsStep(started, completed, delivered, starved);
  }

  /** Sends someone to top up every rack that is low and not already being served. */
  private dispatch(structure: BlockStructure, crew: CrewPool): number {
    const stations = this.stationBlocks();
    let started = 0;
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      const supply = this.supplies.get(station) as StationSupply;
      if (!structure.isAlive(station)) {
        continue;
      }
      if (supply.rack.weight >= this.dials.rackRefillThreshold) {
        continue;
      }
      if (this.hasTripFor(station)) {
        continue;
      }
      const depot = this.nearestStockedDepot(structure, supply);
      if (depot < 0) {
        continue;
      }
      const path = supply.depotPath;
      if (path === null) {
        continue;
      }
      const legSeconds = path.duration(this.dials.crewWalkSpeed);
      const rounds = this.ammo.roundsPerTrip(supply.preferredLoad, this.dials.crewCarryCapacity);
      if (rounds <= 0) {
        continue;
      }

      // Spec 4.3: a runner if one is spare, otherwise the gunner goes and the gun is
      // silent for the round trip. That is the legible baseline penalty.
      const runner = this.idleRunner(crew);
      if (runner !== null) {
        runner.awayOnTrip = true;
        runner.stationedAt = station;
        this.trips.push(
          new SupplyTrip(runner.id, station, depot, supply.preferredLoad, rounds, false, legSeconds)
        );
        started++;
        continue;
      }
      const gunner = crew.gunnerAt(station);
      if (gunner !== null && !gunner.awayOnTrip) {
        gunner.awayOnTrip = true;
        this.trips.push(
          new SupplyTrip(gunner.id, station, depot, supply.preferredLoad, rounds, true, legSeconds)
        );
        started++;
      }
    }
    return started;
  }

  private updateStarvation(
    structure: BlockStructure,
    crew: CrewPool,
    seconds: number
  ): number[] {
    const newlyStarved: number[] = [];
    const stations = this.stationBlocks();
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      const supply = this.supplies.get(station) as StationSupply;
      if (!structure.isAlive(station)) {
        continue;
      }
      const wasStarved = supply.starved;
      const reachable = this.nearestStockedDepot(structure, supply) >= 0;
      supply.starved = !reachable;
      if (supply.starved && !wasStarved) {
        newlyStarved.push(station);
      }
      if (!this.canFire(structure, crew, station)) {
        supply.drySeconds += seconds;
      }
    }
    return newlyStarved;
  }

  private hasTripFor(station: number): boolean {
    for (let i = 0; i < this.trips.length; i++) {
      if (this.trips[i].station === station) {
        return true;
      }
    }
    return false;
  }

  private idleRunner(crew: CrewPool): CrewMember | null {
    const runners = crew.membersInRole(CrewRole.Runner);
    for (let i = 0; i < runners.length; i++) {
      if (!runners[i].awayOnTrip) {
        return runners[i];
      }
    }
    return null;
  }

  /**
   * Nearest depot that still holds the station's load, along a route that still exists.
   * Caches the chosen path on the supply so the editor and the replay can show it.
   */
  private nearestStockedDepot(structure: BlockStructure, supply: StationSupply): number {
    this.refreshGraph(structure);
    const graph = this.graph as WalkGraph;
    const pathfinder = this.pathfinder as AStar;
    supply.depotPath = null;
    supply.nearestDepot = -1;
    if (!structure.isAlive(supply.block)) {
      return -1;
    }
    const crewCells = graph.accessCells(structure.positionOf(supply.block));
    if (crewCells.length === 0) {
      return -1;
    }
    const depots = this.sortedKeys(this.depots);
    let best: Path | null = null;
    let bestDepot = -1;
    for (let i = 0; i < depots.length; i++) {
      const depot = depots[i];
      if (!structure.isAlive(depot)) {
        continue;
      }
      const store = this.depots.get(depot) as AmmoStore;
      if (store.countOf(supply.preferredLoad) <= 0) {
        continue;
      }
      const targets = graph.accessCells(structure.positionOf(depot));
      if (targets.length === 0) {
        continue;
      }
      const candidate = pathfinder.findPathToAny(crewCells[0], targets);
      if (candidate === null) {
        continue;
      }
      if (best === null || candidate.stepCount < best.stepCount) {
        best = candidate;
        bestDepot = depot;
      }
    }
    supply.depotPath = best;
    supply.nearestDepot = bestDepot;
    return bestDepot;
  }

  private refreshGraph(structure: BlockStructure): void {
    if (this.graph === null || this.graphVersion !== structure.version) {
      this.graph = WalkGraph.build(structure, this.surface);
      this.pathfinder = new AStar(this.graph);
      this.graphVersion = structure.version;
    }
  }

  private sortedKeys(map: Map<number, AmmoStore>): number[] {
    const keys: number[] = [];
    map.forEach((_value: AmmoStore, key: number): void => {
      keys.push(key);
    });
    keys.sort((a: number, b: number): number => a - b);
    return keys;
  }
}
