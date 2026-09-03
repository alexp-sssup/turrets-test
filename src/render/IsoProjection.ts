import { Vec3 } from "../core/Vec3";
import { ViewYaw } from "./ViewYaw";

/**
 * World to screen, isometric (isometric renderer spec 2.1).
 *
 * ```
 * sx(p, r)    = (p + r) * s       + originX
 * sy(p, r, y) = (p - r) * (s / 2) - y * s + originY
 * ```
 *
 * with `p` and `r` the yaw's two ground axes (`ViewYaw`) and `s` the zoom in pixels per
 * voxel edge. That is the whole projection: 2:1 dimetric, one fixed elevation, four
 * quarter-turn yaws, no perspective and no camera state beyond these four numbers. A voxel
 * is `2s` wide and `2s` tall, its top face a `2s x s` rhombus and its vertical edge exactly
 * `s`.
 *
 * Kept free of the canvas, the design and the viewport so the projection can be pinned
 * headlessly: everything a reviewer would want to check about spec 2 and spec 5 is a
 * function from numbers to numbers here.
 *
 * Two exact inverses, and the reason there are two is spec 5:
 *
 * * `onLevel` resolves a screen point in a **horizontal** plane, which is what the view ray
 *   of spec 5.2 is built from and what puts a click on the ground.
 * * `inSection` resolves it in the **vertical build plane**, which is where placement lands
 *   and only ever lands (spec 5.3).
 *
 * Both are two divisions and no search, and both are exact left inverses of the pair above.
 */
export class IsoProjection {
  public readonly yaw: ViewYaw;
  /** Pixels per voxel edge. Always an even integer off `ZoomLadder` (spec 2.3). */
  public readonly scale: number;
  public readonly originX: number;
  public readonly originY: number;
  /**
   * Which cell corner the hexagon offsets are measured from.
   *
   * A unit cube projects to the same hexagon everywhere -- the projection is affine and
   * every cell is the same size -- so the silhouette is six constant pixel offsets from one
   * corner. Which corner that is depends on the yaw: it is the corner with the smallest `p`
   * and `r`, which is the world minimum only at the yaws where neither axis is flipped.
   */
  public readonly anchorDx: number;
  public readonly anchorDz: number;
  private readonly hexOffsets: readonly number[];

  public constructor(yaw: ViewYaw, scale: number, originX: number, originY: number) {
    this.yaw = yaw;
    this.scale = scale;
    this.originX = originX;
    this.originY = originY;
    this.anchorDx = yaw.pOfX + yaw.rOfX < 0 ? 1 : 0;
    this.anchorDz = yaw.pOfZ + yaw.rOfZ < 0 ? 1 : 0;
    const half = scale / 2;
    this.hexOffsets = [
      0,
      0,
      scale,
      half,
      2 * scale,
      0,
      2 * scale,
      -scale,
      scale,
      -scale - half,
      0,
      -scale,
    ];
  }

  public static readonly HEX_CORNERS: number = 6;

  /** Screen x of the corner the hexagon offsets are measured from. */
  public anchorX(x: number, z: number): number {
    return this.screenX(x + this.anchorDx, z + this.anchorDz);
  }

  public anchorY(x: number, y: number, z: number): number {
    return this.screenY(x + this.anchorDx, y, z + this.anchorDz);
  }

  /** Hexagon corner `i`, as a pixel offset from the anchor. Cyclic. */
  public hexOffsetX(corner: number): number {
    return this.hexOffsets[corner * 2];
  }

  public hexOffsetY(corner: number): number {
    return this.hexOffsets[corner * 2 + 1];
  }

  /** Half a voxel's screen width, and the whole of its top face's screen height. */
  public get halfHeight(): number {
    return this.scale / 2;
  }

  public screenX(x: number, z: number): number {
    return (this.yaw.p(x, z) + this.yaw.r(x, z)) * this.scale + this.originX;
  }

  public screenY(x: number, y: number, z: number): number {
    return (this.yaw.p(x, z) - this.yaw.r(x, z)) * this.halfHeight - y * this.scale + this.originY;
  }

  public depthKey(x: number, y: number, z: number): number {
    return this.yaw.depthKey(x, y, z);
  }

  /** The same projection with a different origin: what a pan is. */
  public movedTo(originX: number, originY: number): IsoProjection {
    return new IsoProjection(this.yaw, this.scale, originX, originY);
  }

  /**
   * Screen to world in the horizontal plane `y = level` (spec 5.1).
   *
   * `U = p + r` and `V = p - r` come straight off the two screen terms, and the world pair
   * is the yaw's transpose applied to `((U + V) / 2, (U - V) / 2)`.
   */
  public onLevel(screenX: number, screenY: number, level: number): Vec3 {
    const u = (screenX - this.originX) / this.scale;
    const v = (screenY - this.originY + level * this.scale) / this.halfHeight;
    const p = (u + v) * 0.5;
    const r = (u - v) * 0.5;
    return new Vec3(this.yaw.worldX(p, r), level, this.yaw.worldZ(p, r));
  }

  /**
   * Screen to world in the vertical cross-section `x = section` (spec 5.3).
   *
   * The same algebra with x known instead of y: the first screen term fixes z, and the
   * second then fixes y. `zOfSx` is +/-1 at every yaw, so this never divides by zero and
   * never loses precision.
   */
  public inSection(screenX: number, screenY: number, section: number): Vec3 {
    const zOfSx = this.yaw.pOfZ + this.yaw.rOfZ;
    const xOfSx = this.yaw.pOfX + this.yaw.rOfX;
    const u = (screenX - this.originX) / this.scale;
    const z = (u - xOfSx * section) / zOfSx;
    const rise = (this.yaw.p(section, z) - this.yaw.r(section, z)) * this.halfHeight;
    const y = (rise - (screenY - this.originY)) / this.scale;
    return new Vec3(section, y, z);
  }
}
