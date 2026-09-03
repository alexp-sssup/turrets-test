/**
 * One face of a voxel: which way it points, where its four corners are, and which
 * neighbours share its four edges (isometric renderer spec 3).
 *
 * Corners are unit offsets from the cell's own corner and are listed in cyclic order, so
 * the projection -- which is affine -- turns them into a convex screen quad in the same
 * order. `edge i` runs from corner `i` to corner `i + 1` and is shared with the neighbour
 * at `edgeD*(i)`; that pairing is what spec 3.1's rule needs in order to stroke a crease
 * and leave a continuous surface alone.
 *
 * A face carries its own shade, and the shade is a **screen** property rather than a world
 * one (spec 3): the light is fixed to the viewer, so a quarter turn never changes which side
 * of a turret is bright.
 */
export class VoxelFace {
  public readonly name: string;
  /** Outward normal, as a unit step in world coordinates. */
  public readonly dx: number;
  public readonly dy: number;
  public readonly dz: number;
  /** Lighten (positive) or darken (negative), applied to the material's own colour. */
  public readonly shade: number;
  private readonly corners: readonly number[];
  private readonly edges: readonly number[];

  public constructor(
    name: string,
    dx: number,
    dy: number,
    dz: number,
    shade: number,
    corners: readonly number[],
    edges: readonly number[]
  ) {
    this.name = name;
    this.dx = dx;
    this.dy = dy;
    this.dz = dz;
    this.shade = shade;
    this.corners = corners;
    this.edges = edges;
  }

  public static readonly CORNER_COUNT: number = 4;

  public cornerX(corner: number): number {
    return this.corners[corner * 3];
  }

  public cornerY(corner: number): number {
    return this.corners[corner * 3 + 1];
  }

  public cornerZ(corner: number): number {
    return this.corners[corner * 3 + 2];
  }

  /** The neighbour that shares edge `corner` -> `corner + 1`. */
  public edgeDx(edge: number): number {
    return this.edges[edge * 3];
  }

  public edgeDy(edge: number): number {
    return this.edges[edge * 3 + 1];
  }

  public edgeDz(edge: number): number {
    return this.edges[edge * 3 + 2];
  }
}
