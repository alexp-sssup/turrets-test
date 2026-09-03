import { VoxelFace } from "./VoxelFace";

/**
 * The three camera-facing faces at one yaw, in paint order (isometric renderer spec 3).
 *
 * Top first, then the two sides, so a cell's own faces composite without the painter having
 * to think about it. Named `left` and `right` for the screen sides they occupy rather than
 * for the world axes they happen to be at this yaw, because the shading is fixed to the
 * screen and the reader of a shade should not have to know the yaw to interpret it.
 */
export class ViewFacing {
  public readonly top: VoxelFace;
  public readonly left: VoxelFace;
  public readonly right: VoxelFace;

  public constructor(top: VoxelFace, left: VoxelFace, right: VoxelFace) {
    this.top = top;
    this.left = left;
    this.right = right;
  }

  public get count(): number {
    return 3;
  }

  public at(index: number): VoxelFace {
    if (index === 0) {
      return this.top;
    }
    return index === 1 ? this.left : this.right;
  }
}
