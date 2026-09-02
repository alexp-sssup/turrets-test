/**
 * Spec 4.2: firing arc and crew path are "validated in the editor and shown as violations,
 * not silently ignored". This is that list.
 */
export enum ViolationKind {
  OverBudget = 0,
  NoCoreBlock = 1,
  MultipleCoreBlocks = 2,
  NoStation = 3,
  NoDepot = 4,
  NoHatch = 5,
  /** Blocks with no path to the pad. */
  DisconnectedBlocks = 6,
  /** The load factor is under 1: it comes apart under its own weight. */
  StructurallyUnsound = 7,
  /** It falls over rather than coming apart. */
  Tipping = 8,
  /** The gun cannot see out. */
  StationArcBlocked = 9,
  /** Nowhere for the gunner to stand. */
  StationNoCrewSpace = 10,
  /** No traversable route from the station to any hatch. */
  StationNoHatchPath = 11,
  /** No traversable route from the station to any depot: it will fire its rack dry. */
  StationNoDepotPath = 12,
}

export function violationKindName(kind: ViolationKind): string {
  const names: readonly string[] = [
    "over budget",
    "no core block",
    "more than one core block",
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
