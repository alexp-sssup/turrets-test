import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { MaterialId } from "../../src/materials/MaterialId";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { BLUEPRINT_FORMAT_VERSION, BlueprintCodec } from "../../src/persistence/BlueprintCodec";
import { BlueprintLibrary } from "../../src/persistence/BlueprintLibrary";
import { MemoryBlueprintStore } from "../../src/persistence/BlueprintStore";

const materials = MaterialTable.defaults();

describe("BlueprintCodec", () => {
  it("round-trips a blueprint exactly", () => {
    const original = SampleBlueprints.standardTurret();
    const restored = BlueprintCodec.decode(BlueprintCodec.encode(original));
    assert.equal(restored.name, original.name);
    assert.equal(restored.blockCount, original.blockCount);
    assert.equal(restored.totalCost(materials), original.totalCost(materials));
    for (let i = 0; i < original.blockCount; i++) {
      const a = original.blockAt(i);
      const b = restored.blockAt(i);
      assert.ok(a.position.equals(b.position), "block " + i.toString() + " moved");
      assert.equal(a.material, b.material);
      assert.equal(a.kind, b.kind);
      assert.equal(a.facing, b.facing);
    }
  });

  it("preserves canonical order regardless of the order in the file", () => {
    const original = SampleBlueprints.standardTurret();
    const encoded = BlueprintCodec.encode(original);
    const payload = JSON.parse(encoded) as { version: number; name: string; blocks: number[] };
    // Reverse the blocks, six integers at a time.
    const reversed: number[] = [];
    for (let i = payload.blocks.length - 6; i >= 0; i -= 6) {
      for (let k = 0; k < 6; k++) {
        reversed.push(payload.blocks[i + k]);
      }
    }
    const shuffled = BlueprintCodec.decode(
      JSON.stringify({ version: payload.version, name: payload.name, blocks: reversed })
    );
    for (let i = 0; i < original.blockCount; i++) {
      assert.ok(original.blockAt(i).position.equals(shuffled.blockAt(i).position));
    }
  });

  it("refuses a version it does not understand", () => {
    assert.throws(() => BlueprintCodec.decode('{"version":99,"name":"x","blocks":[]}'));
    assert.throws(() =>
      BlueprintCodec.decode(
        '{"version":' + BLUEPRINT_FORMAT_VERSION.toString() + ',"name":"x","blocks":[1,2,3]}'
      )
    );
  });
});

describe("BlueprintLibrary", () => {
  it("stores designs by name and replaces on re-save", () => {
    const library = new BlueprintLibrary();
    library.save(SampleBlueprints.standardTurret());
    library.save(SampleBlueprints.overreachingTurret());
    assert.equal(library.size, 2);
    assert.deepEqual(library.names(), ["standard turret", "overreaching"]);
    assert.notEqual(library.load("standard turret"), null);
    assert.equal(library.load("nothing here"), null);

    // Iterating on one design is the loop being tested, so a re-save replaces.
    const revised = BlueprintBuilder.fromBlueprint(SampleBlueprints.standardTurret())
      .place(new IVec3(2, 2, 2), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .build("standard turret");
    library.save(revised);
    assert.equal(library.size, 2);
    assert.equal((library.load("standard turret") as { blockCount: number }).blockCount, revised.blockCount);
  });

  it("removes designs", () => {
    const library = new BlueprintLibrary();
    library.save(SampleBlueprints.standardTurret());
    assert.equal(library.remove("standard turret"), true);
    assert.equal(library.remove("standard turret"), false);
    assert.equal(library.size, 0);
    assert.deepEqual(library.names(), []);
  });

  it("survives a save and load cycle, which is the cross-run progression", () => {
    const library = new BlueprintLibrary();
    library.save(SampleBlueprints.standardTurret());
    library.save(SampleBlueprints.severedDepotTurret());
    library.save(SampleBlueprints.overreachingTurret());

    const store = new MemoryBlueprintStore("");
    store.write(library);
    const reloaded = store.read();

    assert.deepEqual(reloaded.names(), library.names());
    for (let i = 0; i < library.names().length; i++) {
      const name = library.names()[i];
      const before = library.load(name);
      const after = reloaded.load(name);
      assert.notEqual(after, null);
      assert.equal(
        (after as { blockCount: number }).blockCount,
        (before as { blockCount: number }).blockCount
      );
      assert.equal(
        (after as { totalCost: (m: MaterialTable) => number }).totalCost(materials),
        (before as { totalCost: (m: MaterialTable) => number }).totalCost(materials)
      );
    }
    // And re-encoding is byte-identical, so a save is idempotent.
    assert.equal(reloaded.encode(), library.encode());
  });

  it("reads an empty store without complaining", () => {
    const store = new MemoryBlueprintStore("");
    assert.equal(store.read().size, 0);
    assert.equal(BlueprintLibrary.decode("\n\n  \n").size, 0);
  });
});
