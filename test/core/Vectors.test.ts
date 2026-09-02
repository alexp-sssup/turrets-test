import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { IVec3 } from "../../src/core/IVec3";
import { Vec3 } from "../../src/core/Vec3";
import { Axes, Axis, Direction, Directions } from "../../src/core/Direction";
import { approxEqual } from "../../src/core/Numeric";

describe("IVec3", () => {
  it("truncates to integers and stays immutable", () => {
    const v = new IVec3(1.9, -2.9, 3);
    assert.equal(v.x, 1);
    assert.equal(v.y, -2);
    assert.equal(v.z, 3);
    const w = v.add(new IVec3(1, 1, 1));
    assert.equal(v.x, 1, "add must not mutate the receiver");
    assert.equal(w.x, 2);
  });

  it("computes manhattan distance symmetrically", () => {
    const a = new IVec3(0, 0, 0);
    const b = new IVec3(2, -3, 4);
    assert.equal(a.manhattanTo(b), 9);
    assert.equal(b.manhattanTo(a), 9);
  });

  it("orders y-major, then z, then x", () => {
    const points = [
      new IVec3(5, 1, 0),
      new IVec3(0, 0, 1),
      new IVec3(9, 0, 0),
      new IVec3(1, 0, 0),
    ];
    points.sort(IVec3.compare);
    assert.deepEqual(
      points.map((p) => p.toString()),
      ["(1,0,0)", "(9,0,0)", "(0,0,1)", "(5,1,0)"]
    );
  });

  it("is a total order (antisymmetric and transitive on samples)", () => {
    const samples: IVec3[] = [];
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        for (let x = -1; x <= 1; x++) {
          samples.push(new IVec3(x, y, z));
        }
      }
    }
    for (let i = 0; i < samples.length; i++) {
      for (let j = 0; j < samples.length; j++) {
        const forward = IVec3.compare(samples[i], samples[j]);
        const backward = IVec3.compare(samples[j], samples[i]);
        assert.equal(forward + backward, 0, "compare must be antisymmetric");
        if (forward === 0) {
          assert.ok(samples[i].equals(samples[j]));
        }
      }
    }
  });
});

describe("Vec3", () => {
  it("implements the algebra used by the solver", () => {
    const a = new Vec3(1, 2, 3);
    const b = new Vec3(-4, 5, 6);
    assert.equal(a.dot(b), -4 + 10 + 18);
    const c = a.cross(b);
    assert.ok(approxZero(c.dot(a)));
    assert.ok(approxZero(c.dot(b)));
    assert.ok(approxEqual(a.scale(2).length(), 2 * a.length(), 1e-12));
  });

  it("returns zero rather than NaN when normalising a degenerate vector", () => {
    const n = Vec3.zero().normalized();
    assert.equal(n.x, 0);
    assert.equal(n.y, 0);
    assert.equal(n.z, 0);
  });

  it("exposes components by axis index", () => {
    const v = new Vec3(7, 8, 9);
    assert.equal(v.component(0), 7);
    assert.equal(v.component(1), 8);
    assert.equal(v.component(2), 9);
  });
});

function approxZero(value: number): boolean {
  return Math.abs(value) < 1e-12;
}

describe("Direction", () => {
  it("pairs opposites and maps them onto axes", () => {
    assert.equal(Directions.opposite(Direction.NegX), Direction.PosX);
    assert.equal(Directions.opposite(Direction.PosY), Direction.NegY);
    assert.equal(Directions.axisOf(Direction.NegZ), Axis.Z);
    assert.equal(Directions.isPositive(Direction.PosZ), true);
    assert.equal(Directions.isPositive(Direction.NegZ), false);
  });

  it("offsets are unit steps that cancel with their opposite", () => {
    for (let d = 0; d < 6; d++) {
      const direction = d as Direction;
      const step = Directions.offset(direction);
      const back = Directions.offset(Directions.opposite(direction));
      assert.equal(step.manhattanTo(new IVec3(0, 0, 0)), 1);
      assert.ok(step.add(back).equals(new IVec3(0, 0, 0)));
    }
  });

  it("axis frames are right-handed orthonormal", () => {
    for (let a = 0; a < 3; a++) {
      const axis = a as Axis;
      const n = Axes.normal(axis);
      const u = Axes.tangentU(axis);
      const v = Axes.tangentV(axis);
      assert.ok(approxEqual(n.length(), 1, 1e-12));
      assert.ok(approxEqual(u.length(), 1, 1e-12));
      assert.ok(approxEqual(v.length(), 1, 1e-12));
      assert.ok(approxZero(n.dot(u)));
      assert.ok(approxZero(n.dot(v)));
      assert.ok(approxZero(u.dot(v)));
      const cross = u.cross(v);
      assert.ok(approxEqual(cross.sub(n).length(), 0, 1e-12), "normal must equal u x v");
    }
  });
});
