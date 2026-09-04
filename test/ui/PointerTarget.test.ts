import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { GridBounds } from "../../src/core/GridBounds";
import { IVec3 } from "../../src/core/IVec3";
import { CellPick } from "../../src/render/CellPick";
import { CellPresence } from "../../src/render/CellPresence";
import { IsoProjection } from "../../src/render/IsoProjection";
import { ViewYaw } from "../../src/render/ViewYaw";
import { PointerTarget } from "../../src/ui/PointerTarget";

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

const bounds = new GridBounds(new IVec3(-2, 0, -6), new IVec3(12, 10, 16));
/** The active cross-section, chosen so the block below is nowhere near it. */
const SECTION: number = 3;

/** Where the ray through the centre of a cell's top face crosses the screen. */
function overCentreOf(iso: IsoProjection, cell: IVec3): IVec3 {
  return new IVec3(
    Math.round(iso.screenX(cell.x + 0.5, cell.z + 0.5)),
    Math.round(iso.screenY(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5)),
    0
  );
}

/** The build-plane cell under a screen point (isometric renderer spec 5.1, 5.3). */
function planeCellAt(iso: IsoProjection, screenX: number, screenY: number): IVec3 {
  const world = iso.inSection(screenX, screenY, SECTION);
  return new IVec3(SECTION, Math.floor(world.y), Math.floor(world.z));
}

describe("PointerTarget: what the pointer addresses (pointing spec 2)", () => {
  // The bug this document was written for. If these two ever agree the rest of the suite
  // proves nothing, so the disagreement is asserted before it is resolved.
  it("a pick and the build-plane inverse disagree over a block outside the section", () => {
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const iso = new IsoProjection(ViewYaw.of(id), 20, 400, 300);
      const block = new IVec3(0, 1, -2);
      const at = overCentreOf(iso, block);
      const picked = CellPick.pick(iso, new Cells([block]), bounds, at.x, at.y);

      assert.notEqual(picked, null, "yaw " + id.toString() + " sees the block");
      assert.equal((picked as IVec3).equals(block), true);
      const plane = planeCellAt(iso, at.x, at.y);
      assert.equal(plane.x, SECTION);
      assert.equal(plane.equals(block), false, "yaw " + id.toString() + " resolves elsewhere");
    }
  });

  it("2.1: an inspect names the block under the pointer, not the plane cell", () => {
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const iso = new IsoProjection(ViewYaw.of(id), 20, 400, 300);
      const block = new IVec3(0, 1, -2);
      const at = overCentreOf(iso, block);
      const picked = CellPick.pick(iso, new Cells([block]), bounds, at.x, at.y);
      const named = PointerTarget.toInspect(picked, planeCellAt(iso, at.x, at.y));
      assert.equal(named.equals(block), true, "yaw " + id.toString());
    }
  });

  it("2.1: over empty scene an inspect falls back to the build-plane cell", () => {
    const iso = new IsoProjection(ViewYaw.of(0), 20, 400, 300);
    const at = overCentreOf(iso, new IVec3(0, 1, -2));
    const picked = CellPick.pick(iso, new Cells([]), bounds, at.x, at.y);
    assert.equal(picked, null);
    const plane = planeCellAt(iso, at.x, at.y);
    assert.equal(PointerTarget.toInspect(picked, plane).equals(plane), true);
  });

  it("2.2, 2.3: the eraser takes the picked block and a placing entry takes the plane", () => {
    const iso = new IsoProjection(ViewYaw.of(0), 20, 400, 300);
    const block = new IVec3(0, 1, -2);
    const at = overCentreOf(iso, block);
    const picked = CellPick.pick(iso, new Cells([block]), bounds, at.x, at.y);
    const plane = planeCellAt(iso, at.x, at.y);

    const placing = PointerTarget.toEdit(false, picked, plane);
    assert.notEqual(placing, null, "a placement always has somewhere to land");
    assert.equal((placing as IVec3).equals(plane), true, "2.3: placement stays plane-locked");

    const erasing = PointerTarget.toEdit(true, picked, plane);
    assert.notEqual(erasing, null);
    assert.equal((erasing as IVec3).equals(block), true, "2.2: the eraser takes the block");
  });

  it("2.2: the eraser over empty scene has nothing to erase", () => {
    const iso = new IsoProjection(ViewYaw.of(0), 20, 400, 300);
    const at = overCentreOf(iso, new IVec3(0, 1, -2));
    const plane = planeCellAt(iso, at.x, at.y);
    assert.equal(PointerTarget.toEdit(true, null, plane), null);
    // And a placing entry still lands, because the plane is always there to land in.
    const placing = PointerTarget.toEdit(false, null, plane);
    assert.equal((placing as IVec3).equals(plane), true);
  });
});
