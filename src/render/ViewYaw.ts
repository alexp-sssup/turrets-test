/**
 * One of the four quarter-turn camera positions (isometric renderer spec 2.2).
 *
 * The projection needs exactly two things from a yaw, and both are integers: which world
 * ground axis runs **down and to the right** on screen (`p`), and which runs **up and to
 * the right** (`r`). Everything else in the renderer -- the depth key, the view ray, which
 * cube faces are camera-facing, which side of the reach plane gets peeled -- falls out of
 * those two by arithmetic rather than by a table someone has to keep in step.
 *
 * `p` and `r` are signed selections of world x and z, so the map is an integer rotation and
 * its inverse is its transpose. That is the whole reason this is four instances of a value
 * type and not four branches: a quarter turn cannot introduce a rounding error, and the C++
 * translation is four rows of `constexpr`.
 *
 * Yaw 0 is the view a session opens in: the lane recedes down-and-right into the pad and
 * the sections recede up-and-right, so a five-wide turret is five voxels deep.
 */
export class ViewYaw {
  /** 0..3, quarter turns anticlockwise about the vertical axis. */
  public readonly id: number;
  /** `p = pOfX * x + pOfZ * z` -- the axis that runs down-right on screen. */
  public readonly pOfX: number;
  public readonly pOfZ: number;
  /** `r = rOfX * x + rOfZ * z` -- the axis that runs up-right on screen. */
  public readonly rOfX: number;
  public readonly rOfZ: number;

  private constructor(id: number, pOfX: number, pOfZ: number, rOfX: number, rOfZ: number) {
    this.id = id;
    this.pOfX = pOfX;
    this.pOfZ = pOfZ;
    this.rOfX = rOfX;
    this.rOfZ = rOfZ;
  }

  /** The table of spec 2.2, in order. */
  public static readonly ALL: readonly ViewYaw[] = [
    new ViewYaw(0, 0, 1, 1, 0),
    new ViewYaw(1, -1, 0, 0, 1),
    new ViewYaw(2, 0, -1, -1, 0),
    new ViewYaw(3, 1, 0, 0, -1),
  ];

  public static readonly COUNT: number = 4;

  /** The view a session opens in (spec 2.2). */
  public static get initial(): ViewYaw {
    return ViewYaw.ALL[0];
  }

  public static of(id: number): ViewYaw {
    const wrapped = ((id % ViewYaw.COUNT) + ViewYaw.COUNT) % ViewYaw.COUNT;
    return ViewYaw.ALL[wrapped];
  }

  /** A quarter turn either way. `q` and `e` are the two bindings (spec 9). */
  public turned(quarters: number): ViewYaw {
    return ViewYaw.of(this.id + quarters);
  }

  /** The down-right view axis of a world point. */
  public p(x: number, z: number): number {
    return this.pOfX * x + this.pOfZ * z;
  }

  /** The up-right view axis of a world point. */
  public r(x: number, z: number): number {
    return this.rOfX * x + this.rOfZ * z;
  }

  /** World x of a view pair. The inverse is the transpose, because the map is a rotation. */
  public worldX(p: number, r: number): number {
    return this.pOfX * p + this.rOfX * r;
  }

  public worldZ(p: number, r: number): number {
    return this.pOfZ * p + this.rOfZ * r;
  }

  /**
   * Distance toward the camera, up to a positive constant (spec 4).
   *
   * `p + y - r`, which is the world position dotted with the direction toward the camera.
   * Larger is nearer, so the draw list composites in ascending key.
   */
  public depthKey(x: number, y: number, z: number): number {
    return this.p(x, z) + y - this.r(x, z);
  }

  /**
   * One step along the view ray toward the camera: `(p, y, r) += (1, 1, -1)` (spec 5.2).
   *
   * The x component is +/-1 at every yaw, which is the fact the peel rule of spec 6 is
   * argued from: one step toward the camera changes the section index by exactly one, so
   * every occluder of the reach plane sits in a nearer section.
   */
  public get rayStepX(): number {
    return this.pOfX - this.rOfX;
  }

  public get rayStepY(): number {
    return 1;
  }

  public get rayStepZ(): number {
    return this.pOfZ - this.rOfZ;
  }

  /**
   * Which side of the reach plane is peeled: -1 when nearer sections have the smaller x,
   * +1 when they have the larger (spec 2.2's table, spec 6's rule).
   */
  public get nearerSide(): number {
    return this.rayStepX;
  }

  /** True when the section is between the camera and the reach plane, and so is peeled. */
  public isInFront(sectionX: number, activeX: number): boolean {
    return (sectionX - activeX) * this.nearerSide > 0;
  }

  /** The neighbour across the top face. Always straight up, at every yaw. */
  public get topDx(): number {
    return 0;
  }

  public get topDz(): number {
    return 0;
  }

  /** The neighbour across the face that faces screen-right: the `+p` direction. */
  public get rightDx(): number {
    return this.pOfX;
  }

  public get rightDz(): number {
    return this.pOfZ;
  }

  /**
   * The neighbour across the face that faces screen-left: the `-r` direction.
   *
   * Written `0 - n` rather than `-n` on purpose: negating a zero gives `-0`, and `-0` is not
   * `0` to `Object.is` -- which is what the strict assertions in the tests compare with, and
   * what a `switch` on a direction would trip over in the port.
   */
  public get leftDx(): number {
    return 0 - this.rOfX;
  }

  public get leftDz(): number {
    return 0 - this.rOfZ;
  }
}
