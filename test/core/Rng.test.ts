import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Rng } from "../../src/core/Rng";

describe("Rng", () => {
  it("reproduces the same stream from the same seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 500; i++) {
      assert.equal(a.nextUint32(), b.nextUint32());
    }
  });

  it("produces different streams from different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      if (a.nextUint32() !== b.nextUint32()) {
        differences++;
      }
    }
    assert.ok(differences > 90, "expected near-total divergence, got " + differences.toString());
  });

  it("stays inside the documented ranges", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const u = rng.nextUint32();
      assert.ok(u >= 0 && u <= 0xffffffff && Number.isInteger(u));
      const f = rng.nextFloat();
      assert.ok(f >= 0 && f < 1);
      const n = rng.nextInt(6);
      assert.ok(n >= 0 && n < 6 && Number.isInteger(n));
      const r = rng.nextRange(-2, 5);
      assert.ok(r >= -2 && r < 5);
    }
  });

  it("returns 0 for a non-positive bound instead of NaN", () => {
    const rng = new Rng(3);
    assert.equal(rng.nextInt(0), 0);
    assert.equal(rng.nextInt(-4), 0);
  });

  it("snapshot and restore rewind the stream exactly", () => {
    const rng = new Rng(99);
    for (let i = 0; i < 10; i++) {
      rng.nextUint32();
    }
    const state = rng.snapshot();
    const expected: number[] = [];
    for (let i = 0; i < 20; i++) {
      expected.push(rng.nextUint32());
    }
    rng.restore(state);
    for (let i = 0; i < 20; i++) {
      assert.equal(rng.nextUint32(), expected[i]);
    }
  });

  it("forks independent streams without consuming a draw", () => {
    const parent = new Rng(42);
    const firstFork = parent.fork(1);
    const secondFork = parent.fork(2);
    assert.notEqual(firstFork.nextUint32(), secondFork.nextUint32());
    // The parent itself is untouched, so fork order cannot perturb the main stream.
    const control = new Rng(42);
    assert.equal(parent.nextUint32(), control.nextUint32());
  });

  it("is roughly uniform over buckets (sanity, not a statistics suite)", () => {
    const rng = new Rng(2024);
    const buckets = new Array<number>(10).fill(0);
    const samples = 100000;
    for (let i = 0; i < samples; i++) {
      buckets[rng.nextInt(10)]++;
    }
    for (let i = 0; i < buckets.length; i++) {
      const share = buckets[i] / samples;
      assert.ok(share > 0.085 && share < 0.115, "bucket " + i.toString() + " share " + share.toString());
    }
  });
});
