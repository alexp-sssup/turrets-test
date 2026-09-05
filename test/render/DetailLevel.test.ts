import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DetailLevel } from "../../src/render/DetailLevel";

describe("DetailLevel: the degradation order (isometric renderer spec 8)", () => {
  it("gives up the silhouette edges first and the zoom last, and never the timestep", () => {
    const detail = new DetailLevel();
    assert.equal(detail.level, DetailLevel.FULL);
    assert.equal(detail.edges, true);
    assert.equal(detail.groundDetail, true);
    assert.equal(detail.reachGrid, true);

    // One expensive frame is not a verdict; a sustained one is.
    detail.observe(40);
    assert.equal(detail.level, DetailLevel.FULL, "one slow frame changes nothing");
    for (let i = 0; i < DetailLevel.PATIENCE; i++) {
      detail.observe(40);
    }
    assert.equal(detail.level, DetailLevel.NO_EDGES);
    assert.equal(detail.edges, false);
    assert.equal(detail.groundDetail, true, "the ground goes second, not first");

    for (let i = 0; i < DetailLevel.PATIENCE; i++) {
      detail.observe(40);
    }
    assert.equal(detail.level, DetailLevel.NO_GROUND_DETAIL);
    assert.equal(detail.groundDetail, false);
    assert.equal(detail.reachGrid, true);

    for (let i = 0; i < DetailLevel.PATIENCE; i++) {
      detail.observe(40);
    }
    assert.equal(detail.level, DetailLevel.NO_REACH_GRID);
    assert.equal(detail.reachGrid, false);

    // The zoom is the last thing, and the view owns it, so it is a request and it is made once.
    assert.equal(detail.takeZoomRequest(), false);
    for (let i = 0; i < DetailLevel.PATIENCE; i++) {
      detail.observe(40);
    }
    assert.equal(detail.level, DetailLevel.ZOOM_OUT);
    assert.equal(detail.takeZoomRequest(), true);
    assert.equal(detail.takeZoomRequest(), false, "asked once per level, not every frame");

    // And it stops there: there is no level that touches the timestep.
    for (let i = 0; i < DetailLevel.PATIENCE * 2; i++) {
      detail.observe(40);
    }
    assert.equal(detail.level, DetailLevel.WORST);
  });

  it("gives a level back only on a sustained margin", () => {
    const detail = new DetailLevel();
    for (let i = 0; i < DetailLevel.PATIENCE; i++) {
      detail.observe(40);
    }
    assert.equal(detail.level, DetailLevel.NO_EDGES);

    // Just under budget is not a margin: a level that oscillated with the noise would be
    // worse than either of the levels it sat between.
    for (let i = 0; i < DetailLevel.PATIENCE * 2; i++) {
      detail.observe(DetailLevel.BUDGET_MS - 0.5);
    }
    assert.equal(detail.level, DetailLevel.NO_EDGES);

    for (let i = 0; i < DetailLevel.PATIENCE; i++) {
      detail.observe(1);
    }
    assert.equal(detail.level, DetailLevel.FULL);
    assert.equal(detail.describe(), "full");
  });
});
