import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { FieldDesign } from "../../src/render/FieldDesign";
import { IsoProjection } from "../../src/render/IsoProjection";
import { PeelPlane } from "../../src/render/PeelPlane";
import { Projection } from "../../src/render/Projection";
import { SectionCue } from "../../src/render/SectionCue";
import { ViewMode } from "../../src/render/ViewMode";
import { ViewState } from "../../src/render/ViewState";
import { ViewYaw } from "../../src/render/ViewYaw";
import { Arena } from "../../src/sim/Arena";

const dials = Dials.defaults();
const arena = Arena.p0();

function design(): FieldDesign {
  return FieldDesign.withDefaults(SampleBlueprints.standardTurret(), arena.pad, arena, dials);
}

describe("PeelPlane: the treatment table (isometric renderer spec 6)", () => {
  it("draws the build plane in full, peels what is in front and dims what is behind", () => {
    const yaw = ViewYaw.of(0); // nearer sections have the smaller x
    const peel = new PeelPlane(0, 4, 2, yaw, ViewMode.Iso, true);
    const plane = peel.cueFor(2);
    assert.equal(plane.active, true);
    assert.equal(plane.wireframe, false);
    assert.equal(plane.material, true);
    assert.equal(plane.detail, true);
    assert.equal(plane.dim, 0);

    const front = peel.cueFor(1);
    assert.equal(front.wireframe, true, "between the camera and the plane: cut away");
    assert.equal(front.inFront, true);
    assert.equal(front.material, false);

    const behind = peel.cueFor(3);
    assert.equal(behind.wireframe, false);
    assert.equal(behind.material, true);
    assert.equal(behind.detail, false, "glyphs behind the plane are noise");
    assert.equal(behind.dim > 0, true);
    assert.equal(peel.cueFor(4).dim > behind.dim, true, "dimmer with distance");
  });

  it("dims by mixing toward the background, never by alpha (spec 6.1)", () => {
    // Alpha composites multiply, so a translucent cell's luminance would depend on how many
    // cells sat behind it -- the one thing UI spec 4 forbids. Only the wireframe uses alpha.
    const peel = new PeelPlane(0, 4, 2, ViewYaw.of(0), ViewMode.Iso, true);
    assert.equal(peel.cueFor(3).alpha, 1);
    assert.equal(peel.cueFor(4).alpha, 1);
    assert.equal(peel.cueFor(1).alpha < 1, true);
    assert.equal(peel.cueFor(1).dim, 0);
    // Both ramps have a floor: a section faded to nothing has been deleted, not dimmed.
    assert.equal(peel.cueFor(0).alpha >= SectionCue.WIRE_FLOOR, true);
    assert.equal(new PeelPlane(0, 20, 20, ViewYaw.of(0), ViewMode.Iso, true).cueFor(0).dim <= SectionCue.DIM_CEILING, true);
  });

  it("flips the peeled side with the yaw (spec 2.2)", () => {
    assert.equal(new PeelPlane(0, 4, 2, ViewYaw.of(1), ViewMode.Iso, true).isPeeled(1), true);
    assert.equal(new PeelPlane(0, 4, 2, ViewYaw.of(1), ViewMode.Iso, true).isPeeled(3), false);
    assert.equal(new PeelPlane(0, 4, 2, ViewYaw.of(2), ViewMode.Iso, true).isPeeled(3), true);
    assert.equal(new PeelPlane(0, 4, 2, ViewYaw.of(2), ViewMode.Iso, true).isPeeled(1), false);
  });

  it("peels nothing at all when nothing is being peeled: the game view (spec 6)", () => {
    const solid = new PeelPlane(0, 4, 2, ViewYaw.of(0), ViewMode.Iso, false);
    assert.equal(solid.peeledCount, 0);
    for (let x = 0; x <= 4; x++) {
      assert.equal(solid.cueFor(x).wireframe, false);
      assert.equal(solid.cueFor(x).material, true);
      assert.equal(solid.cueFor(x).dim, 0, "a Run frame does not fade half a turret");
    }
    assert.equal(solid.cueFor(2).detail, true, "the build plane still carries the glyphs");
  });

  it("counts the peel, because a cutaway a tester has not noticed reads as a missing wall", () => {
    assert.equal(new PeelPlane(0, 4, 2, ViewYaw.of(0), ViewMode.Iso, true).peeledCount, 2);
    assert.equal(new PeelPlane(0, 4, 0, ViewYaw.of(0), ViewMode.Iso, true).peeledCount, 0);
    assert.equal(new PeelPlane(0, 4, 4, ViewYaw.of(0), ViewMode.Iso, true).peeledCount, 4);
  });

  it("ghosts every other section in the flat dev view, and peels nothing (spec 9)", () => {
    const flat = new PeelPlane(0, 4, 2, ViewYaw.of(0), ViewMode.Flat, true);
    assert.equal(flat.peeledCount, 0, "there is no depth to peel");
    assert.equal(flat.cueFor(1).material, false);
    assert.equal(flat.cueFor(3).material, false);
    assert.equal(flat.cueFor(2).active, true);
    // The flat view's one ordering rule -- the active section draws last, so the ghosts stay
    // behind it -- lives in the depth key, which is what lets one composition serve both
    // projections.
    const scene = design();
    const view = new ViewState(2);
    view.mode = ViewMode.Flat;
    const projection = new Projection(scene, view, 900, 600);
    assert.equal(projection.depthKey(2, 0, 0) > projection.depthKey(1, 9, 9), true);
    assert.equal(projection.depthKey(2, 0, 0) > projection.depthKey(3, 9, 9), true);
    assert.equal(projection.depthKey(1, 0, 0), projection.depthKey(3, 5, 5));
  });
});

describe("PeelPlane: the property it is argued from (isometric renderer spec 6)", () => {
  /**
   * The claim: peeling the sections in front of the build plane is *exactly enough*, because
   * one step along the view ray changes the section index by exactly one. This walks the ray
   * out of every build-plane cell and asserts that everything on it is peeled.
   */
  it("puts every cell on the ray out of the build plane in a peeled section", () => {
    const scene = design();
    const blueprint = scene.blueprint;
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      for (let section = scene.sliceMin; section <= scene.sliceMax; section++) {
        const peel = new PeelPlane(scene.sliceMin, scene.sliceMax, section, yaw, ViewMode.Iso, true);
        for (let i = 0; i < blueprint.blockCount; i++) {
          const cell = blueprint.blockAt(i).position;
          if (cell.x !== section) {
            continue;
          }
          for (let step = 1; step <= 8; step++) {
            const x = cell.x + yaw.rayStepX * step;
            const y = cell.y + step;
            const z = cell.z + yaw.rayStepZ * step;
            if (blueprint.indexOfCell(x, y, z) < 0) {
              continue;
            }
            assert.equal(
              peel.isPeeled(x),
              true,
              "yaw " + id.toString() + ": an occluder of the build plane was left solid"
            );
          }
        }
      }
    }
  });

  /**
   * The same claim, checked on screen rather than along the ray: no unpeeled cell **from
   * another section** covers any part of a build-plane cell's silhouette.
   *
   * The qualifier is the whole content of spec 6's second paragraph. Cubes within one plane
   * do overlap each other -- a section is a plane of cubes, not a sheet of tiles -- and the
   * offsets that can do it are up, one along the lane, and the diagonal of those two. Those
   * cells are in the plane the click resolves in, so they are not a depth ambiguity. Anything
   * else that covers the plane is in a nearer section, and is peeled. This asserts both
   * halves: nothing from another section survives, and what survives is only ever in-plane.
   */
  it("leaves no unpeeled cell from another section projecting over the build plane", () => {
    const scene = design();
    const blueprint = scene.blueprint;
    const yaw = ViewYaw.of(0);
    const iso = new IsoProjection(yaw, 16, 0, 0);

    const corners = (x: number, y: number, z: number): number[][] => {
      const anchorX = iso.anchorX(x, z);
      const anchorY = iso.anchorY(x, y, z);
      const points: number[][] = [];
      for (let corner = 0; corner < IsoProjection.HEX_CORNERS; corner++) {
        points.push([anchorX + iso.hexOffsetX(corner), anchorY + iso.hexOffsetY(corner)]);
      }
      return points;
    };
    // Strictly inside: a shared edge is a touch, not a covering.
    const inside = (poly: number[][], px: number, py: number): boolean => {
      let sign = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
        if (cross === 0) {
          return false;
        }
        const current = cross > 0 ? 1 : -1;
        if (sign === 0) {
          sign = current;
        } else if (sign !== current) {
          return false;
        }
      }
      return true;
    };

    let inPlaneOverlaps = 0;
    for (let section = scene.sliceMin; section <= scene.sliceMax; section++) {
      const peel = new PeelPlane(scene.sliceMin, scene.sliceMax, section, yaw, ViewMode.Iso, true);
      for (let i = 0; i < blueprint.blockCount; i++) {
        const cell = blueprint.blockAt(i).position;
        if (cell.x !== section) {
          continue;
        }
        // Sample the cell's own silhouette rather than one point of it: a partial covering is
        // still a covering.
        const own = corners(cell.x, cell.y, cell.z);
        const samples: number[][] = [];
        for (let sx = 1; sx < 12; sx++) {
          for (let sy = 1; sy < 12; sy++) {
            const px = own[0][0] + (32 * sx) / 12;
            const py = own[4][1] + (32 * sy) / 12;
            if (inside(own, px, py)) {
              samples.push([px, py]);
            }
          }
        }
        assert.equal(samples.length > 20, true, "the sample covered the silhouette");

        for (let j = 0; j < blueprint.blockCount; j++) {
          const other = blueprint.blockAt(j).position;
          if (j === i || peel.isPeeled(other.x)) {
            continue;
          }
          if (yaw.depthKey(other.x, other.y, other.z) <= yaw.depthKey(cell.x, cell.y, cell.z)) {
            continue;
          }
          const hex = corners(other.x, other.y, other.z);
          let covers = false;
          for (let k = 0; k < samples.length; k++) {
            if (inside(hex, samples[k][0], samples[k][1])) {
              covers = true;
            }
          }
          if (!covers) {
            continue;
          }
          assert.equal(
            other.x,
            cell.x,
            "an unpeeled cell from another section covers the build plane"
          );
          inPlaneOverlaps += 1;
        }
      }
    }
    // And the in-plane case really does occur, so the assertion above is not vacuous.
    assert.equal(inPlaneOverlaps > 0, true);
  });
});
