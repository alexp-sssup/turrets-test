import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { PadSurface } from "../structure/SupportSurface";

/**
 * The single fixed arena (spec 2): a marked pad and one lane leading to it.
 *
 * Spec 6: "the arena is one node. Give it a material-availability set and a connection list
 * and it becomes a map node." So this class holds only what P0 needs -- where the turret
 * stands and where the attacker comes from -- and nothing about maps or capture.
 */
export class Arena {
  public readonly pad: PadSurface;
  /** Attackers advance along +z, from negative z toward the pad. */
  public readonly approach: Direction = Direction.PosZ;
  /** How far down the lane attackers spawn. */
  public readonly laneLength: number;
  /** Height attackers occupy, in voxels above the pad. */
  public readonly laneHeight: number;

  public constructor(pad: PadSurface, laneLength: number, laneHeight: number) {
    this.pad = pad;
    this.laneLength = laneLength;
    this.laneHeight = laneHeight;
  }

  public static p0(): Arena {
    return new Arena(new PadSurface(0, 0, 4, 0, 4), 40, 1);
  }

  /** z coordinate attackers enter at. */
  public get spawnZ(): number {
    return this.pad.minZ - this.laneLength;
  }

  /** z coordinate of the face of the turret they are walking toward. */
  public get frontZ(): number {
    return this.pad.minZ;
  }

  public get laneCentreX(): number {
    return Math.floor((this.pad.minX + this.pad.maxX) / 2);
  }

  public get laneY(): number {
    return this.pad.level + this.laneHeight;
  }

  /** Clamps a lane offset to the width of the approach. */
  public clampLaneX(x: number): number {
    if (x < this.pad.minX) {
      return this.pad.minX;
    }
    if (x > this.pad.maxX) {
      return this.pad.maxX;
    }
    return x;
  }

  public cellAt(x: number, z: number): IVec3 {
    return new IVec3(x, this.laneY, Math.round(z));
  }
}
