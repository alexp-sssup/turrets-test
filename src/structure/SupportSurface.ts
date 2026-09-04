import { IVec3 } from "../core/IVec3";

/**
 * What the turret stands on. Spec 6 calls the arena one node; a support surface is the part
 * of that node the solver needs, so replacing the pad with terrain is one implementation.
 */
export interface SupportSurface {
  /** True when a block at this position rests on solid ground. */
  supportsBlockAt(position: IVec3): boolean;
  /**
   * True when crew can stand on the ground here (standable-ground spec 2).
   *
   * Wider than `supportsBlockAt` by one cell, and narrower than the world: the apron is
   * what lets crew stand outside the wall of a design that fills its pad, and the bound is
   * what keeps them off the lane.
   */
  walkableAt(position: IVec3): boolean;
}

/** Spec 2: "places it on a marked pad". A rectangle at one height. */
export class PadSurface implements SupportSurface {
  public readonly level: number;
  public readonly minX: number;
  public readonly maxX: number;
  public readonly minZ: number;
  public readonly maxZ: number;

  public constructor(level: number, minX: number, maxX: number, minZ: number, maxZ: number) {
    this.level = level;
    this.minX = minX;
    this.maxX = maxX;
    this.minZ = minZ;
    this.maxZ = maxZ;
  }

  public supportsBlockAt(position: IVec3): boolean {
    return (
      position.y === this.level &&
      position.x >= this.minX &&
      position.x <= this.maxX &&
      position.z >= this.minZ &&
      position.z <= this.maxZ
    );
  }

  /** The pad plus a one-cell apron (standable-ground spec 2.2). */
  public walkableAt(position: IVec3): boolean {
    return (
      position.y === this.level &&
      position.x >= this.minX - 1 &&
      position.x <= this.maxX + 1 &&
      position.z >= this.minZ - 1 &&
      position.z <= this.maxZ + 1
    );
  }

  public get width(): number {
    return this.maxX - this.minX + 1;
  }

  public get depth(): number {
    return this.maxZ - this.minZ + 1;
  }
}
