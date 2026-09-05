import { IVec3 } from "../core/IVec3";

/**
 * A block the view ray met, and the face it met it through (face-placement spec 2.1).
 *
 * The pick of isometric renderer spec 5.2 walks a three-axis DDA that crosses exactly one
 * lattice plane per step, so the face is not a second computation: it is the axis the
 * traversal last crossed, with the sign the ray came from. Carrying it out of that loop is
 * one integer triple on a traversal that already runs on every hover.
 *
 * The normal is the face's **outward** one, so the cell a placement fills is the hit cell
 * plus the normal and nothing else has to know which way the camera is pointing.
 *
 * A small immutable value type: two `IVec3`, no owner, no lifetime.
 */
export class FaceHit {
  public readonly cell: IVec3;
  /** Outward normal of the face the ray entered through. A unit step on one axis. */
  public readonly normal: IVec3;

  public constructor(cell: IVec3, normal: IVec3) {
    this.cell = cell;
    this.normal = normal;
  }

  /**
   * The face a fixed-elevation camera always sees, whatever the yaw (spec 2.3).
   *
   * The flat developer view of isometric renderer spec 9 has no faces to aim at and does not
   * place through one (face-placement spec 2.7), but it still picks a block for inspect and
   * for the eraser. This is the face it reports, and nothing reads it.
   */
  public static onTop(cell: IVec3): FaceHit {
    return new FaceHit(cell, new IVec3(0, 1, 0));
  }

  /** The cell across the face: where a placement aimed at it lands (spec 2.1). */
  public adjacent(): IVec3 {
    return new IVec3(
      this.cell.x + this.normal.x,
      this.cell.y + this.normal.y,
      this.cell.z + this.normal.z
    );
  }
}
