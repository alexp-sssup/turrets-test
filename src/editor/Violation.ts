/**
 * Spec 4.2: firing arc and crew path are "validated in the editor and shown as violations,
 * not silently ignored". This is that list.
 */
export enum ViolationKind {
  OverBudget = 0,
  NoStation = 1,
  NoDepot = 2,
  /** Blocks with no path to the pad. */
  DisconnectedBlocks = 3,
  /** The load factor is under 1: it comes apart under its own weight. */
  StructurallyUnsound = 4,
  /** It falls over rather than coming apart. */
  Tipping = 5,
  /** The gun cannot see out. */
  StationArcBlocked = 6,
  /**
   * Crew-access spec 2.3: no traversable route from the station to a way in. There is no
   * violation for having no hatch (2.4) -- a single-storey turret needs none, and a station
   * stranded upstairs is reported by this rule without one.
   *
   * Gun-ports spec 2.4 deleted its neighbour, `StationNoCrewSpace`, for the same reason:
   * the gunner stands in the slit and a live station is always standable, so "nowhere for
   * the gunner to stand" could no longer happen. Being unable to *reach* the post still can,
   * and that is this rule.
   */
  StationNoEntryPath = 7,
  /** No traversable route from the station to any depot: it will fire its rack dry. */
  StationNoDepotPath = 8,
}

export function violationKindName(kind: ViolationKind): string {
  const names: readonly string[] = [
    "over budget",
    "no crew station",
    "no munition depot",
    "disconnected blocks",
    "structurally unsound",
    "tips over",
    "station firing arc blocked",
    "station has no route in",
    "station has no route to a depot",
  ];
  return names[kind as number];
}

/** One problem with a blueprint. `block` is -1 for a problem with the design as a whole. */
export class Violation {
  public readonly kind: ViolationKind;
  public readonly block: number;
  public readonly detail: string;

  public constructor(kind: ViolationKind, block: number, detail: string) {
    this.kind = kind;
    this.block = block;
    this.detail = detail;
  }

  public describe(): string {
    const where = this.block >= 0 ? " (block " + this.block.toString() + ")" : "";
    return violationKindName(this.kind) + where + (this.detail.length > 0 ? ": " + this.detail : "");
  }
}
