import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { GridBounds } from "../../src/core/GridBounds";
import { IVec3 } from "../../src/core/IVec3";
import { MusterGround } from "../../src/render/MusterGround";

/** A 5x5x2 design standing on the pad, which is what every shipped fixture is. */
function padFootprint(): GridBounds {
  return new GridBounds(new IVec3(0, 0, 0), new IVec3(5, 2, 5));
}

describe("MusterGround", () => {
  it("puts every muster cell outside the footprint, at pad level (crew-visible spec 3.2)", () => {
    const ground = new MusterGround(padFootprint(), 0, 12);
    assert.ok(ground.size >= 12, "twelve crew need twelve cells");
    for (let i = 0; i < ground.size; i++) {
      const cell = ground.cellAt(i);
      assert.equal(cell.y, 0, "the muster is on the ground the attackers walk on");
      const inside = cell.x >= 0 && cell.x <= 4 && cell.z >= 0 && cell.z <= 4;
      assert.equal(inside, false, "nothing is built outside the footprint to hide behind");
    }
  });

  it("fills from the back of the pad forward (crew-visible spec 3.3)", () => {
    const ground = new MusterGround(padFootprint(), 0, 12);
    // Attackers advance along +z, so the row at z = maxZ + 1 is the side away from the lane.
    assert.deepEqual(
      [ground.cellAt(0).x, ground.cellAt(0).z],
      [-1, 5],
      "the first crew member falls in at the back corner"
    );
    for (let i = 0; i < 7; i++) {
      assert.equal(ground.cellAt(i).z, 5, "the back row is filled before any other");
      assert.equal(ground.cellAt(i).x, i - 1, "and filled along it in ascending x");
    }
    // Then the row in front of it, which the footprint splits into its two flanks.
    assert.deepEqual([ground.cellAt(7).x, ground.cellAt(7).z], [-1, 4]);
    assert.deepEqual([ground.cellAt(8).x, ground.cellAt(8).z], [5, 4]);
  });

  it("gives one cell each, never two crew to a cell (crew-visible spec 3.1)", () => {
    const ground = new MusterGround(padFootprint(), 0, 12);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const cell = ground.cellAt(i);
      const key = cell.x.toString() + "," + cell.y.toString() + "," + cell.z.toString();
      assert.equal(seen.has(key), false, "a pile is not made readable by shaking it");
      seen.add(key);
    }
  });

  it("adds rings outward until the pool fits (crew-visible spec 3.3)", () => {
    // A one-cell design: the first ring holds eight, so twelve crew need the second.
    const single = new GridBounds(new IVec3(2, 0, 2), new IVec3(1, 1, 1));
    const ground = new MusterGround(single, 0, 12);
    assert.ok(ground.size >= 12, "a tiny design still seats the whole pool");
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const cell = ground.cellAt(i);
      seen.add(cell.x.toString() + "," + cell.z.toString());
    }
    assert.equal(seen.size, 12);
    // The first eight are the ring one cell out; the ninth has to step out to the second.
    for (let i = 0; i < 8; i++) {
      const cell = ground.cellAt(i);
      const ring = Math.max(Math.abs(cell.x - 2), Math.abs(cell.z - 2));
      assert.equal(ring, 1, "the near ring is used before the one beyond it");
    }
    const ninth = ground.cellAt(8);
    assert.equal(Math.max(Math.abs(ninth.x - 2), Math.abs(ninth.z - 2)), 2);
  });
});
