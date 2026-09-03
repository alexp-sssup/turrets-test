import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DrawKind, DrawList } from "../../src/render/DrawList";
import { IsoProjection } from "../../src/render/IsoProjection";
import { ViewYaw } from "../../src/render/ViewYaw";

describe("The depth key (isometric renderer spec 4)", () => {
  it("is p + y - r, and larger means nearer the camera", () => {
    const yaw = ViewYaw.initial;
    // Yaw 0: p = z, r = x, so the key is z + y - x.
    assert.equal(yaw.depthKey(0, 0, 0), 0);
    assert.equal(yaw.depthKey(0, 0, 1), 1);
    assert.equal(yaw.depthKey(0, 1, 0), 1);
    assert.equal(yaw.depthKey(1, 0, 0), -1);
    // One step along the view ray moves three keys nearer, at every yaw.
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const turned = ViewYaw.of(id);
      const before = turned.depthKey(4, 2, 7);
      const after = turned.depthKey(4 + turned.rayStepX, 3, 7 + turned.rayStepZ);
      assert.equal(after - before, 3);
    }
  });

  it("gives two cells that overlap on screen different keys", () => {
    // The property the sort relies on: if two cells can cover each other, the key separates
    // them. Cells with equal keys lie in one plane perpendicular to the view direction,
    // where unit cubes meet edge-to-edge.
    const yaw = ViewYaw.initial;
    const iso = new IsoProjection(yaw, 16, 0, 0);
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 1, z: 0 };
    assert.equal(yaw.depthKey(a.x, a.y, a.z) === yaw.depthKey(b.x, b.y, b.z), false);
    // And their anchors are a whole cell apart on screen, so neither hides the other.
    assert.notEqual(iso.anchorY(a.x, a.y, a.z), iso.anchorY(b.x, b.y, b.z));
  });
});

describe("DrawList (isometric renderer spec 4)", () => {
  it("sorts back to front", () => {
    const list = new DrawList(8);
    list.add(DrawKind.Voxel, 10, 0, 0, 0, 5);
    list.add(DrawKind.Voxel, 11, 0, 0, 0, -2);
    list.add(DrawKind.Voxel, 12, 0, 0, 0, 3);
    list.sort();
    assert.equal(list.count, 3);
    assert.equal(list.payloadOf(list.slotAt(0)), 11);
    assert.equal(list.payloadOf(list.slotAt(1)), 12);
    assert.equal(list.payloadOf(list.slotAt(2)), 10);
  });

  it("breaks ties by x, then y, then z, then kind, so two runs draw the same pixels", () => {
    const list = new DrawList(8);
    list.add(DrawKind.Crew, 1, 2, 0, 0, 0);
    list.add(DrawKind.Voxel, 2, 1, 0, 0, 0);
    list.add(DrawKind.Voxel, 3, 2, 0, 0, 0);
    list.add(DrawKind.Voxel, 4, 1, 0, 1, 0);
    list.sort();
    const order: number[] = [];
    for (let i = 0; i < list.count; i++) {
      order.push(list.payloadOf(list.slotAt(i)));
    }
    // x = 1 before x = 2; within x = 1, z = 0 before z = 1; within x = 2, Voxel before Crew.
    assert.deepEqual(order, [2, 4, 3, 1]);
  });

  it("grows without losing anything, and clears without reallocating", () => {
    const list = new DrawList(64);
    const capacity = list.capacity;
    for (let i = 0; i < capacity + 40; i++) {
      list.add(DrawKind.Voxel, i, 0, i, 0, -i);
    }
    assert.equal(list.count, capacity + 40);
    list.sort();
    assert.equal(list.payloadOf(list.slotAt(0)), capacity + 39, "the farthest is drawn first");
    const grown = list.capacity;
    list.clear();
    assert.equal(list.count, 0);
    assert.equal(list.capacity, grown);
  });
});
