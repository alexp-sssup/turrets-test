import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { IVec3 } from "../../src/core/IVec3";
import { GroundPick } from "../../src/render/GroundPick";
import { IsoProjection } from "../../src/render/IsoProjection";
import { ViewYaw } from "../../src/render/ViewYaw";
import { PadSurface } from "../../src/structure/SupportSurface";

/** A pad three wide and five deep, standing at y = 0. */
const pad = new PadSurface(0, 0, 2, 0, 4);

describe("GroundPick: the pad is a face (face-placement spec 2.2)", () => {
  it("names the pad cell the ray crosses the surface in, at every yaw and rung", () => {
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      for (let scale = 12; scale <= 32; scale += 4) {
        const iso = new IsoProjection(ViewYaw.of(id), scale, 400, 300);
        for (let x = pad.minX; x <= pad.maxX; x++) {
          for (let z = pad.minZ; z <= pad.maxZ; z++) {
            const screenX = iso.screenX(x + 0.5, z + 0.5);
            const screenY = iso.screenY(x + 0.5, pad.level, z + 0.5);
            const cell = GroundPick.at(iso, pad, screenX, screenY);
            const label = "yaw " + id.toString() + " cell " + x.toString() + "," + z.toString();
            assert.notEqual(cell, null, label);
            assert.equal((cell as IVec3).equals(new IVec3(x, pad.level, z)), true, label);
          }
        }
      }
    }
  });

  it("a block placed on the pad rests on it", () => {
    // The whole point of resolving at `pad.level` rather than one below it: the cell the ray
    // crosses the surface in is the cell a block occupies, and the surface supports it.
    const iso = new IsoProjection(ViewYaw.initial, 20, 400, 300);
    const cell = GroundPick.at(
      iso,
      pad,
      iso.screenX(1.5, 2.5),
      iso.screenY(1.5, pad.level, 2.5)
    );
    assert.notEqual(cell, null);
    assert.equal(pad.supportsBlockAt(cell as IVec3), true);
  });

  it("2.2: the apron is not buildable, though crew may stand on it", () => {
    const iso = new IsoProjection(ViewYaw.initial, 20, 400, 300);
    const apron = new IVec3(pad.minX - 1, pad.level, pad.minZ - 1);
    assert.equal(pad.walkableAt(apron), true, "standable-ground spec 2.2 still says so");
    const cell = GroundPick.at(
      iso,
      pad,
      iso.screenX(apron.x + 0.5, apron.z + 0.5),
      iso.screenY(apron.x + 0.5, pad.level, apron.z + 0.5)
    );
    assert.equal(cell, null);
  });

  it("2.2: the lane is not buildable either", () => {
    const iso = new IsoProjection(ViewYaw.initial, 20, 400, 300);
    const cell = GroundPick.at(
      iso,
      pad,
      iso.screenX(1.5, pad.maxZ + 8.5),
      iso.screenY(1.5, pad.level, pad.maxZ + 8.5)
    );
    assert.equal(cell, null);
  });
});
