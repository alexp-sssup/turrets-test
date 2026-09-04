/**
 * What a voxel is for. Kind is orthogonal to material: a stone station and a wood station
 * are both stations (spec 4.2), and both are one row of authored design.
 *
 * Loss-conditions spec 2: there is no core kind. A run ends on wrecked or unmanned
 * (loss-conditions spec 3), neither of which is a property of a block.
 */
export enum BlockKind {
  /** Plain frame. Carries load and nothing else. */
  Structural = 0,
  /** Spec 4.2: crew station. Needs a firing arc and a crew path to a hatch. */
  Station = 1,
  /** Spec 4.3: munition depot. Stores ammunition and detonates when penetrated. */
  Depot = 2,
  /** Spec 4.2: the way in and out for crew. Traversable, unlike every other block. */
  Hatch = 3,
}

export const BLOCK_KIND_COUNT: number = 4;

export function blockKindName(kind: BlockKind): string {
  if (kind === BlockKind.Structural) {
    return "structural";
  }
  if (kind === BlockKind.Station) {
    return "station";
  }
  if (kind === BlockKind.Depot) {
    return "depot";
  }
  return "hatch";
}
