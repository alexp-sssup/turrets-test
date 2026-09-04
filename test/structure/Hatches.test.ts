import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { approxEqual } from "../../src/core/Numeric";
import { MaterialId } from "../../src/materials/MaterialId";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { SupportAnalysis } from "../../src/structure/SupportAnalysis";
import { PadSurface } from "../../src/structure/SupportSurface";
import { Harness } from "./StructureHarness";

const harness = Harness.withDefaults();
const pad = new PadSurface(0, 0, 0, 0, 0);

/** Wood: density 0.5 at gravity 10 and voxel size 1. */
const WOOD_WEIGHT = 5;
/** Wood compression capacity 160, over a unit face. */
const WOOD_JOINT = 160;

/** A one-voxel column at x=z=0, the kind of each course given from the ground up. */
function column(kinds: readonly BlockKind[]) {
  const builder = new BlueprintBuilder();
  for (let y = 0; y < kinds.length; y++) {
    builder.place(new IVec3(0, y, 0), MaterialId.Wood, kinds[y], Direction.PosZ);
  }
  const structure = harness.structureOf(builder.build("column"));
  const joints = harness.jointsOf(structure, pad);
  const report = harness.solver.analyse(structure, joints, harness.gravityOf(structure));
  return { structure, joints, report };
}

function towerOf(height: number, kind: BlockKind) {
  const kinds: BlockKind[] = [];
  for (let i = 0; i < height; i++) {
    kinds.push(kind);
  }
  return column(kinds);
}

describe("hatches spec 3: an opening carries almost no load", () => {
  it("gives a joint touching a hatch a tenth of the capacity it would otherwise have", () => {
    // Same two voxels of the same material; only the upper one's kind differs.
    const frame = column([BlockKind.Structural, BlockKind.Structural]);
    const opening = column([BlockKind.Structural, BlockKind.Hatch]);

    assert.equal(frame.joints.jointAt(0).compressionCapacity, WOOD_JOINT);
    assert.equal(
      opening.joints.jointAt(0).compressionCapacity,
      WOOD_JOINT * harness.dials.hatchCapacityFactor
    );
    assert.equal(opening.joints.jointAt(0).compressionCapacity, 16);
  });

  /**
   * Spec 3.1, and the reason the factor is a fraction rather than zero. A joint whose
   * factor reaches zero is not weak, it is *absent* from the graph -- and a block with no
   * joints is floating, and floating blocks collapse. A hatch has to carry itself.
   */
  it("leaves a lone hatch standing, jointed and not floating", () => {
    const lone = towerOf(1, BlockKind.Hatch);
    assert.equal(lone.joints.jointCount, 1, "the support joint is there, not skipped");
    assert.equal(SupportAnalysis.floatingBlocks(lone.structure, lone.joints).length, 0);
    // 16 of capacity against 5 of self weight.
    assert.ok(
      approxEqual(lone.report.loadFactor, (WOOD_JOINT * harness.dials.hatchCapacityFactor) / WOOD_WEIGHT, 1e-9)
    );
    assert.ok(approxEqual(lone.report.loadFactor, 3.2, 1e-9));
  });

  /**
   * Spec 4, case 2. Nothing beside it to shed into, so the bottom joint carries the whole
   * stack: the load factor is a closed form, 16 / (5 * height), and the tower comes down
   * between three and four.
   */
  it("stands a free-standing hatch tower three high and drops it at four", () => {
    for (let height = 1; height <= 5; height++) {
      const tower = towerOf(height, BlockKind.Hatch);
      const expected = 16 / (WOOD_WEIGHT * height);
      assert.ok(
        approxEqual(tower.report.loadFactor, expected, 1e-9),
        "height " + height.toString() + ": " + tower.report.loadFactor.toString()
      );
    }
    assert.ok(towerOf(3, BlockKind.Hatch).report.loadFactor > 1, "three stands");
    assert.ok(towerOf(4, BlockKind.Hatch).report.loadFactor < 1, "four does not");
  });

  /**
   * Spec 4, case 3: a lintel and one course over a doorway is sound, a storey on it is not.
   * The same closed form -- the hatch's own weight is in the stack it has to carry.
   */
  it("carries a lintel and one course over a doorway, and not a storey", () => {
    for (let above = 0; above <= 4; above++) {
      const kinds: BlockKind[] = [BlockKind.Hatch];
      for (let i = 0; i < above; i++) {
        kinds.push(BlockKind.Structural);
      }
      const wall = column(kinds);
      const expected = 16 / (WOOD_WEIGHT * (above + 1));
      assert.ok(
        approxEqual(wall.report.loadFactor, expected, 1e-9),
        "courses above " + above.toString() + ": " + wall.report.loadFactor.toString()
      );
      assert.equal(wall.report.loadFactor >= 1, above <= 2, "a lintel yes, a storey no");
    }
  });

  /**
   * Spec 4, case 1: the case that must not break. A hatch in a floor is face-adjacent to
   * the blocks it is a hole in, so its weight sheds sideways instead of running down the
   * column, and a shaft is nowhere near its limit.
   */
  it("leaves a hatch in a floor comfortable, because it sheds sideways", () => {
    const builder = new BlueprintBuilder();
    // A 3x3 deck at y=1 carried by a 3x3 base at y=0, with the middle of the deck a hatch.
    for (let x = 0; x <= 2; x++) {
      for (let z = 0; z <= 2; z++) {
        builder.place(new IVec3(x, 0, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
        const middle = x === 1 && z === 1;
        builder.place(
          new IVec3(x, 1, z),
          MaterialId.Wood,
          middle ? BlockKind.Hatch : BlockKind.Structural,
          Direction.PosZ
        );
      }
    }
    const structure = harness.structureOf(builder.build("deck"));
    const joints = harness.jointsOf(structure, new PadSurface(0, 0, 2, 0, 2));
    const report = harness.solver.analyse(structure, joints, harness.gravityOf(structure));
    assert.equal(SupportAnalysis.floatingBlocks(structure, joints).length, 0);
    assert.ok(report.loadFactor > 3, "a shaft through a deck is not close to its limit");
  });
});
