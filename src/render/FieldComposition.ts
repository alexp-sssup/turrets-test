import { ActorPainter } from "./ActorPainter";
import { DrawKind, DrawList } from "./DrawList";
import { FrameCells } from "./FrameCells";
import { DrawContext } from "./Layer";
import { VoxelFaces } from "./VoxelFaces";
import { ViewYaw } from "./ViewYaw";
import { VoxelPainter } from "./VoxelPainter";

/**
 * The base composition: one back-to-front pass over the whole scene (isometric renderer
 * spec 4).
 *
 * Voxels, contact shadows, actors and rounds in flight go into one draw list, sorted by
 * depth key, and painted in that order. There is no special case for the actors, and that is
 * the point: a runner is behind the wall they walk behind because the sort says so, not
 * because a layer was told to draw them earlier.
 *
 * There is one projection and one treatment, so nothing here branches (spec 10.1): a cell is
 * drawn as the cube it is, or it is a hole where a block died, and the sort decides the rest.
 *
 * Nothing here allocates per cell: the list is typed arrays reused between frames, the
 * painters hold their own scratch, and the face fills are looked up rather than built.
 */
export class FieldComposition {
  private readonly list: DrawList;
  private voxels: VoxelPainter;
  private actors: ActorPainter;
  private facingYaw: number;

  public constructor() {
    this.list = new DrawList(2048);
    const facing = VoxelFaces.facing(ViewYaw.initial);
    this.voxels = new VoxelPainter(facing);
    this.actors = new ActorPainter(facing);
    this.facingYaw = -1;
  }

  public draw(context: DrawContext): void {
    this.retarget(context);
    this.build(context);
    this.list.sort();
    this.paint(context);
  }

  /** The painters are bound to a yaw's three camera-facing faces; rebuild on a turn. */
  private retarget(context: DrawContext): void {
    const yaw = context.view.yaw;
    if (this.facingYaw === yaw.id) {
      return;
    }
    const facing = VoxelFaces.facing(yaw);
    this.voxels = new VoxelPainter(facing);
    this.actors = new ActorPainter(facing);
    this.facingYaw = yaw.id;
  }

  private build(context: DrawContext): void {
    const frame = context.frame;
    const projection = context.projection;
    const blueprint = frame.design.blueprint;
    const solid = new FrameCells(frame);
    const yaw = context.view.yaw;
    this.list.clear();

    for (let block = 0; block < blueprint.blockCount; block++) {
      const position = blueprint.blockAt(block).position;
      if (!frame.isAlive(block)) {
        // A hole, wherever the block died. One behind a live wall is painted first and the
        // wall is painted over it (no-sections spec 3).
        this.list.add(
          DrawKind.Voxel,
          block,
          position.x,
          position.y,
          position.z,
          projection.depthKey(position.x, position.y, position.z)
        );
        continue;
      }
      // Spec 3.3: a cell behind its own three camera-facing neighbours is invisible, so
      // fill cost follows the design's surface and not its volume.
      if (VoxelFaces.isOccluded(solid, yaw, position.x, position.y, position.z)) {
        continue;
      }
      if (!this.isOnScreen(context, position.x, position.y, position.z)) {
        continue;
      }
      this.list.add(
        DrawKind.Voxel,
        block,
        position.x,
        position.y,
        position.z,
        projection.depthKey(position.x, position.y, position.z)
      );
    }

    const level = frame.design.pad.level;
    for (let i = 0; i < frame.attackers.length; i++) {
      const unit = frame.attackers[i];
      const x = unit.laneX + 0.5;
      const z = unit.laneZ + 0.5;
      this.list.add(DrawKind.Shadow, i, x, level, z, projection.depthKey(x, level, z));
      this.list.add(DrawKind.Attacker, i, x, level, z, projection.depthKey(x, level, z) + 0.5);
    }
    for (let i = 0; i < frame.crew.length; i++) {
      const member = frame.crew[i];
      const x = member.x + 0.5;
      const z = member.z + 0.5;
      this.list.add(DrawKind.Shadow, -1, x, member.y, z, projection.depthKey(x, member.y, z));
      this.list.add(DrawKind.Crew, i, x, member.y, z, projection.depthKey(x, member.y, z) + 0.5);
    }
    for (let i = 0; i < frame.shots.length; i++) {
      const shot = frame.shots[i];
      const x = (shot.fromX + shot.toX) * 0.5;
      const y = (shot.fromY + shot.toY) * 0.5;
      const z = (shot.fromZ + shot.toZ) * 0.5;
      // Rounds ride slightly proud of the geometry at their midpoint: a tracer that vanished
      // into the wall it is about to hit would read as no shot at all.
      this.list.add(DrawKind.Projectile, i, x, y, z, projection.depthKey(x, y, z) + 0.75);
    }
  }

  /** Cheap viewport reject: the hexagon of a cell that cannot be on the canvas (spec 8). */
  private isOnScreen(context: DrawContext, x: number, y: number, z: number): boolean {
    const projection = context.projection;
    const iso = projection.iso;
    const anchorX = iso.anchorX(x, z);
    const anchorY = iso.anchorY(x, y, z);
    const scale = projection.scale;
    if (anchorX + 2 * scale < 0 || anchorX > projection.widthPx) {
      return false;
    }
    return !(anchorY - 1.5 * scale > projection.heightPx || anchorY + scale < 0);
  }

  private paint(context: DrawContext): void {
    const frame = context.frame;
    const solid = new FrameCells(frame);
    for (let position = 0; position < this.list.count; position++) {
      const slot = this.list.slotAt(position);
      const payload = this.list.payloadOf(slot);
      const x = this.list.xOf(slot);
      const y = this.list.yOf(slot);
      const z = this.list.zOf(slot);
      switch (this.list.kindOf(slot)) {
        case DrawKind.Voxel: {
          if (!frame.isAlive(payload)) {
            this.voxels.paintHole(context, x, y, z);
            break;
          }
          this.voxels.paintSolid(context, solid, payload, x, y, z);
          break;
        }
        case DrawKind.Shadow:
          ActorPainter.shadow(
            context,
            x,
            z,
            y,
            payload >= 0 ? ActorPainter.ATTACKER_SHADOW : ActorPainter.CREW_SHADOW
          );
          break;
        case DrawKind.Attacker:
          this.actors.attacker(context, frame.attackers[payload]);
          break;
        case DrawKind.Crew:
          this.actors.crew(context, frame.crew[payload]);
          break;
        case DrawKind.Projectile:
          this.actors.shot(context, frame.shots[payload]);
          break;
        default:
          break;
      }
    }
  }
}
