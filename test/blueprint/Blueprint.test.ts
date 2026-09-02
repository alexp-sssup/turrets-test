import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { MaterialId } from "../../src/materials/MaterialId";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { Blueprint } from "../../src/blueprint/Blueprint";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { BlueprintBlock } from "../../src/blueprint/BlueprintBlock";
import { ConstantBudgetProvider } from "../../src/blueprint/BudgetProvider";

function simpleBuilder(): BlueprintBuilder {
  return new BlueprintBuilder()
    .fillBox(new IVec3(0, 0, 0), new IVec3(2, 0, 2), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
    .place(new IVec3(1, 1, 1), MaterialId.Wood, BlockKind.Core, Direction.PosZ)
    .place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegX);
}

describe("BlueprintBuilder", () => {
  it("fills boxes regardless of corner order", () => {
    const forward = new BlueprintBuilder().fillBox(
      new IVec3(0, 0, 0),
      new IVec3(1, 1, 1),
      MaterialId.Wood,
      BlockKind.Structural,
      Direction.PosZ
    );
    const reversed = new BlueprintBuilder().fillBox(
      new IVec3(1, 1, 1),
      new IVec3(0, 0, 0),
      MaterialId.Wood,
      BlockKind.Structural,
      Direction.PosZ
    );
    assert.equal(forward.blockCount, 8);
    assert.equal(reversed.blockCount, 8);
  });

  it("replaces rather than duplicates a position", () => {
    const builder = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 0, 0), MaterialId.Stone, BlockKind.Core, Direction.PosZ);
    assert.equal(builder.blockCount, 1);
    const blueprint = builder.build("replaced");
    assert.equal(blueprint.blockAt(0).material, MaterialId.Stone);
    assert.equal(blueprint.blockAt(0).kind, BlockKind.Core);
  });

  it("removes blocks", () => {
    const builder = simpleBuilder();
    const before = builder.blockCount;
    builder.remove(new IVec3(1, 1, 1));
    assert.equal(builder.blockCount, before - 1);
    assert.equal(builder.has(new IVec3(1, 1, 1)), false);
    builder.remove(new IVec3(50, 50, 50)); // no-op, must not throw
    assert.equal(builder.blockCount, before - 1);
  });

  it("produces canonical ordering independent of insertion order", () => {
    const forward = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .build("a");
    const backward = new BlueprintBuilder()
      .place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .build("b");
    for (let i = 0; i < forward.blockCount; i++) {
      assert.ok(forward.blockAt(i).position.equals(backward.blockAt(i).position));
    }
  });

  it("round-trips through fromBlueprint", () => {
    const original = simpleBuilder().build("original");
    const copy = BlueprintBuilder.fromBlueprint(original).build("copy");
    assert.equal(copy.blockCount, original.blockCount);
    for (let i = 0; i < original.blockCount; i++) {
      const a = original.blockAt(i);
      const b = copy.blockAt(i);
      assert.ok(a.position.equals(b.position));
      assert.equal(a.material, b.material);
      assert.equal(a.kind, b.kind);
      assert.equal(a.facing, b.facing);
    }
  });

  it("rejects positions outside the packable range", () => {
    const builder = new BlueprintBuilder();
    assert.throws(() =>
      builder.place(new IVec3(9999, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
    );
  });
});

describe("Blueprint", () => {
  it("indexes by position and by kind", () => {
    const blueprint = simpleBuilder().build("indexed");
    assert.equal(blueprint.blockCount, 11);
    assert.equal(blueprint.countOfKind(BlockKind.Core), 1);
    assert.equal(blueprint.countOfKind(BlockKind.Station), 1);
    assert.equal(blueprint.countOfKind(BlockKind.Structural), 9);
    assert.equal(blueprint.countOfKind(BlockKind.Depot), 0);

    const core = blueprint.blockAtPosition(new IVec3(1, 1, 1));
    assert.notEqual(core, null);
    assert.equal((core as BlueprintBlock).kind, BlockKind.Core);
    assert.equal(blueprint.blockAtPosition(new IVec3(9, 9, 9)), null);
    assert.equal(blueprint.indexAt(new IVec3(9, 9, 9)), -1);
    assert.equal(blueprint.hasBlockAt(new IVec3(0, 0, 0)), true);
  });

  it("computes a bill of materials and its cost", () => {
    const materials = MaterialTable.defaults();
    const blueprint = simpleBuilder().build("costed");
    const bill = blueprint.billOfMaterials();
    assert.equal(bill.countOf(MaterialId.Stone), 9);
    assert.equal(bill.countOf(MaterialId.Wood), 2);
    assert.equal(bill.voxelCount, 11);
    // 9 stone at 3 plus 2 wood at 1.
    assert.equal(bill.totalCost(materials), 29);
    assert.equal(blueprint.totalCost(materials), 29);
  });

  it("computes total mass for the systems that will need it later", () => {
    const materials = MaterialTable.defaults();
    const blueprint = simpleBuilder().build("massive");
    // 9 stone at density 1.5 plus 2 wood at 0.5.
    assert.equal(blueprint.totalMass(materials, 1), 14.5);
  });

  it("rejects an empty design and duplicate positions", () => {
    assert.throws(() => new Blueprint("empty", []));
    const duplicated = [
      new BlueprintBlock(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ),
      new BlueprintBlock(new IVec3(0, 0, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ),
    ];
    assert.throws(() => new Blueprint("duplicated", duplicated));
  });

  it("bounds the design tightly", () => {
    const blueprint = simpleBuilder().build("bounded");
    assert.ok(blueprint.bounds.min.equals(new IVec3(0, 0, 0)));
    assert.ok(blueprint.bounds.size.equals(new IVec3(3, 2, 3)));
  });
});

describe("BudgetProvider", () => {
  it("returns a constant in P0", () => {
    const provider = new ConstantBudgetProvider(500);
    assert.equal(provider.materialBudget(), 500);
    assert.equal(provider.materialBudget(), 500);
  });
});
