import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { approxEqual } from "../../src/core/Numeric";
import { FieldRenderer } from "../../src/render/FieldRenderer";

/**
 * The backing-store cap of mobile UI spec 8.3.
 *
 * A pure function of three numbers, so it is tested without a canvas: this is the one
 * change the mobile UI spec makes in `render/`, and it is invisible to the layers, which
 * already never see the ratio.
 */
describe("FieldRenderer backing store", () => {
  it("caps the effective device pixel ratio at two (mobile UI spec 8.3)", () => {
    assert.equal(FieldRenderer.MAX_PIXEL_RATIO, 2);
    assert.equal(FieldRenderer.effectivePixelRatio(390, 600, 3), 2);
    assert.equal(FieldRenderer.effectivePixelRatio(390, 600, 2), 2);
    assert.equal(FieldRenderer.effectivePixelRatio(390, 600, 1.5), 1.5);
  });

  it("never goes below one, because a store smaller than the element is a blurry field", () => {
    assert.equal(FieldRenderer.effectivePixelRatio(390, 600, 0.5), 1);
    // A viewport so large that even 1x exceeds the pixel budget still gets 1x: the cap
    // reduces the ratio, it does not shrink the canvas below its own CSS size.
    assert.equal(FieldRenderer.effectivePixelRatio(4000, 3000, 2), 1);
  });

  it("holds the store at 2.2 M pixels, at and either side of the budget", () => {
    assert.equal(FieldRenderer.MAX_BACKING_PIXELS, 2_200_000);

    // 1100 x 1000 CSS px at 2x would be 4.4 M pixels; the ratio comes down instead.
    const reduced = FieldRenderer.effectivePixelRatio(1100, 1000, 2);
    assert.ok(reduced < 2);
    assert.equal(approxEqual(1100 * 1000 * reduced * reduced, 2_200_000, 1), true);

    // A 390 x 700 phone at 2x is 1.09 M pixels: inside the budget, so nothing is given up.
    assert.equal(FieldRenderer.effectivePixelRatio(390, 700, 2), 2);
  });

  it("survives a zero-area canvas, which is what a hidden field measures as", () => {
    assert.equal(FieldRenderer.effectivePixelRatio(0, 0, 3), 2);
  });
});
