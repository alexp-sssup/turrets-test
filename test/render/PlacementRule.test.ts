import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { IVec3 } from "../../src/core/IVec3";
import { CellPresence } from "../../src/render/CellPresence";
import { FaceHit } from "../../src/render/FaceHit";
import { PlacementRule } from "../../src/render/PlacementRule";

/** A hand-written set of cells, the same shape `CellPick`'s own suite uses. */
class Cells implements CellPresence {
  private readonly filled: readonly IVec3[];

  public constructor(filled: readonly IVec3[]) {
    this.filled = filled;
  }

  public isSolid(x: number, y: number, z: number): boolean {
    for (let i = 0; i < this.filled.length; i++) {
      const cell = this.filled[i];
      if (cell.x === x && cell.y === y && cell.z === z) {
        return true;
      }
    }
    return false;
  }
}

const empty = new Cells([]);
const block = new IVec3(2, 1, 4);

describe("PlacementRule: where a placement lands (face-placement spec 2)", () => {
  it("2.1: a hit face puts the block in the cell across it", () => {
    const faces = [
      new IVec3(0, 1, 0),
      new IVec3(1, 0, 0),
      new IVec3(-1, 0, 0),
      new IVec3(0, 0, 1),
      new IVec3(0, 0, -1),
    ];
    for (let i = 0; i < faces.length; i++) {
      const hit = new FaceHit(block, faces[i]);
      const target = PlacementRule.target(hit, null, empty);
      assert.notEqual(target, null, faces[i].toString());
      const expected = new IVec3(
        block.x + faces[i].x,
        block.y + faces[i].y,
        block.z + faces[i].z
      );
      assert.equal((target as IVec3).equals(expected), true, faces[i].toString());
    }
  });

  it("2.1: the face wins over the pad, because the ray met it first", () => {
    const ground = new IVec3(9, 0, 9);
    const hit = new FaceHit(block, new IVec3(0, 1, 0));
    const target = PlacementRule.target(hit, ground, empty);
    assert.equal((target as IVec3).equals(new IVec3(2, 2, 4)), true);
  });

  it("2.2: with no block under the pointer the pad takes the placement", () => {
    const ground = new IVec3(4, 0, 7);
    const target = PlacementRule.target(null, ground, empty);
    assert.equal((target as IVec3).equals(ground), true);
  });

  it("2.2: neither a face nor the pad is nowhere to place", () => {
    assert.equal(PlacementRule.target(null, null, empty), null);
  });

  it("2.4: a placement into an occupied cell is refused", () => {
    // The case the peel makes real: the cell across the reach plane's camera-facing face can
    // already hold a block that the pick skipped because it is drawn as a wireframe.
    const hidden = new IVec3(3, 1, 4);
    const occupied = new Cells([block, hidden]);
    const hit = new FaceHit(block, new IVec3(1, 0, 0));
    assert.equal(PlacementRule.target(hit, null, occupied), null);
  });

  it("2.4: an occupied pad cell is refused the same way", () => {
    const ground = new IVec3(4, 0, 7);
    assert.equal(PlacementRule.target(null, ground, new Cells([ground])), null);
  });
});
