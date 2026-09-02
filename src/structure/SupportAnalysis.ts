import { Axis } from "../core/Direction";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockStructure } from "./BlockStructure";
import { Joint } from "./Joint";
import { JointGraph } from "./JointGraph";

/**
 * Two cheap checks that run without the linear program.
 *
 * They exist because the load-factor formulation degenerates on structures that cannot
 * carry *any* load: the optimum is then a zero force field, which is correct but says
 * nothing about which joint gave way. Both checks below are strictly necessary conditions
 * for standing, so removing what they find never discards a configuration the solver would
 * have accepted -- they only take the un-analysable cases off its plate.
 */
export class SupportAnalysis {
  /**
   * Blocks with no path to the ground through intact joints. They are falling regardless of
   * capacity, so the solver excludes them and reports them separately.
   *
   * Returns indices in ascending order.
   */
  public static floatingBlocks(structure: BlockStructure, joints: JointGraph): number[] {
    const grounded = SupportAnalysis.groundedFlags(structure, joints);
    const result: number[] = [];
    for (let block = 0; block < structure.blockCount; block++) {
      if (structure.isAlive(block) && grounded[block] === 0) {
        result.push(block);
      }
    }
    return result;
  }

  /** Per-block flags: 1 when the block is connected to the support surface. */
  public static groundedFlags(structure: BlockStructure, joints: JointGraph): Uint8Array {
    const grounded = new Uint8Array(structure.blockCount);
    const queue: number[] = [];
    for (let j = 0; j < joints.jointCount; j++) {
      const joint = joints.jointAt(j);
      if (joint.isSupport && grounded[joint.blockHigh] === 0) {
        grounded[joint.blockHigh] = 1;
        queue.push(joint.blockHigh);
      }
    }
    let head = 0;
    while (head < queue.length) {
      const block = queue[head];
      head++;
      const incident = joints.jointsOfBlock(block);
      for (let i = 0; i < incident.length; i++) {
        const joint = joints.jointAt(incident[i]);
        const other = joint.blockLow === block ? joint.blockHigh : joint.blockLow;
        if (other < 0) {
          continue;
        }
        if (grounded[other] === 0) {
          grounded[other] = 1;
          queue.push(other);
        }
      }
    }
    return grounded;
  }

  /**
   * Blocks whose joints cannot together hold up the block's own weight, cascading.
   *
   * This is a local necessary condition: the largest upward force each joint can supply is
   * its compression capacity (from below), its tension capacity (from above) or its shear
   * capacity (sideways). If the sum is under the weight, no admissible force field exists
   * at any positive load -- a stone block hung from a stone joint is the canonical case,
   * since stone has no tension capacity at all.
   *
   * Only used to resolve a collapse, never to report soundness.
   */
  public static locallyUnsupportable(
    structure: BlockStructure,
    joints: JointGraph,
    materials: MaterialTable,
    gravity: number,
    voxelSize: number,
    tolerance: number
  ): number[] {
    const removed = new Uint8Array(structure.blockCount);
    const result: number[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let block = 0; block < structure.blockCount; block++) {
        if (!structure.isAlive(block) || removed[block] === 1) {
          continue;
        }
        const weight = materials.voxelWeight(structure.materialOf(block), gravity, voxelSize);
        const incident = joints.jointsOfBlock(block);
        let capacity = 0;
        for (let i = 0; i < incident.length; i++) {
          const joint = joints.jointAt(incident[i]);
          const other = joint.blockLow === block ? joint.blockHigh : joint.blockLow;
          if (other >= 0 && removed[other] === 1) {
            continue;
          }
          capacity += SupportAnalysis.upwardCapacity(joint, block);
        }
        if (capacity + tolerance < weight) {
          removed[block] = 1;
          result.push(block);
          changed = true;
        }
      }
    }
    result.sort((a: number, b: number): number => a - b);
    return result;
  }

  /** Largest upward force a joint can apply to one of its blocks. */
  private static upwardCapacity(joint: Joint, block: number): number {
    if (joint.axis === Axis.Y) {
      // A vertical joint pushes the upper block up and hangs the lower one.
      return joint.blockHigh === block ? joint.compressionCapacity : joint.tensionCapacity;
    }
    // A horizontal joint can only hold weight in shear.
    return joint.shearCapacity;
  }
}
