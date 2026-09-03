import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  LayoutMode,
  MEDIUM_MIN_WIDTH_PX,
  Orientation,
  PointerKind,
  WIDE_MIN_WIDTH_PX,
  classifyLayout,
  layoutModeName,
  orientationName,
  orientationOf,
  panelWidthPx,
  pointerKindName,
} from "../../src/ui/LayoutMode";

/**
 * Mobile UI spec 3.1 and 3.2, every row and every boundary, both pointer kinds (7.3).
 *
 * The classifier is a pure function of plain numbers precisely so that this file needs no
 * browser and no DOM shim.
 */
describe("LayoutMode", () => {
  it("classifies each row of the mobile UI spec 3.1 table", () => {
    assert.equal(classifyLayout(1440, 900, false), LayoutMode.Wide);
    assert.equal(classifyLayout(800, 600, false), LayoutMode.Medium);
    assert.equal(classifyLayout(390, 844, true), LayoutMode.Compact);
  });

  it("puts every breakpoint of mobile UI spec 3.1 on the width, at and either side of it", () => {
    assert.equal(MEDIUM_MIN_WIDTH_PX, 640);
    assert.equal(WIDE_MIN_WIDTH_PX, 1024);

    assert.equal(classifyLayout(639, 900, false), LayoutMode.Compact);
    assert.equal(classifyLayout(640, 900, false), LayoutMode.Medium);
    assert.equal(classifyLayout(641, 900, false), LayoutMode.Medium);

    assert.equal(classifyLayout(1023, 900, false), LayoutMode.Medium);
    assert.equal(classifyLayout(1024, 900, false), LayoutMode.Wide);
    assert.equal(classifyLayout(1025, 900, false), LayoutMode.Wide);
  });

  /**
   * Spec 3.2: the pointer selects hit targets and hints, never the layout. A touchscreen
   * laptop keeps the desktop layout, and a mouse plugged into a phone does not widen it.
   */
  it("does not let the pointer kind move a breakpoint (mobile UI spec 3.2)", () => {
    const widths: readonly number[] = [320, 390, 639, 640, 800, 1023, 1024, 1440];
    for (let i = 0; i < widths.length; i++) {
      assert.equal(
        classifyLayout(widths[i], 800, true),
        classifyLayout(widths[i], 800, false),
        "pointer kind changed the layout at " + widths[i].toString() + " px"
      );
    }
  });

  /**
   * Spec 3.1: "Breakpoints are on the viewport, not on the device". A desktop window
   * dragged narrow gets the Compact layout, and that is the intended behaviour.
   */
  it("gives a narrow desktop window the compact layout (mobile UI spec 3.1)", () => {
    assert.equal(classifyLayout(500, 1200, false), LayoutMode.Compact);
  });

  it("does not let the height move a breakpoint either (mobile UI spec 3.1)", () => {
    assert.equal(classifyLayout(800, 360, false), LayoutMode.Medium);
    assert.equal(classifyLayout(800, 2000, false), LayoutMode.Medium);
    assert.equal(classifyLayout(600, 360, true), LayoutMode.Compact);
  });

  /** Orientation is a property read inside Compact, not a fourth mode (mobile UI spec 3.1). */
  it("reads orientation from the viewport, squares counting as portrait", () => {
    assert.equal(orientationOf(390, 844), Orientation.Portrait);
    assert.equal(orientationOf(844, 390), Orientation.Landscape);
    assert.equal(orientationOf(500, 500), Orientation.Portrait);
    assert.equal(orientationOf(501, 500), Orientation.Landscape);
  });

  /** The rail widths of 3.1: 372 px in Wide, 300 px in Medium, none in Compact. */
  it("docks the panel rail at the width its mode calls for", () => {
    assert.equal(panelWidthPx(LayoutMode.Wide), 372);
    assert.equal(panelWidthPx(LayoutMode.Medium), 300);
    assert.equal(panelWidthPx(LayoutMode.Compact), 0);
  });

  /** These names are the CSS attribute values and the 9.1 export values. Both read them. */
  it("names the modes as the layout attributes and the attempt export spell them", () => {
    assert.equal(layoutModeName(LayoutMode.Wide), "wide");
    assert.equal(layoutModeName(LayoutMode.Medium), "medium");
    assert.equal(layoutModeName(LayoutMode.Compact), "compact");
    assert.equal(pointerKindName(PointerKind.Fine), "fine");
    assert.equal(pointerKindName(PointerKind.Coarse), "coarse");
    assert.equal(orientationName(Orientation.Portrait), "portrait");
    assert.equal(orientationName(Orientation.Landscape), "landscape");
  });
});
