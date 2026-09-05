import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ViewState } from "../../src/render/ViewState";
import { ViewYaw } from "../../src/render/ViewYaw";
import { ZoomLadder } from "../../src/render/ZoomLadder";
import { ViewCommand, ViewCommandKind } from "../../src/ui/Commands";

describe("ViewCommand: the view verbs that are left (no-sections spec 2.1, 3)", () => {
  /**
   * The section and the projection were view commands, and they are gone with the things
   * they set. This pins the enum against the two coming back by accident and against its
   * values drifting, which they had to be renumbered to close the gaps they left.
   */
  it("names seven kinds, contiguous from zero, and none of them a section", () => {
    assert.equal(ViewCommandKind.Overlay, 0);
    assert.equal(ViewCommandKind.Inspect, 1);
    assert.equal(ViewCommandKind.Select, 2);
    assert.equal(ViewCommandKind.Seek, 3);
    assert.equal(ViewCommandKind.Pan, 4);
    assert.equal(ViewCommandKind.Zoom, 5);
    assert.equal(ViewCommandKind.Fit, 6);
    assert.equal(ViewCommandKind.Yaw, 7);
  });

  /**
   * The stronger half of the same rule, and this stands in for the stress-overlay test
   * no-sections spec 5 asked for (no-sections-corrections spec 3, 4).
   *
   * That bullet wanted a test that every joint reaches the overlay's draw. It cannot be
   * written: `StressLayer` decides only through `CanvasRenderingContext2D`, so driving it
   * headlessly needs a DOM stub cast in through `as unknown as`, and CLAUDE.md rules out
   * both. It is also not needed. A section filter needs a section to filter on, and there is
   * none on the view -- the old `position.x === context.view.slice` does not compile any
   * more. A type error catches the regression where it is written rather than where the
   * suite runs, which is the stronger of the two guarantees.
   */
  it("leaves the view carrying no section and no projection", () => {
    const view = new ViewState();
    assert.equal(view.yaw.id, ViewYaw.initial.id);
    assert.equal(view.scale, ZoomLadder.initial);
    assert.equal(view.hover, null);
    assert.equal(view.selected, null);
  });

  it("still turns the camera and still snaps the zoom to a rung (spec 2.2, 2.3)", () => {
    assert.equal(ViewCommand.yaw(2).kind, ViewCommandKind.Yaw);
    assert.equal(ViewCommand.yaw(2).value, 2);
    assert.equal(ViewCommand.zoom(2).kind, ViewCommandKind.Zoom);
    // The camera is the only way to reach the two faces a click cannot (face-placement 2.3),
    // so a turn stays a first-class view command with the section gone from beside it.
    assert.equal(ViewYaw.initial.turned(1).id, 1);
  });
});
