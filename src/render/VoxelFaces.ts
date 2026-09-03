import { CellPresence } from "./CellPresence";
import { ViewFacing } from "./ViewFacing";
import { VoxelFace } from "./VoxelFace";
import { ViewYaw } from "./ViewYaw";

/**
 * The face rules of the isometric renderer: which faces of a voxel are drawn, which edges
 * are stroked, and when a voxel can be skipped entirely.
 *
 * Three faces are ever camera-facing -- the top, and the two whose normals point toward the
 * viewer -- and which world faces those are follows from the yaw (spec 2.2) rather than from
 * a table. Everything here is a predicate over `CellPresence`, so spec 3's claims are
 * testable without a canvas, and spec 3.3's claim in particular is worth testing because the
 * whole performance argument rests on it:
 *
 * > A cell whose three camera-facing neighbours are all present is fully occluded.
 *
 * That is exact, not a heuristic. The projections of those three neighbours tile the cell's
 * hexagon precisely -- one covers its top rhombus and the other two cover a side face each
 * -- so skipping it discards no pixel that would have been visible. The consequence is that
 * fill cost follows a design's **surface** and not its volume: a solid blob costs what a
 * shell of the same silhouette costs.
 */
export class VoxelFaces {
  /** Lightened, because the light is above (spec 3). */
  public static readonly TOP_SHADE: number = 0.22;
  public static readonly LEFT_SHADE: number = -0.1;
  public static readonly RIGHT_SHADE: number = -0.32;

  public static readonly TOP: VoxelFace = new VoxelFace(
    "top",
    0,
    1,
    0,
    VoxelFaces.TOP_SHADE,
    [0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1],
    [0, 0, -1, 1, 0, 0, 0, 0, 1, -1, 0, 0]
  );

  private static readonly PLUS_X: readonly number[] = [1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1];
  private static readonly MINUS_X: readonly number[] = [0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1];
  private static readonly PLUS_Z: readonly number[] = [0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1];
  private static readonly MINUS_Z: readonly number[] = [0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0];
  /** Edge neighbours of an x-normal face: -z, up, +z, down. */
  private static readonly X_EDGES: readonly number[] = [0, 0, -1, 0, 1, 0, 0, 0, 1, 0, -1, 0];
  /** Edge neighbours of a z-normal face: -x, up, +x, down. */
  private static readonly Z_EDGES: readonly number[] = [-1, 0, 0, 0, 1, 0, 1, 0, 0, 0, -1, 0];

  /**
   * The face of a voxel whose outward normal is the given lateral step, shaded as the given
   * screen side. Six lateral faces exist; a yaw uses two of them.
   */
  private static lateral(dx: number, dz: number, shade: number, name: string): VoxelFace {
    if (dx > 0) {
      return new VoxelFace(name, 1, 0, 0, shade, VoxelFaces.PLUS_X, VoxelFaces.X_EDGES);
    }
    if (dx < 0) {
      return new VoxelFace(name, -1, 0, 0, shade, VoxelFaces.MINUS_X, VoxelFaces.X_EDGES);
    }
    if (dz > 0) {
      return new VoxelFace(name, 0, 0, 1, shade, VoxelFaces.PLUS_Z, VoxelFaces.Z_EDGES);
    }
    return new VoxelFace(name, 0, 0, -1, shade, VoxelFaces.MINUS_Z, VoxelFaces.Z_EDGES);
  }

  /** The three camera-facing faces at a yaw, in the order they are painted. */
  public static facing(yaw: ViewYaw): ViewFacing {
    return new ViewFacing(
      VoxelFaces.TOP,
      VoxelFaces.lateral(yaw.leftDx, yaw.leftDz, VoxelFaces.LEFT_SHADE, "left"),
      VoxelFaces.lateral(yaw.rightDx, yaw.rightDz, VoxelFaces.RIGHT_SHADE, "right")
    );
  }

  /** A face is drawn when its cell is solid and the cell across it is not. */
  public static isDrawn(
    cells: CellPresence,
    face: VoxelFace,
    x: number,
    y: number,
    z: number
  ): boolean {
    if (!cells.isSolid(x, y, z)) {
      return false;
    }
    return !cells.isSolid(x + face.dx, y + face.dy, z + face.dz);
  }

  /**
   * Spec 3.1: stroke an edge only where the surface stops.
   *
   * The edge between a drawn face and its in-plane neighbour is stroked unless the
   * neighbour draws the same face -- which is exactly the condition for the two faces being
   * coplanar and continuous. A silhouette edge and a crease against a taller neighbour both
   * fail it; the seam through the middle of a flat wall passes it and is left alone.
   */
  public static isEdgeStroked(
    cells: CellPresence,
    face: VoxelFace,
    x: number,
    y: number,
    z: number,
    edge: number
  ): boolean {
    return !VoxelFaces.isDrawn(
      cells,
      face,
      x + face.edgeDx(edge),
      y + face.edgeDy(edge),
      z + face.edgeDz(edge)
    );
  }

  /**
   * Spec 3.3: a cell hidden behind its own three camera-facing neighbours.
   *
   * Equivalent to all three faces being undrawn, and stated as its own predicate because it
   * is the one the draw list consults before it allocates anything for a cell.
   */
  public static isOccluded(cells: CellPresence, yaw: ViewYaw, x: number, y: number, z: number): boolean {
    return (
      cells.isSolid(x, y + 1, z) &&
      cells.isSolid(x + yaw.leftDx, y, z + yaw.leftDz) &&
      cells.isSolid(x + yaw.rightDx, y, z + yaw.rightDz)
    );
  }
}
