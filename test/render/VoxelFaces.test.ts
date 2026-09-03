import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { IVec3 } from "../../src/core/IVec3";
import { CellPresence } from "../../src/render/CellPresence";
import { IsoProjection } from "../../src/render/IsoProjection";
import { ViewYaw } from "../../src/render/ViewYaw";
import { VoxelFace } from "../../src/render/VoxelFace";
import { VoxelFaces } from "../../src/render/VoxelFaces";

class Cells implements CellPresence {
  private readonly keys: string[];

  public constructor(filled: readonly IVec3[]) {
    const keys: string[] = [];
    for (let i = 0; i < filled.length; i++) {
      keys.push(filled[i].x.toString() + "," + filled[i].y.toString() + "," + filled[i].z.toString());
    }
    this.keys = keys;
  }

  public isSolid(x: number, y: number, z: number): boolean {
    return this.keys.indexOf(x.toString() + "," + y.toString() + "," + z.toString()) >= 0;
  }
}

describe("VoxelFaces: which faces are drawn (isometric renderer spec 3)", () => {
  it("draws the top and the two camera-facing sides, and nothing else", () => {
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      const facing = VoxelFaces.facing(yaw);
      assert.equal(facing.count, 3);
      assert.equal(facing.top.dy, 1);
      // The two sides are the ones whose normals point toward the camera, which is what the
      // yaw's own ray step is made of.
      assert.equal(facing.right.dx, yaw.rightDx);
      assert.equal(facing.right.dz, yaw.rightDz);
      assert.equal(facing.left.dx, yaw.leftDx);
      assert.equal(facing.left.dz, yaw.leftDz);
      assert.equal(facing.left.dx + facing.right.dx, yaw.rayStepX);
      assert.equal(facing.left.dz + facing.right.dz, yaw.rayStepZ);
    }
  });

  it("shades the top lightest and the screen-right face darkest, fixed to the screen", () => {
    // Spec 3: the light is fixed to the viewer, so a quarter turn never changes which side of
    // a turret is bright. The shades are therefore identical at all four yaws.
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const facing = VoxelFaces.facing(ViewYaw.of(id));
      assert.equal(facing.top.shade, VoxelFaces.TOP_SHADE);
      assert.equal(facing.left.shade, VoxelFaces.LEFT_SHADE);
      assert.equal(facing.right.shade, VoxelFaces.RIGHT_SHADE);
      assert.equal(facing.top.shade > facing.left.shade, true);
      assert.equal(facing.left.shade > facing.right.shade, true);
    }
  });

  it("hides a face whose neighbour is present", () => {
    const facing = VoxelFaces.facing(ViewYaw.initial);
    const alone = new Cells([new IVec3(0, 0, 0)]);
    assert.equal(VoxelFaces.isDrawn(alone, facing.top, 0, 0, 0), true);
    const roofed = new Cells([new IVec3(0, 0, 0), new IVec3(0, 1, 0)]);
    assert.equal(VoxelFaces.isDrawn(roofed, facing.top, 0, 0, 0), false);
    assert.equal(VoxelFaces.isDrawn(roofed, facing.top, 0, 1, 0), true);
    assert.equal(VoxelFaces.isDrawn(alone, facing.top, 5, 5, 5), false, "an empty cell draws nothing");
  });
});

describe("VoxelFaces: the edge rule (isometric renderer spec 3.1)", () => {
  it("leaves the seam through a flat wall alone and strokes the crease at its end", () => {
    const yaw = ViewYaw.initial;
    const facing = VoxelFaces.facing(yaw);
    // Two cells side by side along the lane, both with an open top: one continuous surface.
    const wall = new Cells([new IVec3(0, 0, 0), new IVec3(0, 0, 1)]);
    const top = facing.top;
    let sharedEdge = -1;
    let outerEdge = -1;
    for (let edge = 0; edge < VoxelFace.CORNER_COUNT; edge++) {
      if (top.edgeDz(edge) === 1) {
        sharedEdge = edge;
      }
      if (top.edgeDz(edge) === -1) {
        outerEdge = edge;
      }
    }
    assert.equal(VoxelFaces.isEdgeStroked(wall, top, 0, 0, 0, sharedEdge), false, "coplanar seam");
    assert.equal(VoxelFaces.isEdgeStroked(wall, top, 0, 0, 0, outerEdge), true, "silhouette");
  });

  it("strokes the crease against a taller neighbour", () => {
    const facing = VoxelFaces.facing(ViewYaw.initial);
    const step = new Cells([new IVec3(0, 0, 0), new IVec3(0, 0, 1), new IVec3(0, 1, 1)]);
    const top = facing.top;
    let toward = -1;
    for (let edge = 0; edge < VoxelFace.CORNER_COUNT; edge++) {
      if (top.edgeDz(edge) === 1) {
        toward = edge;
      }
    }
    // The neighbour has a block on top of it, so its own top face is not drawn and the
    // surface stops here: a crease, not a seam.
    assert.equal(VoxelFaces.isEdgeStroked(step, top, 0, 0, 0, toward), true);
  });
});

describe("VoxelFaces: the occlusion rule (isometric renderer spec 3.3)", () => {
  it("calls a cell occluded exactly when its three camera-facing neighbours are present", () => {
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      const centre = new IVec3(4, 2, 6);
      const above = new IVec3(centre.x, centre.y + 1, centre.z);
      const left = new IVec3(centre.x + yaw.leftDx, centre.y, centre.z + yaw.leftDz);
      const right = new IVec3(centre.x + yaw.rightDx, centre.y, centre.z + yaw.rightDz);
      const all = new Cells([centre, above, left, right]);
      assert.equal(VoxelFaces.isOccluded(all, yaw, centre.x, centre.y, centre.z), true);
      // Remove any one of the three and it is visible again.
      const withoutAbove = new Cells([centre, left, right]);
      assert.equal(VoxelFaces.isOccluded(withoutAbove, yaw, centre.x, centre.y, centre.z), false);
      const withoutLeft = new Cells([centre, above, right]);
      assert.equal(VoxelFaces.isOccluded(withoutLeft, yaw, centre.x, centre.y, centre.z), false);
      const withoutRight = new Cells([centre, above, left]);
      assert.equal(VoxelFaces.isOccluded(withoutRight, yaw, centre.x, centre.y, centre.z), false);
    }
  });

  it("is exact: those three neighbours cover the cell's hexagon and nothing is lost", () => {
    // The whole performance argument rests on this being a fact rather than a heuristic:
    // fill cost follows a design's surface, not its volume. Sampled over the hexagon of a
    // cell, every interior point falls inside at least one of the three neighbours.
    const yaw = ViewYaw.initial;
    const iso = new IsoProjection(yaw, 16, 0, 0);
    const hex = (x: number, y: number, z: number): number[][] => {
      const anchorX = iso.anchorX(x, z);
      const anchorY = iso.anchorY(x, y, z);
      const points: number[][] = [];
      for (let corner = 0; corner < IsoProjection.HEX_CORNERS; corner++) {
        points.push([anchorX + iso.hexOffsetX(corner), anchorY + iso.hexOffsetY(corner)]);
      }
      return points;
    };
    const inside = (poly: number[][], px: number, py: number): boolean => {
      let sign = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
        if (cross === 0) {
          continue;
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
    const own = hex(0, 0, 0);
    const neighbours = [
      hex(0, 1, 0),
      hex(yaw.leftDx, 0, yaw.leftDz),
      hex(yaw.rightDx, 0, yaw.rightDz),
    ];
    let sampled = 0;
    for (let i = 0; i < 60; i++) {
      for (let j = 0; j < 60; j++) {
        const px = -1 + (2 * 16 + 2) * (i / 59);
        const py = -1.6 * 16 + (2 * 16 + 3) * (j / 59);
        if (!inside(own, px, py)) {
          continue;
        }
        sampled += 1;
        let covered = false;
        for (let n = 0; n < neighbours.length; n++) {
          if (inside(neighbours[n], px, py)) {
            covered = true;
          }
        }
        assert.equal(covered, true, "uncovered point at " + px.toFixed(2) + "," + py.toFixed(2));
      }
    }
    assert.equal(sampled > 500, true, "the sample actually covered the hexagon");
  });
});
