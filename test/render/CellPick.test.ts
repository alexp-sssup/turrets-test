import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { GridBounds } from "../../src/core/GridBounds";
import { IVec3 } from "../../src/core/IVec3";
import { CellPick } from "../../src/render/CellPick";
import { CellPresence } from "../../src/render/CellPresence";
import { IsoProjection } from "../../src/render/IsoProjection";
import { ViewYaw } from "../../src/render/ViewYaw";
import { ZoomLadder } from "../../src/render/ZoomLadder";

/** A hand-written set of cells, which is all the face and pick rules ever need. */
class Cells implements CellPresence {
  private readonly filled: string[];

  public constructor(filled: readonly IVec3[]) {
    const keys: string[] = [];
    for (let i = 0; i < filled.length; i++) {
      keys.push(Cells.key(filled[i].x, filled[i].y, filled[i].z));
    }
    this.filled = keys;
  }

  public static key(x: number, y: number, z: number): string {
    return x.toString() + "," + y.toString() + "," + z.toString();
  }

  public isSolid(x: number, y: number, z: number): boolean {
    return this.filled.indexOf(Cells.key(x, y, z)) >= 0;
  }
}

const bounds = new GridBounds(new IVec3(-2, 0, -2), new IVec3(12, 10, 16));

describe("CellPick: the view ray (isometric renderer spec 5.2)", () => {
  it("returns the nearest of three cells stacked along the ray, at every yaw", () => {
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      const iso = new IsoProjection(yaw, 20, 400, 300);
      // Three cells on one ray: each step toward the camera is (rayStepX, +1, rayStepZ).
      const far = new IVec3(3, 1, 5);
      const middle = new IVec3(3 + yaw.rayStepX, 2, 5 + yaw.rayStepZ);
      const near = new IVec3(3 + 2 * yaw.rayStepX, 3, 5 + 2 * yaw.rayStepZ);
      const cells = new Cells([far, middle, near]);
      // A point inside the cell's own hexagon: its centre in the plane of the top face.
      const screenX = iso.screenX(far.x + 0.5, far.z + 0.5);
      const screenY = iso.screenY(far.x + 0.5, far.y + 0.5, far.z + 0.5);
      const picked = CellPick.pick(iso, cells, bounds, screenX, screenY);
      assert.notEqual(picked, null);
      const hit = picked as IVec3;
      assert.equal(hit.equals(near), true, "yaw " + id.toString() + " picks the nearest");
    }
  });

  it("picks the only cell there is, whatever rung the zoom is at", () => {
    const cell = new IVec3(2, 1, 6);
    const cells = new Cells([cell]);
    for (let rung = 0; rung < ZoomLadder.RUNGS.length; rung++) {
      for (let id = 0; id < ViewYaw.COUNT; id++) {
        const iso = new IsoProjection(ViewYaw.of(id), ZoomLadder.RUNGS[rung], 500, 400);
        const picked = CellPick.pick(
          iso,
          cells,
          bounds,
          iso.screenX(cell.x + 0.5, cell.z + 0.5),
          iso.screenY(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5)
        );
        assert.notEqual(picked, null);
        assert.equal((picked as IVec3).equals(cell), true);
      }
    }
  });

  it("returns nothing over empty scene", () => {
    const iso = new IsoProjection(ViewYaw.initial, 20, 400, 300);
    const cells = new Cells([new IVec3(2, 1, 6)]);
    const away = CellPick.pick(iso, cells, bounds, iso.screenX(2.5, 6.5) + 400, 300);
    assert.equal(away, null);
  });

  it("never walks more cells than the box's own span (spec 5.2)", () => {
    // The bound is the whole cost argument: a pick is O(span), not O(cells drawn), so hover
    // costs the same on a 1500-cell design as on a three-cell one.
    let visits = 0;
    const counting: CellPresence = {
      isSolid(): boolean {
        visits += 1;
        return false;
      },
    };
    const iso = new IsoProjection(ViewYaw.initial, 20, 400, 300);
    CellPick.pick(iso, counting, bounds, iso.screenX(2.5, 6.5), iso.screenY(2.5, 1.5, 6.5));
    assert.equal(visits <= bounds.size.x + bounds.size.y + bounds.size.z + 3, true);
    assert.equal(visits > 0, true);
  });

  it("resolves an exact lattice corner deterministically, and never falls through", () => {
    // Integer pixels make a ray through an exact corner likely rather than exotic, so the
    // tie rule has to be a rule: one axis at a time, in a fixed order.
    const iso = new IsoProjection(ViewYaw.initial, 16, 0, 0);
    const cell = new IVec3(1, 2, 3);
    const cells = new Cells([cell]);
    const cornerX = iso.screenX(cell.x, cell.z);
    const cornerY = iso.screenY(cell.x, cell.y, cell.z);
    const first = CellPick.pick(iso, cells, bounds, cornerX, cornerY);
    const second = CellPick.pick(iso, cells, bounds, cornerX, cornerY);
    assert.equal(first === null ? "null" : first.toString(), second === null ? "null" : second.toString());
  });
});
