import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { approxEqual } from "../../src/core/Numeric";
import { FieldDesign } from "../../src/render/FieldDesign";
import { IsoProjection } from "../../src/render/IsoProjection";
import { Projection } from "../../src/render/Projection";
import { ViewMode } from "../../src/render/ViewMode";
import { ViewState } from "../../src/render/ViewState";
import { ViewYaw } from "../../src/render/ViewYaw";
import { ZoomLadder } from "../../src/render/ZoomLadder";
import { Arena } from "../../src/sim/Arena";

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
    // the section index by exactly one, so every occluder of the build plane is in a nearer
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

  it("flips which side of the build plane is peeled between yaw 1 and yaw 2 (spec 2.2)", () => {
    assert.equal(ViewYaw.of(0).isInFront(1, 3), true);
    assert.equal(ViewYaw.of(1).isInFront(1, 3), true);
    assert.equal(ViewYaw.of(2).isInFront(1, 3), false);
    assert.equal(ViewYaw.of(2).isInFront(5, 3), true);
    assert.equal(ViewYaw.of(3).isInFront(5, 3), true);
  });
});

describe("IsoProjection: the two inverses (isometric renderer spec 5.1, 5.3)", () => {
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

  it("is the exact left inverse in the vertical build plane too, at every yaw", () => {
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const iso = new IsoProjection(ViewYaw.of(id), 24, -9, 45);
      for (let y = -3; y <= 5; y++) {
        for (let z = -4; z <= 4; z++) {
          const section = 2;
          const world = iso.inSection(iso.screenX(section, z), iso.screenY(section, y, z), section);
          assert.equal(world.x, section);
          assert.equal(approxEqual(world.y, y, 1e-9), true);
          assert.equal(approxEqual(world.z, z, 1e-9), true);
        }
      }
    }
  });

  it("resolves a click to one unambiguous cell of the build plane (spec 5.3)", () => {
    const scene = design();
    const view = new ViewState(2);
    Projection.fit(scene, view, 900, 600);
    const projection = new Projection(scene, view, 900, 600);
    const cell = projection.cellAt(
      projection.screenX(2, 4) + 2,
      projection.screenY(2, 1, 4) - 2
    );
    assert.equal(cell.x, 2);
    assert.equal(cell.y, 1);
    assert.equal(cell.z, 4);
  });
});

describe("Projection.fit (isometric renderer spec 2.4)", () => {
  it("chooses a rung of the ladder and puts the pad's ground plane on the anchor", () => {
    const scene = design();
    const view = new ViewState(scene.pad.minX);
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
      const view = new ViewState(scene.pad.minX);
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

  it("frames the flat dev view the way it always did (spec 9)", () => {
    const scene = design();
    const view = new ViewState(2);
    view.mode = ViewMode.Flat;
    Projection.fit(scene, view, 900, 600);
    const projection = new Projection(scene, view, 900, 600);
    // Sections coincide: x has no place on screen in that projection.
    assert.equal(projection.screenX(0, 4), projection.screenX(4, 4));
    assert.equal(projection.screenY(0, 1, 4), projection.screenY(4, 1, 9));
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
