import { GridBounds } from "../core/GridBounds";
import { IVec3 } from "../core/IVec3";

/**
 * Where crew with no post stand (crew-visible spec 3).
 *
 * Repair details between jobs, spare runners and the unassigned are not simulated as
 * walkers, so any position for them is a convention. The one this picks has to buy one
 * thing: **the count**. Before this, all eleven of them were placed at the first hatch with
 * a fraction of a voxel of jitter, and eleven boxes at one spot composite into one box --
 * measured at two to four distinct marks for twelve crew across every shipped design
 * (crew-visible spec 1.2). A pile is not made readable by shaking it.
 *
 * So the muster is ground outside the design's own footprint, at the pad's level, one crew
 * member to a cell: nothing is built there, so nothing can stand in front of them. Cells
 * are taken in rows of descending z -- attackers advance along +z, so that is the side away
 * from the lane -- and within a row by ascending x, ring by ring outward. Crew off duty
 * therefore fall in behind the turret, out of the field of fire, in a rank a tester can
 * count without moving the camera (spec 3.3).
 *
 * Nothing here reaches the walk graph. No route starts or ends at a muster cell and no crew
 * member is placed in the simulation by it: this is a drawing convention and spec 5 says so.
 */
export class MusterGround {
  private readonly cells: readonly IVec3[];

  /**
   * `footprint` is the design's own bounds, `level` the pad's, and `capacity` how many crew
   * the ground has to hold -- rings are added outward until it does.
   */
  public constructor(footprint: GridBounds, level: number, capacity: number) {
    const minX = footprint.min.x;
    const maxX = footprint.min.x + footprint.size.x - 1;
    const minZ = footprint.min.z;
    const maxZ = footprint.min.z + footprint.size.z - 1;
    const cells: IVec3[] = [];
    for (let ring = 1; ring <= MusterGround.MAX_RINGS; ring++) {
      for (let z = maxZ + ring; z >= minZ - ring; z--) {
        for (let x = minX - ring; x <= maxX + ring; x++) {
          if (MusterGround.ringOf(x, z, minX, maxX, minZ, maxZ) !== ring) {
            continue;
          }
          cells.push(new IVec3(x, level, z));
        }
      }
      if (cells.length >= capacity) {
        break;
      }
    }
    this.cells = cells;
  }

  public get size(): number {
    return this.cells.length;
  }

  /**
   * The cell the `index`-th crew member without a post stands in.
   *
   * Wraps rather than throwing. A pool bigger than eight rings of ground is not a case P0
   * has -- `MAX_RINGS` holds hundreds of cells around any design -- and a renderer is the
   * wrong place to discover it.
   */
  public cellAt(index: number): IVec3 {
    const wrapped = index % this.cells.length;
    return this.cells[wrapped < 0 ? wrapped + this.cells.length : wrapped];
  }

  /** How far outside the footprint a cell is, in the Chebyshev sense the rings are built in. */
  private static ringOf(
    x: number,
    z: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ): number {
    const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
    const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
    return dx > dz ? dx : dz;
  }

  /** Enough rings to seat any P0 pool around any P0 design, and a bound on the loop. */
  public static readonly MAX_RINGS: number = 8;
}
