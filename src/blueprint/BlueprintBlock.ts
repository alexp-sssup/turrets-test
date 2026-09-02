import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { MaterialId } from "../materials/MaterialId";
import { BlockKind } from "./BlockKind";

/**
 * One authored voxel. Immutable: a blueprint is a design, and the runtime state that
 * diverges from it under damage lives in `structure/BlockStructure` instead. That split is
 * what makes "repair against the stored blueprint" (spec 4.4) a diff rather than a
 * bookkeeping problem.
 */
export class BlueprintBlock {
  public readonly position: IVec3;
  public readonly material: MaterialId;
  public readonly kind: BlockKind;
  /**
   * Which way the block faces. Meaningful for a station (the centre of its firing arc)
   * and for a hatch (the side crew enter from); ignored for the other kinds.
   */
  public readonly facing: Direction;

  public constructor(position: IVec3, material: MaterialId, kind: BlockKind, facing: Direction) {
    this.position = position;
    this.material = material;
    this.kind = kind;
    this.facing = facing;
  }
}
