import { AttackerSnapshot, CrewSnapshot } from "./FieldFrame";
import { ShotTrace } from "../sim/ShotTrace";
import { DrawContext } from "./Layer";
import { Palette } from "./Palette";
import { ViewFacing } from "./ViewFacing";
import { VoxelFace } from "./VoxelFace";

/**
 * Everything that stands in the world rather than beside a plan of it (isometric renderer
 * spec 7.4, 7.5).
 *
 * An attacker is a box of its own footprint and height, a crew member is a smaller one, and
 * both sort against the structure by the same depth key -- which is what puts a runner
 * behind the wall they walk behind, and the first time in this prototype that a corridor
 * looks like a corridor.
 *
 * **Contact shadows are mandatory, not decoration.** A 2:1 projection has no perspective, so
 * screen position alone cannot separate "two voxels up" from "two voxels nearer": an actor
 * without a shadow is an actor at an unknown position. A circle on the ground plane projects
 * to an axis-aligned ellipse under this projection, which is why one `ellipse` call is the
 * whole of it.
 */
export class ActorPainter {
  private readonly facing: ViewFacing;
  private readonly quadX: Float64Array;
  private readonly quadY: Float64Array;

  public constructor(facing: ViewFacing) {
    this.facing = facing;
    this.quadX = new Float64Array(VoxelFace.CORNER_COUNT);
    this.quadY = new Float64Array(VoxelFace.CORNER_COUNT);
  }

  /** A ground circle of radius `radius` voxels, projected. */
  public static shadow(context: DrawContext, x: number, z: number, level: number, radius: number): void {
    const projection = context.projection;
    const ctx = context.ctx;
    const centreX = projection.screenX(x, z);
    const centreY = projection.screenY(x, level, z);
    ctx.fillStyle = Palette.shadow;
    ctx.beginPath();
    if (projection.isIso) {
      ctx.ellipse(centreX, centreY, radius * projection.scale * 1.414, radius * projection.scale * 0.707, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(centreX, centreY, radius * projection.scale, radius * projection.scale * 0.35, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /**
   * A box in world coordinates, shaded like a voxel so an actor and a wall are lit the same
   * way. `x` and `z` are the box centre; `y` is the level it stands on.
   */
  public box(
    context: DrawContext,
    x: number,
    y: number,
    z: number,
    footprint: number,
    height: number,
    baseHex: string
  ): void {
    const ctx = context.ctx;
    const half = footprint * 0.5;
    for (let index = 0; index < this.facing.count; index++) {
      const face = this.facing.at(index);
      for (let corner = 0; corner < VoxelFace.CORNER_COUNT; corner++) {
        const cx = x - half + face.cornerX(corner) * footprint;
        const cy = y + face.cornerY(corner) * height;
        const cz = z - half + face.cornerZ(corner) * footprint;
        this.quadX[corner] = context.projection.screenX(cx, cz);
        this.quadY[corner] = context.projection.screenY(cx, cy, cz);
      }
      ctx.fillStyle = Palette.dimmed(baseHex, face.shade, 0);
      ctx.beginPath();
      ctx.moveTo(this.quadX[0], this.quadY[0]);
      for (let corner = 1; corner < VoxelFace.CORNER_COUNT; corner++) {
        ctx.lineTo(this.quadX[corner], this.quadY[corner]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = Palette.voxelEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /**
   * One attacker, standing on the lane. Its shadow is a separate item in the draw list, at
   * the ground's own depth, so the sort places it against the geometry rather than against
   * the unit that casts it.
   */
  public attacker(context: DrawContext, unit: AttackerSnapshot): void {
    const level = context.frame.design.pad.level;
    this.box(
      context,
      unit.laneX + 0.5,
      level,
      unit.laneZ + 0.5,
      ActorPainter.ATTACKER_FOOTPRINT,
      ActorPainter.ATTACKER_HEIGHT,
      unit.engaged ? "#d8534f" : "#9c5b57"
    );
  }

  public crew(context: DrawContext, member: CrewSnapshot): void {
    this.box(
      context,
      member.x + 0.5,
      member.y,
      member.z + 0.5,
      ActorPainter.CREW_FOOTPRINT,
      ActorPainter.CREW_HEIGHT,
      Palette.crewHex(member.role)
    );
    if (member.carrying >= 0) {
      // A runner with a load on their back. The whole point of simulating resupply is that
      // this shape is visible walking down a corridor that can be cut.
      const projection = context.projection;
      const px = projection.screenX(member.x + 0.5, member.z + 0.5);
      const py = projection.screenY(member.x + 0.5, member.y + ActorPainter.CREW_HEIGHT, member.z + 0.5);
      const ctx = context.ctx;
      ctx.fillStyle = Palette.warning;
      ctx.fillRect(px - 3, py - 5, 6, 4);
    }
  }

  public static readonly ATTACKER_FOOTPRINT: number = 0.66;
  public static readonly ATTACKER_HEIGHT: number = 1.4;
  public static readonly CREW_FOOTPRINT: number = 0.4;
  public static readonly CREW_HEIGHT: number = 0.8;
  /**
   * Shadow radii, and they are deliberately **wider than the footprint above them**.
   *
   * A shadow the size of the body is a shadow the body covers, which is a shadow that does
   * nothing: what reads as contact is the rim of it spreading past the silhouette. Spec 7.3
   * asks for a cue, not for a correct penumbra.
   */
  public static readonly ATTACKER_SHADOW: number = 0.52;
  public static readonly CREW_SHADOW: number = 0.32;
  /** How high a lobbed round rises above the straight line, in voxels per voxel of range. */
  public static readonly LOB_RISE: number = 0.34;

  /**
   * One round, along the path the damage actually took (spec 7.5), with its shadow on the
   * ground beneath it. A lobbed firepot is an arc over the turret rather than a curve on a
   * plan of it -- which is the read the flat view could not offer at all.
   */
  public shot(context: DrawContext, trace: ShotTrace): void {
    const ctx = context.ctx;
    const projection = context.projection;
    const level = context.frame.design.pad.level;
    const fromX = projection.screenX(trace.fromX, trace.fromZ);
    const fromY = projection.screenY(trace.fromX, trace.fromY, trace.fromZ);
    const toX = projection.screenX(trace.toX, trace.toZ);
    const toY = projection.screenY(trace.toX, trace.toY, trace.toZ);

    ctx.strokeStyle = Palette.shadow;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(projection.screenX(trace.fromX, trace.fromZ), projection.screenY(trace.fromX, level, trace.fromZ));
    ctx.lineTo(projection.screenX(trace.toX, trace.toZ), projection.screenY(trace.toX, level, trace.toZ));
    ctx.stroke();

    ctx.strokeStyle = trace.outgoing ? "rgba(255,232,150,0.95)" : "rgba(255,140,90,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    if (trace.lobbed) {
      const midX = (trace.fromX + trace.toX) * 0.5;
      const midZ = (trace.fromZ + trace.toZ) * 0.5;
      const spanX = trace.toX - trace.fromX;
      const spanZ = trace.toZ - trace.fromZ;
      const span = Math.sqrt(spanX * spanX + spanZ * spanZ);
      const apex = (trace.fromY + trace.toY) * 0.5 + span * ActorPainter.LOB_RISE + 1;
      ctx.quadraticCurveTo(
        projection.screenX(midX, midZ),
        projection.screenY(midX, apex, midZ),
        toX,
        toY
      );
    } else {
      ctx.lineTo(toX, toY);
    }
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = trace.outgoing ? "rgba(255,240,190,0.9)" : "rgba(255,170,120,0.9)";
    ctx.beginPath();
    ctx.arc(toX, toY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
