/** Spec 4.4: crew are assigned to three categories, and reassignment is inter-wave only. */
export enum CrewRole {
  Idle = 0,
  /** Mans a station. One per station in P0. */
  Gunner = 1,
  /** Part of a repair detail, rebuilding against the blueprint. */
  Repair = 2,
  /** Spec 4.3's optional role: keeps racks topped up so the gunner never leaves. */
  Runner = 3,
}

export function crewRoleName(role: CrewRole): string {
  if (role === CrewRole.Gunner) {
    return "gunner";
  }
  if (role === CrewRole.Repair) {
    return "repair";
  }
  if (role === CrewRole.Runner) {
    return "runner";
  }
  return "idle";
}

/**
 * One of the twelve. Mutable, because a crew member is state rather than data: they get
 * reassigned between waves, they walk, and they die.
 */
export class CrewMember {
  public readonly id: number;
  public role: CrewRole;
  /**
   * The block this crew member is at. A gunner's station, the block a repair detail is
   * working on, or wherever a runner currently is. -1 when unassigned.
   *
   * This is what makes "crew inside a collapsing section die" (spec 4.4) a lookup rather
   * than a physics query.
   */
  public stationedAt: number;
  public alive: boolean;
  /** True while a gunner is away on a resupply trip, so the gun is silent. */
  public awayOnTrip: boolean;

  public constructor(id: number) {
    this.id = id;
    this.role = CrewRole.Idle;
    this.stationedAt = -1;
    this.alive = true;
    this.awayOnTrip = false;
  }
}
