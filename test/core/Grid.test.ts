import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { GridBounds } from "../../src/core/GridBounds";
import { IVec3 } from "../../src/core/IVec3";
import { EMPTY_CELL, VoxelIndexGrid } from "../../src/core/VoxelIndexGrid";

describe("GridBounds", () => {
  it("rejects a non-positive size", () => {
    assert.throws(() => new GridBounds(IVec3.zero(), new IVec3(0, 1, 1)));
    assert.throws(() => new GridBounds(IVec3.zero(), new IVec3(1, -1, 1)));
  });

  it("round-trips every cell through indexOf/positionOf", () => {
    const bounds = new GridBounds(new IVec3(-2, 3, -7), new IVec3(4, 5, 6));
    assert.equal(bounds.cellCount, 4 * 5 * 6);
    const seen = new Set<number>();
    for (let y = 3; y < 8; y++) {
      for (let z = -7; z < -1; z++) {
        for (let x = -2; x < 2; x++) {
          const position = new IVec3(x, y, z);
          const index = bounds.indexOf(position);
          assert.ok(index >= 0 && index < bounds.cellCount);
          assert.equal(seen.has(index), false, "index collision at " + position.toString());
          seen.add(index);
          assert.ok(bounds.positionOf(index).equals(position));
        }
      }
    }
    assert.equal(seen.size, bounds.cellCount);
  });

  it("reports -1 for out-of-bounds cells", () => {
    const bounds = new GridBounds(IVec3.zero(), new IVec3(2, 2, 2));
    assert.equal(bounds.indexOf(new IVec3(-1, 0, 0)), -1);
    assert.equal(bounds.indexOf(new IVec3(2, 0, 0)), -1);
    assert.equal(bounds.contains(new IVec3(1, 1, 1)), true);
    assert.equal(bounds.contains(new IVec3(0, 2, 0)), false);
  });

  it("fits points with a margin", () => {
    const points = [new IVec3(1, 1, 1), new IVec3(3, 2, 1)];
    const bounds = GridBounds.fromPoints(points, 1);
    assert.ok(bounds.min.equals(new IVec3(0, 0, 0)));
    assert.ok(bounds.size.equals(new IVec3(5, 4, 3)));
    assert.throws(() => GridBounds.fromPoints([], 0));
  });
});

describe("VoxelIndexGrid", () => {
  it("stores and clears ids", () => {
    const grid = new VoxelIndexGrid(new GridBounds(IVec3.zero(), new IVec3(3, 3, 3)));
    const position = new IVec3(1, 2, 0);
    assert.equal(grid.get(position), EMPTY_CELL);
    assert.equal(grid.isOccupied(position), false);
    grid.set(position, 17);
    assert.equal(grid.get(position), 17);
    assert.equal(grid.isOccupied(position), true);
    grid.clear(position);
    assert.equal(grid.get(position), EMPTY_CELL);
  });

  it("treats out-of-bounds reads as empty and out-of-bounds writes as a bug", () => {
    const grid = new VoxelIndexGrid(new GridBounds(IVec3.zero(), new IVec3(2, 2, 2)));
    assert.equal(grid.get(new IVec3(-5, 0, 0)), EMPTY_CELL);
    assert.throws(() => grid.set(new IVec3(-5, 0, 0), 1));
  });
});
