import { Axes, Axis, Direction, Directions } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { Vec3 } from "../core/Vec3";
import { MaterialProperties } from "../materials/MaterialProperties";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockStructure } from "./BlockStructure";
import { GROUND_BLOCK, Joint } from "./Joint";
import { SupportSurface } from "./SupportSurface";

/** The three positive face directions, so each joint is discovered exactly once. */
const POSITIVE_DIRECTIONS: readonly Direction[] = [Direction.PosX, Direction.PosY, Direction.PosZ];

/**
 * Derived adjacency: every shared face between two live blocks, plus every face resting on
 * the support surface. Rebuilt from scratch whenever the structure changes -- it is cheap
 * (linear in blocks) and a stale graph would silently invent capacity that is not there.
 *
 * Build order is block index, then +X/+Y/+Z, then supports, which makes joint indices a
 * deterministic function of the structure (spec 4.5).
 */
export class JointGraph {
  private readonly joints: readonly Joint[];
  private readonly incidence: readonly number[][];

  private constructor(joints: readonly Joint[], incidence: readonly number[][]) {
    this.joints = joints;
    this.incidence = incidence;
  }

  public static build(
    structure: BlockStructure,
    materials: MaterialTable,
    surface: SupportSurface,
    voxelSize: number
  ): JointGraph {
    const joints: Joint[] = [];
    const incidence: number[][] = [];
    for (let i = 0; i < structure.blockCount; i++) {
      incidence.push([]);
    }
    const area = voxelSize * voxelSize;
    const lever = voxelSize * 0.5;

    for (let block = 0; block < structure.blockCount; block++) {
      if (!structure.isAlive(block)) {
        continue;
      }
      const properties = materials.get(structure.materialOf(block));

      for (let d = 0; d < POSITIVE_DIRECTIONS.length; d++) {
        const direction = POSITIVE_DIRECTIONS[d];
        const neighbour = structure.neighbourOf(block, direction);
        if (neighbour < 0) {
          continue;
        }
        const factor = structure.jointFactor(block, neighbour);
        if (factor <= 0) {
          continue; // severed
        }
        const axis = Directions.axisOf(direction);
        const other = materials.get(structure.materialOf(neighbour));
        const centre = JointGraph.blockCentre(structure.positionOf(block), voxelSize).add(
          Axes.normal(axis).scale(lever)
        );
        const index = joints.length;
        joints.push(
          new Joint(
            block,
            neighbour,
            axis,
            centre,
            JointGraph.weaker(properties, other, 0) * area * factor,
            JointGraph.weaker(properties, other, 1) * area * factor,
            JointGraph.weaker(properties, other, 2) * area * factor,
            JointGraph.weaker(properties, other, 3) * area * factor * voxelSize,
            lever
          )
        );
        incidence[block].push(index);
        incidence[neighbour].push(index);
      }
    }

    // Supports come after every block-to-block joint, so adding or removing a support
    // cannot renumber the interior of the graph.
    for (let block = 0; block < structure.blockCount; block++) {
      if (!structure.isAlive(block)) {
        continue;
      }
      const position = structure.positionOf(block);
      if (!surface.supportsBlockAt(position)) {
        continue;
      }
      const factor = structure.jointFactor(GROUND_BLOCK, block);
      if (factor <= 0) {
        continue;
      }
      const properties = materials.get(structure.materialOf(block));
      const centre = JointGraph.blockCentre(position, voxelSize).sub(Axes.normal(Axis.Y).scale(lever));
      const index = joints.length;
      joints.push(
        new Joint(
          GROUND_BLOCK,
          block,
          Axis.Y,
          centre,
          // A turret is not bolted down: the pad pushes, it never pulls. That single zero
          // is what makes static overturning fall out of the solver instead of needing a
          // tipping rule of its own.
          0,
          properties.compressionCapacity * area * factor,
          properties.shearCapacity * area * factor,
          properties.torsionCapacity * area * factor * voxelSize,
          lever
        )
      );
      incidence[block].push(index);
    }

    return new JointGraph(joints, incidence);
  }

  public get jointCount(): number {
    return this.joints.length;
  }

  public jointAt(index: number): Joint {
    return this.joints[index];
  }

  /** Joint indices touching a block, in build order. */
  public jointsOfBlock(block: number): readonly number[] {
    return this.incidence[block];
  }

  /** Finds the joint between two blocks (`GROUND_BLOCK` allowed), or -1. */
  public findJoint(blockLow: number, blockHigh: number): number {
    const candidates = this.incidence[blockHigh];
    for (let i = 0; i < candidates.length; i++) {
      const joint = this.joints[candidates[i]];
      if (joint.blockLow === blockLow && joint.blockHigh === blockHigh) {
        return candidates[i];
      }
    }
    return -1;
  }

  public supportCount(): number {
    let count = 0;
    for (let i = 0; i < this.joints.length; i++) {
      if (this.joints[i].isSupport) {
        count++;
      }
    }
    return count;
  }

  private static blockCentre(position: IVec3, voxelSize: number): Vec3 {
    return new Vec3(
      (position.x + 0.5) * voxelSize,
      (position.y + 0.5) * voxelSize,
      (position.z + 0.5) * voxelSize
    );
  }

  /**
   * A joint is only as strong as its weaker side, so mixed-material interfaces inherit the
   * worse of the two capacities. Selector: 0 tension, 1 compression, 2 shear, 3 torsion.
   */
  private static weaker(a: MaterialProperties, b: MaterialProperties, selector: number): number {
    if (selector === 0) {
      return a.tensionCapacity < b.tensionCapacity ? a.tensionCapacity : b.tensionCapacity;
    }
    if (selector === 1) {
      return a.compressionCapacity < b.compressionCapacity ? a.compressionCapacity : b.compressionCapacity;
    }
    if (selector === 2) {
      return a.shearCapacity < b.shearCapacity ? a.shearCapacity : b.shearCapacity;
    }
    return a.torsionCapacity < b.torsionCapacity ? a.torsionCapacity : b.torsionCapacity;
  }
}
