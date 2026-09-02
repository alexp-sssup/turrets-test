import { IVec3 } from "../core/IVec3";
import { AMMO_LOAD_COUNT, AmmoLoadId } from "../materials/AmmoTable";
import { Path } from "../path/Path";

/**
 * What the editor has to show for one station.
 *
 * Spec 4.3: "editor support is mandatory, not optional. Per station, the editor shows the
 * path to its nearest depot, the round-trip time, and rounds-per-trip for each load.
 * Discovering haul cost only at runtime would violate the readable-solver principle that
 * the rest of the prototype rests on."
 */
export class StationReadout {
  public readonly block: number;
  public readonly position: IVec3;
  /** Fraction of sampled arc rays that leave the structure. */
  public readonly arcClearFraction: number;
  public readonly arcCentreClear: boolean;
  /** Where the gunner stands, or null when there is nowhere. */
  public readonly crewCell: IVec3 | null;
  public readonly hatchPath: Path | null;
  public readonly depotPath: Path | null;
  /** Block index of the depot the station would actually be supplied from, or -1. */
  public readonly nearestDepot: number;
  /** Seconds for one there-and-back resupply trip, or Infinity when there is no route. */
  public readonly roundTripSeconds: number;
  private readonly roundsPerTripByLoad: Int32Array;

  public constructor(
    block: number,
    position: IVec3,
    arcClearFraction: number,
    arcCentreClear: boolean,
    crewCell: IVec3 | null,
    hatchPath: Path | null,
    depotPath: Path | null,
    nearestDepot: number,
    roundTripSeconds: number,
    roundsPerTripByLoad: Int32Array
  ) {
    this.block = block;
    this.position = position;
    this.arcClearFraction = arcClearFraction;
    this.arcCentreClear = arcCentreClear;
    this.crewCell = crewCell;
    this.hatchPath = hatchPath;
    this.depotPath = depotPath;
    this.nearestDepot = nearestDepot;
    this.roundTripSeconds = roundTripSeconds;
    this.roundsPerTripByLoad = roundsPerTripByLoad;
  }

  /** Spec 4.3: `floor(carry capacity / shot weight)`. */
  public roundsPerTrip(load: AmmoLoadId): number {
    return this.roundsPerTripByLoad[load as number];
  }

  public get loadCount(): number {
    return AMMO_LOAD_COUNT;
  }

  public get hasDepotRoute(): boolean {
    return this.depotPath !== null;
  }

  public get hasHatchRoute(): boolean {
    return this.hatchPath !== null;
  }
}
