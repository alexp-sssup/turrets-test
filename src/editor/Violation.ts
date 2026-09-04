/**
 * Spec 4.2: firing arc and crew path are "validated in the editor and shown as violations,
 * not silently ignored". This is that list.
 */
export enum ViolationKind {
  OverBudget = 0,
  NoStation = 1,
  NoDepot = 2,
  NoHatch = 3,
  /** Blocks with no path to the pad. */
  DisconnectedBlocks = 4,
  /** The load factor is under 1: it comes apart under its own weight. */
  StructurallyUnsound = 5,
  /** It falls over rather than coming apart. */
  Tipping = 6,
  /** The gun cannot see out. */
  StationArcBlocked = 7,
  /** Nowhere for the gunner to stand. */
  StationNoCrewSpace = 8,
  /** No traversable route from the station to any hatch. */
  StationNoHatchPath = 9,
  /** No traversable route from the station to any depot: it will fire its rack dry. */
  StationNoDepotPath = 10,
}

export function violationKindName(kind: ViolationKind): string {
  const names: readonly string[] = [
    "over budget",
    "no crew station",
    "no munition depot",
    "no hatch",
    "disconnected blocks",
    "structurally unsound",
    "tips over",
    "station firing arc blocked",
    "station has nowhere for crew to stand",
    "station has no route to a hatch",
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
