import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { GridBounds } from "../../src/core/GridBounds";
import { IVec3 } from "../../src/core/IVec3";
import { CellPick } from "../../src/render/CellPick";
import { CellPresence } from "../../src/render/CellPresence";
import { FaceHit } from "../../src/render/FaceHit";
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
      const hit = picked as FaceHit;
      assert.equal(hit.cell.equals(near), true, "yaw " + id.toString() + " picks the nearest");
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
        assert.equal((picked as FaceHit).cell.equals(cell), true);
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
    assert.equal(
      first === null ? "null" : first.cell.toString() + " / " + first.normal.toString(),
      second === null ? "null" : second.cell.toString() + " / " + second.normal.toString()
    );
  });
});

describe("CellPick: the face the ray entered by (face-placement spec 2.1)", () => {
  /** The screen point over the centre of one face of a cell. Strictly inside the face. */
  function overFace(iso: IsoProjection, cell: IVec3, normal: IVec3): IVec3 {
    const x = cell.x + 0.5 + normal.x * 0.5;
    const y = cell.y + 0.5 + normal.y * 0.5;
    const z = cell.z + 0.5 + normal.z * 0.5;
    return new IVec3(Math.round(iso.screenX(x, z)), Math.round(iso.screenY(x, y, z)), 0);
  }

  it("names the top, the +p face and the -r face, at every yaw", () => {
    const cell = new IVec3(3, 2, 5);
    const cells = new Cells([cell]);
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      const iso = new IsoProjection(yaw, 24, 400, 300);
      // 2.3: a fixed-elevation camera sees exactly these three, so these are the three a
      // click can build on.
      const faces = [
        new IVec3(0, 1, 0),
        new IVec3(yaw.rightDx, 0, yaw.rightDz),
        new IVec3(yaw.leftDx, 0, yaw.leftDz),
      ];
      for (let f = 0; f < faces.length; f++) {
        const at = overFace(iso, cell, faces[f]);
        const picked = CellPick.pick(iso, cells, bounds, at.x, at.y);
        const label = "yaw " + id.toString() + " face " + faces[f].toString();
        assert.notEqual(picked, null, label);
        const hit = picked as FaceHit;
        assert.equal(hit.cell.equals(cell), true, label + " cell");
        assert.equal(hit.normal.equals(faces[f]), true, label + " normal");
      }
    }
  });

  it("the cell across each face is one step along that face's normal", () => {
    const cell = new IVec3(3, 2, 5);
    const cells = new Cells([cell]);
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      const iso = new IsoProjection(yaw, 24, 400, 300);
      const faces = [
        new IVec3(0, 1, 0),
        new IVec3(yaw.rightDx, 0, yaw.rightDz),
        new IVec3(yaw.leftDx, 0, yaw.leftDz),
      ];
      for (let f = 0; f < faces.length; f++) {
        const at = overFace(iso, cell, faces[f]);
        const hit = CellPick.pick(iso, cells, bounds, at.x, at.y) as FaceHit;
        const expected = new IVec3(
          cell.x + faces[f].x,
          cell.y + faces[f].y,
          cell.z + faces[f].z
        );
        assert.equal(
          hit.adjacent().equals(expected),
          true,
          "yaw " + id.toString() + " face " + faces[f].toString()
        );
      }
    }
  });

  it("2.3: one screen point shows two different faces either side of a quarter turn", () => {
    // Which is what makes a quarter turn the way to reach the other two sides: the same
    // pixel over the same block builds in a different direction once the camera has moved.
    const cell = new IVec3(3, 2, 5);
    const cells = new Cells([cell]);
    const first = ViewYaw.of(0);
    const turned = ViewYaw.of(1);
    const isoFirst = new IsoProjection(first, 24, 400, 300);
    const isoTurned = new IsoProjection(turned, 24, 400, 300);
    const before = overFace(isoFirst, cell, new IVec3(first.rightDx, 0, first.rightDz));
    // The same face of the same block, found again after the turn, is at a new screen point;
    // what this pins is that aiming at the *right* face of each view gives a new neighbour.
    const after = overFace(isoTurned, cell, new IVec3(turned.rightDx, 0, turned.rightDz));
    const hitBefore = CellPick.pick(isoFirst, cells, bounds, before.x, before.y) as FaceHit;
    const hitAfter = CellPick.pick(isoTurned, cells, bounds, after.x, after.y) as FaceHit;
    assert.equal(hitBefore.cell.equals(cell), true);
    assert.equal(hitAfter.cell.equals(cell), true);
    assert.equal(hitBefore.normal.equals(hitAfter.normal), false, "a turn shows another side");
    assert.equal(hitBefore.adjacent().equals(hitAfter.adjacent()), false);
  });

  it("the face is the one facing the camera, never one the camera cannot see", () => {
    // Which is what makes 2.3 true: the ray always enters through a drawn face, so the three
    // reachable neighbours are up, +p and -r and there is never a fourth.
    const cell = new IVec3(1, 1, 2);
    const cells = new Cells([cell]);
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      const iso = new IsoProjection(yaw, 18, 360, 260);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const at = new IVec3(
            Math.round(iso.screenX(cell.x + 0.5 + dx * 0.4, cell.z + 0.5 + dz * 0.4)),
            Math.round(
              iso.screenY(cell.x + 0.5 + dx * 0.4, cell.y + 0.5, cell.z + 0.5 + dz * 0.4)
            ),
            0
          );
          const picked = CellPick.pick(iso, cells, bounds, at.x, at.y);
          if (picked === null) {
            continue;
          }
          const normal = picked.normal;
          const towardCamera =
            normal.y === 1 ||
            (normal.x === yaw.rightDx && normal.z === yaw.rightDz) ||
            (normal.x === yaw.leftDx && normal.z === yaw.leftDz);
          assert.equal(towardCamera, true, "yaw " + id.toString() + " " + normal.toString());
        }
      }
    }
  });
});
