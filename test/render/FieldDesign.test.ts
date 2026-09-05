import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { FieldDesign } from "../../src/render/FieldDesign";
import { PeelPlane } from "../../src/render/PeelPlane";
import { ViewMode } from "../../src/render/ViewMode";
import { ViewYaw } from "../../src/render/ViewYaw";
import { Arena } from "../../src/sim/Arena";

const dials = Dials.defaults();
const arena = Arena.p0();

function design(): FieldDesign {
  return FieldDesign.withDefaults(SampleBlueprints.standardTurret(), arena.pad, arena, dials);
}

describe("FieldDesign.frontSlice: where the reach plane rests (face-placement spec 3.3)", () => {
  it("is the section nearest the camera, at every yaw", () => {
    const scene = design();
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      const front = scene.frontSlice(yaw);
      assert.equal(front >= scene.sliceMin && front <= scene.sliceMax, true);
      // Nothing is nearer the camera than it: no section in range is "in front" of it.
      for (let x = scene.sliceMin; x <= scene.sliceMax; x++) {
        assert.equal(yaw.isInFront(x, front), false, "yaw " + id.toString() + " x " + x.toString());
      }
    }
  });

  it("a turn moves it to the other end, which is why a turn resets it", () => {
    const scene = design();
    assert.equal(scene.frontSlice(ViewYaw.of(0)), scene.sliceMin);
    assert.equal(scene.frontSlice(ViewYaw.of(1)), scene.sliceMin);
    assert.equal(scene.frontSlice(ViewYaw.of(2)), scene.sliceMax);
    assert.equal(scene.frontSlice(ViewYaw.of(3)), scene.sliceMax);
  });

  it("3.3: opening there is opening solid, at every yaw", () => {
    const scene = design();
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const yaw = ViewYaw.of(id);
      const peel = new PeelPlane(
        scene.sliceMin,
        scene.sliceMax,
        scene.frontSlice(yaw),
        yaw,
        ViewMode.Iso
      );
      assert.equal(peel.peeling, false, "yaw " + id.toString());
      assert.equal(peel.peeledCount, 0, "yaw " + id.toString());
    }
  });
});
