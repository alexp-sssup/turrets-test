import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { approxEqual } from "../../src/core/Numeric";
import { DepthAxis } from "../../src/render/DepthAxis";
import { DepthOrder } from "../../src/render/DepthOrder";
import { FieldDesign } from "../../src/render/FieldDesign";
import { Projection } from "../../src/render/Projection";
import { SectionCue } from "../../src/render/SectionCue";
import { ViewMode, otherViewMode, viewModeName } from "../../src/render/ViewMode";
import { ViewState } from "../../src/render/ViewState";
import { Arena } from "../../src/sim/Arena";

const dials = Dials.defaults();
const arena = Arena.p0();

function design(): FieldDesign {
  return FieldDesign.withDefaults(SampleBlueprints.standardTurret(), arena.pad, arena, dials);
}

function viewAt(slice: number, mode: ViewMode): ViewState {
  const view = new ViewState(slice);
  view.mode = mode;
  view.scale = 20;
  view.panX = 40;
  view.panY = 300;
  return view;
}

describe("DepthAxis (depth view spec 2)", () => {
  it("puts the depth axis at 45 degrees, up and to the right of the working plane", () => {
    // Run equals rise on purpose: at any other angle "two sections back" and "two cells
    // down the lane" project to the same move, which is the one confusion this projection
    // can create.
    assert.equal(DepthAxis.RUN, DepthAxis.RISE);
    const axis = DepthAxis.forScale(20);
    assert.equal(approxEqual(axis.offsetX(1), 8.4, 1e-9), true);
    assert.equal(approxEqual(axis.offsetY(1), -8.4, 1e-9), true);
    // Farther is up and right; nearer is down and left. Both are the same step, signed.
    assert.equal(approxEqual(axis.offsetX(-2), -16.8, 1e-9), true);
    assert.equal(approxEqual(axis.offsetY(-2), 16.8, 1e-9), true);
  });

  it("gives x no place on screen at all in the flat view", () => {
    const axis = DepthAxis.flat();
    assert.equal(axis.isFlat, true);
    assert.equal(axis.offsetX(3), 0);
    assert.equal(axis.offsetY(-3), 0);
  });
});

describe("Projection in the depth view (depth view spec 2)", () => {
  /**
   * Spec 2.2, and the reason the offset is measured from the active section rather than
   * from the world origin: toggling the mode must not move the cross-section the tester is
   * working in.
   */
  it("pins the active cross-section across the toggle", () => {
    const scene = design();
    const flat = new Projection(scene, viewAt(2, ViewMode.Flat), 800, 600);
    const depth = new Projection(scene, viewAt(2, ViewMode.Depth), 800, 600);

    assert.equal(depth.screenX(3), flat.screenX(3));
    assert.equal(depth.screenY(1), flat.screenY(1));
    assert.equal(depth.screenXAt(2, 3), flat.screenXAt(2, 3));
    assert.equal(depth.screenYAt(2, 1), flat.screenYAt(2, 1));
  });

  it("offsets other sections by one axis step each, and none in the flat view", () => {
    const scene = design();
    const depth = new Projection(scene, viewAt(2, ViewMode.Depth), 800, 600);
    const step = DepthAxis.RUN * 20;

    // One section farther: up and to the right by exactly one step.
    assert.equal(approxEqual(depth.screenXAt(3, 3) - depth.screenX(3), step, 1e-9), true);
    assert.equal(approxEqual(depth.screenYAt(3, 1) - depth.screenY(1), -step, 1e-9), true);
    // Two sections nearer: down and to the left by two.
    assert.equal(approxEqual(depth.screenXAt(0, 3) - depth.screenX(3), -2 * step, 1e-9), true);
    assert.equal(approxEqual(depth.screenYAt(0, 1) - depth.screenY(1), 2 * step, 1e-9), true);

    const flat = new Projection(scene, viewAt(2, ViewMode.Flat), 800, 600);
    assert.equal(flat.screenXAt(0, 3), flat.screenX(3));
    assert.equal(flat.screenYAt(4, 1), flat.screenY(1));
  });

  /**
   * Spec 5: the pointer always addresses the working plane. Placement stays exact with five
   * sections on screen, because screen-to-world resolves in one plane and never has to pick
   * between them.
   */
  it("resolves a click in the active cross-section, whichever mode is on", () => {
    const scene = design();
    for (let m = 0; m < 2; m++) {
      const mode = m === 0 ? ViewMode.Flat : ViewMode.Depth;
      const view = viewAt(3, mode);
      const projection = new Projection(scene, view, 800, 600);
      // Six pixels into a twenty-pixel cell: comfortably inside it, so the assertion is
      // about which plane resolved and not about how a half-cell rounds.
      const screenX = projection.screenX(2) + 6;
      const screenY = projection.screenY(1) + 6;
      const cell = projection.cellAt(screenX, screenY);

      assert.equal(cell.x, 3, viewModeName(mode));
      assert.equal(cell.z, 2, viewModeName(mode));
      assert.equal(cell.y, 1, viewModeName(mode));
    }
  });

  it("frames the depth spread rather than the flat box (depth view spec 5)", () => {
    const scene = design();
    const bounds = scene.viewBounds;
    const flat = viewAt(2, ViewMode.Flat);
    const depth = viewAt(2, ViewMode.Depth);
    Projection.fit(scene, flat, 800, 600);
    Projection.fit(scene, depth, 800, 600);

    // The pad is five sections wide and the working plane sits in the middle of it, so the
    // box being fitted is two steps wider and taller on each side than the flat one.
    const spread = DepthAxis.RUN * 4;
    const expected = Math.min(800 / (bounds.size.z + 1 + spread), 600 / (bounds.size.y + 1 + spread));
    assert.equal(approxEqual(depth.scale, expected, 1e-9), true);
    assert.ok(depth.scale < flat.scale);

    // And the pan carries the part of the spread that hangs off the near side, so the two
    // sections in front of the working plane are inside the viewport rather than left of it.
    const overhang = DepthAxis.RUN * 2 * depth.scale;
    const span = (bounds.size.z + spread) * depth.scale;
    assert.equal(approxEqual(depth.panX, (800 - span) * 0.5 + overhang, 1e-9), true);

    // The ground line keeps the anchor of UI spec 2's framing rule in both modes.
    const groundRow = bounds.min.y + bounds.size.y - scene.pad.level;
    assert.equal(approxEqual(depth.panY, 600 * Projection.GROUND_ANCHOR - groundRow * depth.scale, 1e-9), true);
    assert.equal(approxEqual(flat.panY, 600 * Projection.GROUND_ANCHOR - groundRow * flat.scale, 1e-9), true);
  });
});

describe("SectionCue: the peel rule (depth view spec 3)", () => {
  it("draws the active cross-section in full, in both modes", () => {
    for (let m = 0; m < 2; m++) {
      const mode = m === 0 ? ViewMode.Flat : ViewMode.Depth;
      const cue = SectionCue.forSection(2, 2, mode);
      assert.equal(cue.active, true);
      assert.equal(cue.alpha, 1);
      assert.equal(cue.outline, false);
      assert.equal(cue.material, true);
      assert.equal(cue.detail, true);
      assert.equal(cue.distance, 0);
    }
  });

  /**
   * The answer to the question the mode exists for: what stands between the viewer and the
   * working plane is cut away, and what stands behind it stays solid so the interior can be
   * read through the holes.
   */
  it("peels what is in front to an outline and keeps what is behind solid", () => {
    const front = SectionCue.forSection(1, 3, ViewMode.Depth);
    assert.equal(front.inFront, true);
    assert.equal(front.outline, true);
    assert.equal(front.material, false);
    assert.equal(front.detail, false);
    assert.equal(front.distance, 2);

    const behind = SectionCue.forSection(4, 3, ViewMode.Depth);
    assert.equal(behind.inFront, false);
    assert.equal(behind.outline, false);
    assert.equal(behind.material, true);
    // Glyphs and pips are the working plane's; a depot's ring still reads behind a wall.
    assert.equal(behind.detail, false);
  });

  it("fades with distance but never to nothing", () => {
    const near = SectionCue.forSection(3, 2, ViewMode.Depth);
    const far = SectionCue.forSection(6, 2, ViewMode.Depth);
    assert.equal(near.alpha, SectionCue.BEHIND_NEAREST);
    assert.ok(far.alpha < near.alpha);
    // A section faded to nothing has been deleted rather than dimmed, and "there are three
    // more walls behind this" is information.
    assert.ok(far.alpha >= SectionCue.BEHIND_FLOOR);
    assert.equal(SectionCue.forSection(40, 2, ViewMode.Depth).alpha, SectionCue.BEHIND_FLOOR);
    assert.equal(SectionCue.forSection(-40, 2, ViewMode.Depth).alpha, SectionCue.FRONT_FLOOR);
  });

  it("keeps the flat view's ghost, which carries its own alpha", () => {
    const ghost = SectionCue.forSection(0, 2, ViewMode.Flat);
    assert.equal(ghost.outline, false);
    assert.equal(ghost.material, false);
    assert.equal(ghost.detail, false);
    assert.equal(ghost.alpha, 1);
  });
});

describe("DepthOrder (depth view spec 3)", () => {
  it("composites back to front, so the nearest section lands on top", () => {
    const order = new DepthOrder(0, 4, 2, ViewMode.Depth);
    const drawn: number[] = [];
    for (let i = 0; i < order.count; i++) {
      drawn.push(order.cues[i].sectionX);
    }
    assert.deepEqual(drawn, [4, 3, 2, 1, 0]);
  });

  it("draws the flat view's active section last, so the ghosts stay behind it", () => {
    const order = new DepthOrder(0, 4, 2, ViewMode.Flat);
    assert.equal(order.count, 5);
    assert.equal(order.cues[order.count - 1].sectionX, 2);
    assert.equal(order.cues[order.count - 1].active, true);
  });

  /**
   * Spec 5: the peel plane is the cross-section, and stepping toward the viewer peels one
   * more wall off. There is one depth control in the build and it is the one that was
   * already there.
   */
  it("peels one more section for every step toward the viewer", () => {
    assert.equal(new DepthOrder(0, 4, 0, ViewMode.Depth).peeledCount, 0);
    assert.equal(new DepthOrder(0, 4, 1, ViewMode.Depth).peeledCount, 1);
    assert.equal(new DepthOrder(0, 4, 4, ViewMode.Depth).peeledCount, 4);
    // The flat view cuts nothing away, so it has nothing to report.
    assert.equal(new DepthOrder(0, 4, 4, ViewMode.Flat).peeledCount, 0);
  });

  it("covers the active section even when it sits outside the design's own range", () => {
    const order = new DepthOrder(1, 3, 5, ViewMode.Depth);
    assert.equal(order.count, 5);
    assert.equal(order.cues[0].sectionX, 5);
    assert.equal(order.cues[0].active, true);
  });
});

describe("ViewMode", () => {
  it("names both modes and toggles between exactly two", () => {
    assert.equal(viewModeName(ViewMode.Flat), "flat");
    assert.equal(viewModeName(ViewMode.Depth), "2.5D");
    assert.equal(otherViewMode(ViewMode.Flat), ViewMode.Depth);
    assert.equal(otherViewMode(ViewMode.Depth), ViewMode.Flat);
  });

  it("opens flat, because UI spec 7.2 puts a tester in the loop and not in a viewer", () => {
    assert.equal(new ViewState(0).mode, ViewMode.Flat);
  });
});
