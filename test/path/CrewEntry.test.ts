import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { MaterialId } from "../../src/materials/MaterialId";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { BlockStructure } from "../../src/structure/BlockStructure";
import { CrewEntry } from "../../src/path/CrewEntry";
import { WalkGraph } from "../../src/path/WalkGraph";

/**
 * A 3x3 slab at y=0 with a ring of wall around its edge at y=1, leaving one open cell in
 * the middle. `doorKind` is what sits in the middle of the -z wall: a wall block seals it,
 * a hatch makes a door of it, and null leaves an open gap.
 */
function box(doorKind: BlockKind | null): BlockStructure {
  const builder = new BlueprintBuilder();
  builder.fillBox(
    new IVec3(0, 0, 0),
    new IVec3(2, 0, 2),
    MaterialId.Stone,
    BlockKind.Structural,
    Direction.PosZ
  );
  for (let x = 0; x <= 2; x++) {
    for (let z = 0; z <= 2; z++) {
      if (x === 1 && z === 1) {
        continue; // the room
      }
      if (x === 1 && z === 0) {
        if (doorKind === null) {
          continue; // an open gap in the wall
        }
        builder.place(new IVec3(x, 1, z), MaterialId.Wood, doorKind, Direction.PosZ);
        continue;
      }
      builder.place(new IVec3(x, 1, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    }
  }
  return new BlockStructure(builder.build("box"));
}

function entriesOf(structure: BlockStructure): IVec3[] {
  return CrewEntry.cells(WalkGraph.build(structure), structure.blueprint.bounds);
}

function reaches(structure: BlockStructure, cell: IVec3): boolean {
  const entries = entriesOf(structure);
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].equals(cell)) {
      return true;
    }
  }
  return false;
}

describe("CrewEntry (crew-access spec 2)", () => {
  // 2.2: a gap is a way in. This is the case the old rule got wrong -- an open doorway was
  // reported as "crew cannot get in" because no block was tagged `Hatch`.
  it("lets crew in through an open gap in the ground-floor wall", () => {
    const open = box(null);
    assert.ok(entriesOf(open).length > 0);
    assert.equal(reaches(open, new IVec3(1, 1, 1)), true, "the room is reachable from outside");
  });

  // 2.2: a hatch in an outer wall is a door too, because a hatch is passable. A convenience,
  // not the reason hatches exist.
  it("lets crew in through a hatch set into the wall", () => {
    const doored = box(BlockKind.Hatch);
    assert.equal(reaches(doored, new IVec3(1, 1, 1)), true);
    assert.equal(reaches(doored, new IVec3(1, 1, 0)), true, "the doorway itself is standable");
  });

  it("finds no way into a sealed ring", () => {
    assert.deepEqual(entriesOf(box(BlockKind.Structural)), []);
  });

  /**
   * 2.1: the ground floor is the lowest storey crew can *stand* on, so the solid slab is a
   * floor and the course resting on it is the storey. If it were read as the slab's own
   * level, a sealed box would have no ground floor at all and every design would fail.
   */
  it("reads the ground floor as the storey on the slab, not the slab", () => {
    const entries = entriesOf(box(null));
    for (let i = 0; i < entries.length; i++) {
      assert.equal(entries[i].y, 1, "every way in is on the storey above the slab");
    }
  });

  /**
   * 2.1 again, and the rule that makes hatches matter: an opening upstairs is not a way in.
   * Crew walk in, they do not scale a wall.
   */
  it("refuses an opening on an upper storey when the ground floor is sealed", () => {
    const builder = new BlueprintBuilder();
    builder.fillBox(new IVec3(0, 0, 0), new IVec3(2, 0, 2), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
    // A sealed ground-floor ring at y=1, a solid deck at y=2, and a ring with a gap at y=3.
    for (let x = 0; x <= 2; x++) {
      for (let z = 0; z <= 2; z++) {
        const middle = x === 1 && z === 1;
        if (!middle) {
          builder.place(new IVec3(x, 1, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
        }
        builder.place(new IVec3(x, 2, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
        if (!middle && !(x === 1 && z === 0)) {
          builder.place(new IVec3(x, 3, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
        }
      }
    }
    const structure = new BlockStructure(builder.build("upstairs only"));
    assert.deepEqual(entriesOf(structure), [], "the gap is on the first floor, not the ground");
  });
});
