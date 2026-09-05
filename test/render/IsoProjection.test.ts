import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { approxEqual } from "../../src/core/Numeric";
import { CellPresence } from "../../src/render/CellPresence";
import { FaceHit } from "../../src/render/FaceHit";
import { FieldDesign } from "../../src/render/FieldDesign";
import { IsoProjection } from "../../src/render/IsoProjection";
import { Projection } from "../../src/render/Projection";
import { ViewState } from "../../src/render/ViewState";
import { ViewYaw } from "../../src/render/ViewYaw";
import { ZoomLadder } from "../../src/render/ZoomLadder";
import { Arena } from "../../src/sim/Arena";
import { GridBounds } from "../../src/core/GridBounds";
import { IVec3 } from "../../src/core/IVec3";

const dials = Dials.defaults();
const arena = Arena.p0();

function design(): FieldDesign {
  return FieldDesign.withDefaults(SampleBlueprints.standardTurret(), arena.pad, arena, dials);
}

describe("IsoProjection: the projection (isometric renderer spec 2.1)", () => {
  it("puts a voxel's top face at 2s by s and its vertical edge at exactly s", () => {
    const iso = new IsoProjection(ViewYaw.initial, 16, 0, 0);
    // The top face's four corners, at y = 1 over the cell at the origin.
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < corners.length; i++) {
      const sx = iso.screenX(corners[i][0], corners[i][1]);
      const sy = iso.screenY(corners[i][0], 1, corners[i][1]);
      minX = sx < minX ? sx : minX;
      maxX = sx > maxX ? sx : maxX;
      minY = sy < minY ? sy : minY;
      maxY = sy > maxY ? sy : maxY;
    }
    assert.equal(maxX - minX, 32);
    assert.equal(maxY - minY, 16);
    // One voxel up is exactly s pixels up, at every yaw.
    for (let yaw = 0; yaw < ViewYaw.COUNT; yaw++) {
      const p = new IsoProjection(ViewYaw.of(yaw), 16, 0, 0);
      assert.equal(p.screenY(0, 0, 0) - p.screenY(0, 1, 0), 16);
    }
  });

  it("offsets a section by (s, s/2) up-right and a lane step by (s, s/2) down-right", () => {
    const iso = new IsoProjection(ViewYaw.initial, 16, 0, 0);
    // Yaw 0: p = z runs down-right, r = x runs up-right (spec 2.2).
    assert.equal(iso.screenX(0, 1) - iso.screenX(0, 0), 16);
    assert.equal(iso.screenY(0, 0, 1) - iso.screenY(0, 0, 0), 8);
    assert.equal(iso.screenX(1, 0) - iso.screenX(0, 0), 16);
    assert.equal(iso.screenY(1, 0, 0) - iso.screenY(0, 0, 0), -8);
  });

  it("keeps every projected vertex on a whole pixel, at every rung (spec 2.3)", () => {
    for (let rung = 0; rung < ZoomLadder.RUNGS.length; rung++) {
      const scale = ZoomLadder.RUNGS[rung];
      assert.equal(scale % 2, 0);
      for (let yaw = 0; yaw < ViewYaw.COUNT; yaw++) {
        const iso = new IsoProjection(ViewYaw.of(yaw), scale, 13, -7);
        for (let x = -3; x <= 3; x++) {
          for (let y = -3; y <= 3; y++) {
            for (let z = -3; z <= 3; z++) {
              assert.equal(Number.isInteger(iso.screenX(x, z)), true);
              assert.equal(Number.isInteger(iso.screenY(x, y, z)), true);
            }
          }
        }
      }
    }
  });
});

describe("IsoProjection: the yaw table (isometric renderer spec 2.2)", () => {
  it("reads the world axes off each quarter turn, as the table says", () => {
    const rows = [
      { p: [0, 1], r: [1, 0] },
      { p: [-1, 0], r: [0, 1] },
      { p: [0, -1], r: [-1, 0] },
      { p: [1, 0], r: [0, -1] },
    ];
    for (let id = 0; id < rows.length; id++) {
      const yaw = ViewYaw.of(id);
      assert.equal(yaw.pOfX, rows[id].p[0]);
      assert.equal(yaw.pOfZ, rows[id].p[1]);
      assert.equal(yaw.rOfX, rows[id].r[0]);
      assert.equal(yaw.rOfZ, rows[id].r[1]);
    }
  });

  it("steps one unit on every axis along the view ray, at every yaw (spec 5.2)", () => {
    // The magnitude on x is what spec 6's proof rests on: one step toward the camera changes
    // the section index by exactly one, so every occluder of the reach plane is in a nearer
    // section.
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      assert.equal(Math.abs(yaw.rayStepX), 1);
      assert.equal(Math.abs(yaw.rayStepZ), 1);
      assert.equal(yaw.rayStepY, 1);
    }
    assert.equal(ViewYaw.of(0).rayStepX, -1);
    assert.equal(ViewYaw.of(0).rayStepZ, 1);
    assert.equal(ViewYaw.of(2).rayStepX, 1);
    assert.equal(ViewYaw.of(2).rayStepZ, -1);
  });

  it("moves along the view ray without moving on screen at all", () => {
    // The ray is the projection's null direction: that is what makes it the ray.
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      const iso = new IsoProjection(yaw, 20, 100, 200);
      const x = 2;
      const y = 1;
      const z = 5;
      assert.equal(
        iso.screenX(x + yaw.rayStepX, z + yaw.rayStepZ),
        iso.screenX(x, z)
      );
      assert.equal(
        iso.screenY(x + yaw.rayStepX, y + yaw.rayStepY, z + yaw.rayStepZ),
        iso.screenY(x, y, z)
      );
    }
  });

  it("turns in quarters and wraps both ways", () => {
    assert.equal(ViewYaw.of(0).turned(1).id, 1);
    assert.equal(ViewYaw.of(0).turned(-1).id, 3);
    assert.equal(ViewYaw.of(3).turned(1).id, 0);
    assert.equal(ViewYaw.of(2).turned(4).id, 2);
  });

  it("puts the camera on the other side of the turret between yaw 1 and yaw 2 (spec 2.2)", () => {
    // `rayStepX` is the sign the section index moves in one step away from the camera, and
    // it is the only thing left that remembers which side the camera is on.
    assert.equal(ViewYaw.of(0).rayStepX, -1);
    assert.equal(ViewYaw.of(1).rayStepX, -1);
    assert.equal(ViewYaw.of(2).rayStepX, 1);
    assert.equal(ViewYaw.of(3).rayStepX, 1);
  });
});

describe("IsoProjection: the plane inverse (isometric renderer spec 5.1)", () => {
  it("is the exact left inverse of the projection on a horizontal plane, at every rung", () => {
    for (let rung = 0; rung < ZoomLadder.RUNGS.length; rung++) {
      for (let id = 0; id < ViewYaw.COUNT; id++) {
        const iso = new IsoProjection(ViewYaw.of(id), ZoomLadder.RUNGS[rung], 31, 17);
        for (let x = -4; x <= 4; x++) {
          for (let z = -4; z <= 4; z++) {
            const level = 3;
            const world = iso.onLevel(iso.screenX(x, z), iso.screenY(x, level, z), level);
            assert.equal(approxEqual(world.x, x, 1e-9), true);
            assert.equal(approxEqual(world.z, z, 1e-9), true);
            assert.equal(world.y, level);
          }
        }
      }
    }
  });

});

describe("Projection.fit (isometric renderer spec 2.4)", () => {
  it("chooses a rung of the ladder and puts the pad's ground plane on the anchor", () => {
    const scene = design();
    const view = new ViewState();
    Projection.fit(scene, view, 900, 600);
    assert.equal(ZoomLadder.RUNGS.indexOf(view.scale) >= 0, true);
    assert.equal(Number.isInteger(view.panX), true);
    assert.equal(Number.isInteger(view.panY), true);
    const projection = new Projection(scene, view, 900, 600);
    const padX = (scene.pad.minX + scene.pad.maxX + 1) * 0.5;
    const padZ = (scene.pad.minZ + scene.pad.maxZ + 1) * 0.5;
    const groundY = projection.screenY(padX, scene.pad.level, padZ);
    assert.equal(approxEqual(groundY, 600 * Projection.GROUND_ANCHOR, 1.0), true);
  });

  it("keeps the world box inside the viewport at every yaw", () => {
    const scene = design();
    const bounds = scene.viewBounds;
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const view = new ViewState();
      view.yaw = ViewYaw.of(id);
      Projection.fit(scene, view, 900, 600);
      const projection = new Projection(scene, view, 900, 600);
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      for (let cx = 0; cx < 2; cx++) {
        for (let cz = 0; cz < 2; cz++) {
          const x = cx === 0 ? bounds.min.x : bounds.min.x + bounds.size.x;
          const z = cz === 0 ? bounds.min.z : bounds.min.z + bounds.size.z;
          const sx = projection.screenX(x, z);
          minX = sx < minX ? sx : minX;
          maxX = sx > maxX ? sx : maxX;
        }
      }
      assert.equal(maxX - minX <= 900, true);
    }
  });

  it("gives every section its own place on screen (spec 2.1)", () => {
    // The one thing the flat dev view could never do, and the reason it is gone with the
    // cross-section it drew (no-sections spec 2.1).
    const scene = design();
    const view = new ViewState();
    Projection.fit(scene, view, 900, 600);
    const projection = new Projection(scene, view, 900, 600);
    assert.notEqual(projection.screenX(0, 4), projection.screenX(4, 4));
  });
});

describe("ZoomLadder (isometric renderer spec 2.3)", () => {
  it("is even integers only, so s/2 is a whole number of pixels", () => {
    for (let i = 0; i < ZoomLadder.RUNGS.length; i++) {
      assert.equal(ZoomLadder.RUNGS[i] % 2, 0);
      if (i > 0) {
        assert.equal(ZoomLadder.RUNGS[i] > ZoomLadder.RUNGS[i - 1], true);
      }
    }
  });

  it("snaps an arbitrary zoom to the nearest rung", () => {
    assert.equal(ZoomLadder.snap(17), 16);
    assert.equal(ZoomLadder.snap(19), 20);
    assert.equal(ZoomLadder.snap(1), 8);
    assert.equal(ZoomLadder.snap(1000), 48);
  });

  it("always moves at least one rung when a factor is applied", () => {
    // A small pinch must not resolve to the rung it started on, or the gesture does nothing.
    assert.equal(ZoomLadder.scaled(16, 1.05), 20);
    assert.equal(ZoomLadder.scaled(16, 0.95), 12);
    assert.equal(ZoomLadder.scaled(8, 0.5), 8);
    assert.equal(ZoomLadder.scaled(48, 2), 48);
  });
});

describe("Projection: where a placement lands (face-placement spec 2)", () => {
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

  function fitted(scene: FieldDesign, view: ViewState): Projection {
    Projection.fit(scene, view, 900, 600);
    return new Projection(scene, view, 900, 600);
  }

  it("2.2: a click on the empty pad places the cell resting on it", () => {
    const scene = design();
    const pad = scene.pad;
    const view = new ViewState();
    const projection = fitted(scene, view);
    const empty = new Cells([]);
    const bounds: GridBounds = scene.viewBounds;
    const screenX = projection.screenX(pad.minX + 0.5, pad.minZ + 0.5);
    const screenY = projection.screenY(pad.minX + 0.5, pad.level, pad.minZ + 0.5);
    const picked = projection.pick(empty, bounds, screenX, screenY);
    assert.equal(picked, null, "nothing built yet");
    const target = projection.placementAt(picked, empty, screenX, screenY);
    assert.notEqual(target, null);
    const cell = target as IVec3;
    assert.equal(cell.y, pad.level);
    assert.equal(pad.supportsBlockAt(cell), true, "and it rests on the pad");
  });

  it("2.1: a click on a block's top face places the cell above it", () => {
    const scene = design();
    const pad = scene.pad;
    const view = new ViewState();
    const projection = fitted(scene, view);
    const standing = new IVec3(pad.minX, pad.level, pad.minZ);
    const cells = new Cells([standing]);
    const screenX = projection.screenX(standing.x + 0.5, standing.z + 0.5);
    const screenY = projection.screenY(standing.x + 0.5, standing.y + 1, standing.z + 0.5);
    const picked = projection.pick(cells, scene.viewBounds, screenX, screenY);
    assert.notEqual(picked, null);
    assert.equal((picked as FaceHit).cell.equals(standing), true);
    const target = projection.placementAt(picked, cells, screenX, screenY);
    assert.notEqual(target, null);
    assert.equal(
      (target as IVec3).equals(new IVec3(standing.x, standing.y + 1, standing.z)),
      true
    );
  });

});

describe("Projection: a placement can never collide (no-sections spec 2.3)", () => {
  /** A hand-written set of cells, the same shape `CellPick`'s own suite uses. */
  class Cells implements CellPresence {
    private readonly filled: readonly string[];

    public constructor(filled: readonly string[]) {
      this.filled = filled;
    }

    public static ofBlueprint(scene: FieldDesign): Cells {
      const keys: string[] = [];
      const blueprint = scene.blueprint;
      for (let i = 0; i < blueprint.blockCount; i++) {
        const cell = blueprint.blockAt(i).position;
        keys.push(Cells.key(cell.x, cell.y, cell.z));
      }
      return new Cells(keys);
    }

    private static key(x: number, y: number, z: number): string {
      return x.toString() + "," + y.toString() + "," + z.toString();
    }

    public isSolid(x: number, y: number, z: number): boolean {
      return this.filled.indexOf(Cells.key(x, y, z)) >= 0;
    }
  }

  /**
   * The theorem, asserted rather than assumed.
   *
   * > The ray enters a block through the face it last crossed, so the cell across that face
   * > is the cell the ray visited immediately before -- and the traversal only got there by
   * > finding that cell empty.
   *
   * Swept over the whole canvas at every yaw, on a worked example: if a single screen point
   * resolved onto a block, the guard in `PlacementRule` would be live and the proof wrong.
   */
  it("never targets an occupied cell, over every screen point and every yaw", () => {
    const scene = design();
    const cells = Cells.ofBlueprint(scene);
    let hits = 0;
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const view = new ViewState();
      view.yaw = ViewYaw.of(id);
      Projection.fit(scene, view, 900, 600);
      const projection = new Projection(scene, view, 900, 600);
      for (let sx = 0; sx < 900; sx += 7) {
        for (let sy = 0; sy < 600; sy += 7) {
          const picked = projection.pick(cells, scene.viewBounds, sx, sy);
          const target = projection.placementAt(picked, cells, sx, sy);
          if (target === null) {
            continue;
          }
          hits++;
          assert.equal(
            cells.isSolid(target.x, target.y, target.z),
            false,
            "yaw " + id.toString() + " at " + sx.toString() + "," + sy.toString()
          );
        }
      }
    }
    // The sweep is worth nothing if it never landed on the turret.
    assert.ok(hits > 200, "the sweep found somewhere to build " + hits.toString() + " times");
  });

  it("a placement against a block is always the cell the ray came through", () => {
    const scene = design();
    const cells = Cells.ofBlueprint(scene);
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const view = new ViewState();
      view.yaw = ViewYaw.of(id);
      Projection.fit(scene, view, 900, 600);
      const projection = new Projection(scene, view, 900, 600);
      let checked = 0;
      for (let sx = 0; sx < 900; sx += 11) {
        for (let sy = 0; sy < 600; sy += 11) {
          const picked = projection.pick(cells, scene.viewBounds, sx, sy);
          if (picked === null) {
            continue;
          }
          const target = projection.placementAt(picked, cells, sx, sy);
          assert.notEqual(target, null, "a face always has a cell across it");
          assert.equal((target as IVec3).equals(picked.adjacent()), true);
          checked++;
        }
      }
      assert.ok(checked > 50, "yaw " + id.toString() + " saw the turret");
    }
  });
});
