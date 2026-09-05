import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { GridBounds } from "../../src/core/GridBounds";
import { IVec3 } from "../../src/core/IVec3";
import { CellPick } from "../../src/render/CellPick";
import { CellPresence } from "../../src/render/CellPresence";
import { FaceHit } from "../../src/render/FaceHit";
import { GroundPick } from "../../src/render/GroundPick";
import { IsoProjection } from "../../src/render/IsoProjection";
import { PlacementRule } from "../../src/render/PlacementRule";
import { ViewYaw } from "../../src/render/ViewYaw";
import { PadSurface } from "../../src/structure/SupportSurface";
import { PointerTarget } from "../../src/ui/PointerTarget";

/** A hand-written set of cells, the same shape `CellPick`'s own suite uses. */
class Cells implements CellPresence {
  private readonly filled: readonly IVec3[];

  public constructor(filled: readonly IVec3[]) {
    this.filled = filled;
  }

  public isSolid(x: number, y: number, z: number): boolean {
    for (let i = 0; i < this.filled.length; i++) {
      const cell = this.filled[i];
      if (cell.x === x && cell.y === y && cell.z === z) {
        return true;
      }
    }
    return false;
  }
}

const bounds = new GridBounds(new IVec3(-2, 0, -6), new IVec3(12, 10, 16));
const pad = new PadSurface(0, 0, 2, -4, 0);
/** A cross-section chosen so the block below is nowhere near it. */
const SECTION: number = 3;

/** Where the ray through the centre of a cell's top face crosses the screen. */
function overTopOf(iso: IsoProjection, cell: IVec3): IVec3 {
  return new IVec3(
    Math.round(iso.screenX(cell.x + 0.5, cell.z + 0.5)),
    Math.round(iso.screenY(cell.x + 0.5, cell.y + 1, cell.z + 0.5)),
    0
  );
}

/** The cell of the plane under a screen point (isometric renderer spec 5.1). */
function planeCellAt(iso: IsoProjection, screenX: number, screenY: number): IVec3 {
  const world = iso.inSection(screenX, screenY, SECTION);
  return new IVec3(SECTION, Math.floor(world.y), Math.floor(world.z));
}

/** The block under the pointer, as `App` resolves it. */
function pickAt(iso: IsoProjection, cells: Cells, screenX: number, screenY: number): FaceHit | null {
  return CellPick.pick(iso, cells, bounds, screenX, screenY);
}

/** The cell a placement fills, as `App` resolves it: the same pick, then the pad, then 2.4. */
function placementAt(
  iso: IsoProjection,
  cells: Cells,
  screenX: number,
  screenY: number
): IVec3 | null {
  const hit = pickAt(iso, cells, screenX, screenY);
  return PlacementRule.target(hit, GroundPick.at(iso, pad, screenX, screenY), cells);
}

describe("PointerTarget: what the pointer addresses (pointing spec 2)", () => {
  // The bug the pointing document was written for. If these two ever agree the rest of the
  // suite proves nothing, so the disagreement is asserted before it is resolved.
  it("a pick and a plane inverse disagree over a block outside the section", () => {
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const iso = new IsoProjection(ViewYaw.of(id), 20, 400, 300);
      const block = new IVec3(0, 1, -2);
      const at = overTopOf(iso, block);
      const picked = CellPick.pick(iso, new Cells([block]), bounds, at.x, at.y);

      assert.notEqual(picked, null, "yaw " + id.toString() + " sees the block");
      assert.equal((picked as FaceHit).cell.equals(block), true);
      const plane = planeCellAt(iso, at.x, at.y);
      assert.equal(plane.x, SECTION);
      assert.equal(plane.equals(block), false, "yaw " + id.toString() + " resolves elsewhere");
    }
  });

  it("2.1: an inspect names the block under the pointer, not a plane cell", () => {
    for (let id = 0; id < ViewYaw.COUNT; id++) {
      const iso = new IsoProjection(ViewYaw.of(id), 20, 400, 300);
      const block = new IVec3(0, 1, -2);
      const at = overTopOf(iso, block);
      const cells = new Cells([block]);
      const hit = pickAt(iso, cells, at.x, at.y);
      const named = PointerTarget.toInspect(
        hit === null ? null : hit.cell,
        placementAt(iso, cells, at.x, at.y)
      );
      assert.notEqual(named, null, "yaw " + id.toString());
      assert.equal((named as IVec3).equals(block), true, "yaw " + id.toString());
    }
  });

  it("2.1: over the empty pad an inspect falls back to the cell a click would fill", () => {
    const iso = new IsoProjection(ViewYaw.initial, 20, 400, 300);
    const screenX = Math.round(iso.screenX(1.5, -2.5));
    const screenY = Math.round(iso.screenY(1.5, pad.level, -2.5));
    const cells = new Cells([]);
    assert.equal(pickAt(iso, cells, screenX, screenY), null);
    const named = PointerTarget.toInspect(null, placementAt(iso, cells, screenX, screenY));
    assert.notEqual(named, null);
    assert.equal((named as IVec3).equals(new IVec3(1, pad.level, -3)), true);
  });

  it("face-placement 2.2: over the sky there is no block and no cell to name", () => {
    const iso = new IsoProjection(ViewYaw.initial, 20, 400, 300);
    const cells = new Cells([]);
    const screenX = Math.round(iso.screenX(1.5, -2.5));
    assert.equal(pickAt(iso, cells, screenX, -4000), null);
    assert.equal(placementAt(iso, cells, screenX, -4000), null);
    assert.equal(PointerTarget.toInspect(null, placementAt(iso, cells, screenX, -4000)), null);
  });

  it("2.2 and face-placement 2.1: the eraser takes the block, a placing entry its face", () => {
    const iso = new IsoProjection(ViewYaw.initial, 20, 400, 300);
    const block = new IVec3(1, 1, -2);
    const at = overTopOf(iso, block);
    const cells = new Cells([block]);
    const hit = pickAt(iso, cells, at.x, at.y);
    assert.notEqual(hit, null);
    const picked = (hit as FaceHit).cell;
    const placement = placementAt(iso, cells, at.x, at.y);

    const placing = PointerTarget.toEdit(false, picked, placement);
    assert.notEqual(placing, null);
    assert.equal(
      (placing as IVec3).equals(new IVec3(1, 2, -2)),
      true,
      "a placement builds across the top face it was aimed at"
    );

    const erasing = PointerTarget.toEdit(true, picked, placement);
    assert.notEqual(erasing, null);
    assert.equal((erasing as IVec3).equals(block), true, "2.2: the eraser takes the block");
  });

  it("2.2: the eraser over empty scene has nothing to erase, and nor has a placement", () => {
    const iso = new IsoProjection(ViewYaw.initial, 20, 400, 300);
    // Over the apron: standable, but nothing rests on it (face-placement spec 2.2).
    const apron = new IVec3(pad.minX - 1, pad.level, pad.minZ - 1);
    const screenX = Math.round(iso.screenX(apron.x + 0.5, apron.z + 0.5));
    const screenY = Math.round(iso.screenY(apron.x + 0.5, pad.level, apron.z + 0.5));
    const placement = placementAt(iso, new Cells([]), screenX, screenY);
    assert.equal(PointerTarget.toEdit(true, null, placement), null);
    assert.equal(PointerTarget.toEdit(false, null, placement), null);
  });
});
