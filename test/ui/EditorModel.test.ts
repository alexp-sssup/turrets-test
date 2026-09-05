import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { IVec3 } from "../../src/core/IVec3";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { ConstantBudgetProvider } from "../../src/blueprint/BudgetProvider";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { Direction } from "../../src/core/Direction";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { BlueprintValidator } from "../../src/editor/BlueprintValidator";
import { MaterialId } from "../../src/materials/MaterialId";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { ViolationKind } from "../../src/editor/Violation";
import { EditorModel } from "../../src/ui/EditorModel";

const dials = Dials.defaults();
const materials = MaterialTable.defaults();
const pad = SampleBlueprints.pad();
const budget = new ConstantBudgetProvider(dials.materialBudget);

function editor(): EditorModel {
  return new EditorModel(
    SampleBlueprints.standardTurret(),
    BlueprintValidator.withDefaults(materials, dials),
    materials,
    pad,
    budget,
    dials
  );
}

describe("EditorModel: digging in and building back (no-sections spec 2.2)", () => {
  /**
   * The way to an interior, now that there is no cutaway: erase the wall, do the work, build
   * the wall back. Both verbs already existed; this pins that the round trip lands on the
   * design it started from, which is what makes the cross-section unnecessary rather than
   * merely absent.
   */
  it("erases a wall cell, builds behind it, and puts the wall back", () => {
    const model = editor();
    const blueprint = model.blueprint();
    // A block on the surface, and the cell one step in from it along the lane.
    const wall = blueprint.blockAt(0).position;
    const startCost = model.cost;
    const startBlocks = model.blockCount;

    model.selectPalette("erase");
    assert.equal(model.placeAt(wall, 0), true, "the wall comes out");
    assert.equal(model.blockCount, startBlocks - 1);
    assert.ok(model.cost < startCost, "and the bill refunds it");

    // The cell it was hiding is reachable now, because nothing stands in front of it.
    const behind = new IVec3(wall.x, wall.y + 1, wall.z);
    const wasThere = model.blueprint().blockCount;
    model.selectPalette("wood");
    if (!blueprintHas(model, behind)) {
      assert.equal(model.placeAt(behind, 0), true, "and something can go in its place");
      assert.equal(model.blockCount, wasThere + 1);
      assert.equal(model.placeAt(behind, 0), true);
      model.selectPalette("erase");
      assert.equal(model.placeAt(behind, 0), true, "taken back out again");
      model.selectPalette("wood");
    }

    // Build the wall back where it was. The trip is undoable one click at a time either way.
    assert.equal(model.placeAt(wall, 0), true);
    assert.equal(model.blockCount, startBlocks);
    assert.equal(blueprintHas(model, wall), true, "the wall is a wall again");
  });

  it("costs one undo per click, so a dig is never a cliff", () => {
    const model = editor();
    const wall = model.blueprint().blockAt(0).position;
    const startBlocks = model.blockCount;

    model.selectPalette("erase");
    model.placeAt(wall, 0);
    model.selectPalette("wood");
    model.placeAt(wall, 0);
    assert.equal(model.blockCount, startBlocks);

    assert.equal(model.undo(0), true);
    assert.equal(model.blockCount, startBlocks - 1, "the rebuild comes off first");
    assert.equal(model.undo(0), true);
    assert.equal(model.blockCount, startBlocks, "and then the erase");
  });
});

function blueprintHas(model: EditorModel, cell: IVec3): boolean {
  const blueprint = model.blueprint();
  for (let i = 0; i < blueprint.blockCount; i++) {
    if (blueprint.blockAt(i).position.equals(cell)) {
      return true;
    }
  }
  return false;
}

describe("EditorModel", () => {
  it("updates the bill of materials on every placement, not at commit", () => {
    const model = editor();
    const before = model.cost;
    const blocks = model.blockCount;

    model.selectPalette("stone");
    // A three-cell column, one click per cell: mouse-gestures spec 2.1 makes placement
    // single-cell on every pointer, so three cells is three edits.
    assert.equal(model.placeAt(new IVec3(2, 2, 1), 0), true);
    assert.equal(model.placeAt(new IVec3(2, 3, 1), 0), true);
    assert.equal(model.placeAt(new IVec3(2, 4, 1), 0), true);

    assert.equal(model.blockCount, blocks + 3);
    assert.equal(model.cost, before + 3 * materials.get(MaterialId.Stone).costPerVoxel);
    assert.equal(model.remainingBudget, dials.materialBudget - model.cost);
    // Cost is known immediately; the structural rows are the ones that wait.
    assert.equal(model.awaitingSolve, true);
  });

  // Palette-material spec 2.2: the chip reads its material off the entry rather than from a
  // label written beside it, so a chip cannot say "station" while authoring wood.
  it("derives every palette label from the entry's own material and kind", () => {
    const entries = EditorModel.palette();
    const labels: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      labels.push(entries[i].labelWith(materials));
    }
    assert.deepEqual(labels, [
      "wood",
      "stone",
      "wood station",
      "wood depot",
      "wood hatch",
      "erase",
    ]);
  });

  // Palette-material spec 2.1, asserted through a placement rather than by reading the table
  // back: what the rail authors is what ends up in the blueprint.
  it("authors a wood block for every kind entry", () => {
    const kinds: readonly (readonly [string, BlockKind])[] = [
      ["station", BlockKind.Station],
      ["depot", BlockKind.Depot],
      ["hatch", BlockKind.Hatch],
    ];
    for (let i = 0; i < kinds.length; i++) {
      const [key, kind] = kinds[i];
      const model = editor();
      model.selectPalette(key);
      const cell = new IVec3(2, 3, 1);
      assert.equal(model.placeAt(cell, 0), true);
      const blueprint = model.blueprint();
      const index = blueprint.indexAt(cell);
      assert.ok(index >= 0, key + " was placed");
      assert.equal(blueprint.blockAt(index).kind, kind);
      assert.equal(blueprint.blockAt(index).material, MaterialId.Wood, key + " is wood");
    }
  });

  // The other half of 2.1: the restriction is the editor's and nothing below it knows about
  // it, so a design that arrives with a stone station keeps one.
  it("keeps a stone station a stone station through a load and a rebuild", () => {
    const cell = new IVec3(2, 1, 2);
    const stone = new BlueprintBuilder()
      .place(new IVec3(2, 0, 2), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(cell, MaterialId.Stone, BlockKind.Station, Direction.NegZ)
      .build("stone gun");
    const model = editor();
    model.load(stone, 0);
    const built = model.blueprint();
    const index = built.indexAt(cell);
    assert.ok(index >= 0);
    assert.equal(built.blockAt(index).kind, BlockKind.Station);
    assert.equal(built.blockAt(index).material, MaterialId.Stone);
  });

  it("erases, and treats erasing an empty cell as no edit at all", () => {
    const model = editor();
    const blocks = model.blockCount;
    model.selectPalette("erase");

    assert.equal(model.placeAt(new IVec3(2, 1, 0), 0), true);
    assert.equal(model.blockCount, blocks - 1);

    // Nothing there any more: no change, and nothing pushed onto the undo stack.
    assert.equal(model.placeAt(new IVec3(2, 1, 0), 0), false);
    assert.equal(model.blockCount, blocks - 1);
    assert.equal(model.canUndo, true, "the first erase is still undoable, and only it");
    model.undo(0);
    assert.equal(model.canUndo, false);
  });

  // Mouse-gestures spec 2.1: an edit is one cell, so an undo is one cell. Unlimited undo is
  // what makes a wrong single-cell click cost nothing (5), which is the whole safety net
  // now that no gesture places more than one voxel.
  it("undoes and redoes without limit, one placement at a time", () => {
    const model = editor();
    const original = model.blockCount;
    model.selectPalette("wood");
    model.placeAt(new IVec3(2, 2, 1), 0);
    model.placeAt(new IVec3(2, 2, 2), 0);
    assert.equal(model.blockCount, original + 2);

    assert.equal(model.undo(0), true);
    assert.equal(model.blockCount, original + 1);
    assert.equal(model.undo(0), true);
    assert.equal(model.blockCount, original);
    assert.equal(model.undo(0), false, "nothing left to undo");

    assert.equal(model.redo(0), true);
    assert.equal(model.blockCount, original + 1);
    assert.equal(model.redo(0), true);
    assert.equal(model.blockCount, original + 2);
    assert.equal(model.redo(0), false);

    // A fresh edit after an undo discards the redo branch.
    model.undo(0);
    model.placeAt(new IVec3(0, 2, 0), 0);
    assert.equal(model.canRedo, false);
  });

  it("faces a new station down the lane, because P0 has no rotation tool", () => {
    const model = editor();
    model.selectPalette("station");
    model.placeAt(new IVec3(0, 1, 0), 0);
    const blueprint = model.blueprint();
    const block = blueprint.blockAtPosition(new IVec3(0, 1, 0));
    assert.notEqual(block, null);
    assert.equal((block as { kind: BlockKind }).kind, BlockKind.Station);
    model.solve();
    const geometry = model.geometry;
    assert.notEqual(geometry, null);
    const readout = (geometry as { readoutOf: (b: number) => unknown }).readoutOf(
      blueprint.indexAt(new IVec3(0, 1, 0))
    ) as { arcCentreClear: boolean } | null;
    assert.notEqual(readout, null);
    assert.equal((readout as { arcCentreClear: boolean }).arcCentreClear, true);
  });

  it("reports going over budget as a violation rather than refusing the placement", () => {
    const model = editor();
    model.selectPalette("stone");
    // Far more stone than 500 material can pay for: five columns, eight courses each.
    for (let x = 0; x <= 4; x++) {
      for (let y = 2; y <= 9; y++) {
        for (let z = 0; z <= 4; z++) {
          model.placeAt(new IVec3(x, y, z), 0);
        }
      }
    }
    assert.ok(model.cost > dials.materialBudget);
    assert.ok(model.remainingBudget < 0);
    const geometry = model.geometry;
    assert.notEqual(geometry, null);
    assert.equal((geometry as { has: (k: ViolationKind) => boolean }).has(ViolationKind.OverBudget), true);
  });

  it("holds the structural rows back until the debounce has elapsed", () => {
    const model = editor();
    model.selectPalette("wood");
    model.placeAt(new IVec3(2, 2, 2), 1000);
    assert.equal(model.awaitingSolve, true);
    assert.equal(model.solveDue(1000), false, "not immediately");
    assert.equal(model.solveDue(1000 + EditorModel.SOLVE_DEBOUNCE_MS - 1), false);
    assert.equal(model.solveDue(1000 + EditorModel.SOLVE_DEBOUNCE_MS), true);
    model.solve();
    assert.equal(model.awaitingSolve, false);
    assert.notEqual(model.structural, null);
    assert.equal(model.solveDue(9999), false, "nothing dirty to solve");
  });

  it("loads a design and forgets the history of the one before it", () => {
    const model = editor();
    model.selectPalette("wood");
    model.placeAt(new IVec3(2, 2, 2), 0);
    assert.equal(model.canUndo, true);
    model.load(SampleBlueprints.severedDepotTurret(), 0);
    assert.equal(model.canUndo, false, "undoing into another design would be nonsense");
    assert.equal(model.blueprintName, "severed depot");
  });
});
