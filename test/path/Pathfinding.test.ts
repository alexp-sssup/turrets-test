import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { MaterialId } from "../../src/materials/MaterialId";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { BlockStructure } from "../../src/structure/BlockStructure";
import { AStar } from "../../src/path/AStar";
import { Path } from "../../src/path/Path";
import { PadSurface } from "../../src/structure/SupportSurface";
import { WalkGraph } from "../../src/path/WalkGraph";

/**
 * The pad these fixtures stand on. Standable-ground spec 2 makes it walkable, so a floor
 * laid directly on it is a floor over the ground rather than the only way across.
 */
const PAD = new PadSurface(0, 0, 7, 0, 0);

function structureOf(builder: BlueprintBuilder, name: string): BlockStructure {
  return new BlockStructure(builder.build(name));
}

/** A flat wooden floor spanning x in [0, length), z = 0. */
function floor(length: number): BlueprintBuilder {
  const builder = new BlueprintBuilder();
  for (let x = 0; x < length; x++) {
    builder.place(new IVec3(x, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
  }
  return builder;
}

/** The same, `height` voxels up, with nothing under it: a deck rather than a floor. */
function deck(length: number, height: number): BlueprintBuilder {
  const builder = new BlueprintBuilder();
  for (let x = 0; x < length; x++) {
    builder.place(new IVec3(x, height, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
  }
  return builder;
}

describe("WalkGraph", () => {
  it("lets crew stand on top of the structure but not inside it", () => {
    const structure = structureOf(floor(3), "floor");
    const graph = WalkGraph.build(structure, PAD);
    assert.equal(graph.isStandable(new IVec3(1, 1, 0)), true, "on top of the floor");
    assert.equal(graph.isStandable(new IVec3(1, 0, 0)), false, "inside a solid block");
    assert.equal(graph.isStandable(new IVec3(1, 2, 0)), false, "no floor under it");
    assert.equal(graph.isStandable(new IVec3(50, 1, 0)), false, "outside the bounds");
  });

  it("treats hatches as passable and as ladders", () => {
    const builder = floor(3)
      .place(new IVec3(1, 1, 0), MaterialId.Wood, BlockKind.Hatch, Direction.PosY)
      .place(new IVec3(1, 2, 0), MaterialId.Wood, BlockKind.Hatch, Direction.PosY)
      .place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(2, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = structureOf(builder, "hatched");
    const graph = WalkGraph.build(structure, PAD);
    assert.equal(graph.isPassable(new IVec3(1, 1, 0)), true);
    assert.equal(graph.isPassable(new IVec3(0, 1, 0)), false);
    assert.equal(graph.isHatch(new IVec3(1, 2, 0)), true);

    // The hatch column is climbable even though the cells flanking it are solid.
    const pathfinder = new AStar(graph);
    const climb = pathfinder.findPath(new IVec3(1, 1, 0), new IVec3(1, 2, 0));
    assert.notEqual(climb, null);
    assert.equal((climb as Path).stepCount, 1);
  });

  it("treats a station as an opening crew stand in, not as a wall (gun-ports spec 2.1, 2.2)", () => {
    const builder = floor(3)
      .place(new IVec3(1, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ)
      .place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(2, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = structureOf(builder, "ported");
    const graph = WalkGraph.build(structure, PAD);
    // 2.1: the slit is person-sized, so the gunner is in it. The wall beside it is not.
    assert.equal(graph.isPassable(new IVec3(1, 1, 0)), true);
    assert.equal(graph.isPassable(new IVec3(0, 1, 0)), false);
    assert.equal(graph.isStation(new IVec3(1, 1, 0)), true);
    assert.equal(graph.isStandable(new IVec3(1, 1, 0)), true);
  });

  it("gives a station its own footing, as the reaching gun needs (gun-ports spec 2.2)", () => {
    // A station on the end of a deck, with open air underneath it: the emplacement is part
    // of the block, so the gunner stands there anyway.
    const builder = deck(2, 1).place(new IVec3(2, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    const structure = structureOf(builder, "cantilevered gun");
    const graph = WalkGraph.build(structure, PAD);
    assert.equal(graph.hasFloor(new IVec3(2, 1, 0)), false, "nothing under it");
    assert.equal(graph.isStandable(new IVec3(2, 1, 0)), true, "and standable regardless");
  });

  it("does not make a stack of gun ports a ladder (gun-ports spec 2.3)", () => {
    // A bare two-port column on the pad. Nothing flanks it, so stepping up and round is not
    // available and the only way from the lower port to the upper one would be straight up.
    const ports = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ)
      .place(new IVec3(0, 2, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    const graph = WalkGraph.build(structureOf(ports, "port stack"), PAD);
    assert.equal(graph.isStandable(new IVec3(0, 1, 0)), true, "each port is standable");
    assert.equal(graph.isStandable(new IVec3(0, 2, 0)), true);
    // Both standable, stacked, and still no way from one to the other: vertical movement is
    // a hatch's job and nobody climbs a wall by its windows.
    assert.equal(new AStar(graph).findPath(new IVec3(0, 1, 0), new IVec3(0, 2, 0)), null);

    // The same column with hatches is a ladder, which is the contrast that makes the rule a
    // rule rather than an oversight.
    const hatches = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 1, 0), MaterialId.Wood, BlockKind.Hatch, Direction.PosY)
      .place(new IVec3(0, 2, 0), MaterialId.Wood, BlockKind.Hatch, Direction.PosY);
    const ladder = WalkGraph.build(structureOf(hatches, "hatch stack"), PAD);
    assert.notEqual(new AStar(ladder).findPath(new IVec3(0, 1, 0), new IVec3(0, 2, 0)), null);
  });

  it("reports the standable cells around a block", () => {
    const structure = structureOf(floor(3), "access");
    const graph = WalkGraph.build(structure, PAD);
    const cells = graph.accessCells(new IVec3(1, 0, 0));
    // The cell above has a floor under it, and the two beside it are the pad's apron:
    // standable-ground spec 2 puts crew on the ground beside a block resting on it.
    // Direction order, so the cell on top comes first and a gunner still stands at the gun
    // rather than on the ground beside it.
    assert.equal(cells.length, 3);
    assert.ok(cells[0].equals(new IVec3(1, 1, 0)));
    assert.ok(cells[1].equals(new IVec3(1, 0, -1)));
    assert.ok(cells[2].equals(new IVec3(1, 0, 1)));
  });

  it("goes stale when the structure changes", () => {
    const structure = structureOf(floor(3), "stale");
    const graph = WalkGraph.build(structure, PAD);
    assert.equal(graph.isStale, false);
    structure.destroy(structure.indexAt(new IVec3(1, 0, 0)));
    assert.equal(graph.isStale, true);
    assert.equal(graph.builtAtVersion < structure.version, true);
  });
});

describe("AStar", () => {
  it("walks a corridor and reports its length and walk time", () => {
    const structure = structureOf(floor(6), "corridor");
    const graph = WalkGraph.build(structure, PAD);
    const pathfinder = new AStar(graph);
    const path = pathfinder.findPath(new IVec3(0, 1, 0), new IVec3(5, 1, 0));
    assert.notEqual(path, null);
    const found = path as Path;
    assert.equal(found.stepCount, 5);
    assert.equal(found.cellCount, 6);
    assert.ok(found.start.equals(new IVec3(0, 1, 0)));
    assert.ok(found.end.equals(new IVec3(5, 1, 0)));
    // Spec 5: crew walk at two voxels per second.
    assert.equal(found.duration(2), 2.5);
    assert.equal(found.roundTripDuration(2), 5);
    assert.equal(found.passesThrough(new IVec3(3, 1, 0)), true);
    assert.equal(found.passesThrough(new IVec3(3, 5, 0)), false);
  });

  /**
   * Spec 4.3: "severing a corridor silences a gun without destroying it" -- and
   * standable-ground spec 3 says where that bites. A corridor one storey up is the only
   * way across, so cutting it strands the runner.
   */
  it("returns null when an elevated corridor is cut", () => {
    const structure = structureOf(deck(6, 2), "cuttable");
    const before = new AStar(WalkGraph.build(structure, PAD)).findPath(
      new IVec3(0, 3, 0),
      new IVec3(5, 3, 0)
    );
    assert.notEqual(before, null);

    structure.destroy(structure.indexAt(new IVec3(3, 2, 0)));
    const after = new AStar(WalkGraph.build(structure, PAD)).findPath(
      new IVec3(0, 3, 0),
      new IVec3(5, 3, 0)
    );
    assert.equal(after, null, "with the deck gone there is no route and no ground to drop to");
  });

  /**
   * The other half of the same rule, and the reason the fixture above had to be lifted:
   * a hole in a floor laid on the pad is a doorway, not a severed corridor. The ground is
   * right there (standable-ground spec 3).
   */
  it("keeps a route when a ground-level floor is holed, because the pad is under it", () => {
    const structure = structureOf(floor(6), "holed");
    structure.destroy(structure.indexAt(new IVec3(3, 0, 0)));
    const after = new AStar(WalkGraph.build(structure, PAD)).findPath(
      new IVec3(0, 1, 0),
      new IVec3(5, 1, 0)
    );
    assert.notEqual(after, null, "crew step down into the gap and back up the other side");
  });

  it("steps up and down by one but not by two", () => {
    const builder = floor(4)
      .place(new IVec3(2, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(3, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const stepUp = structureOf(builder, "step");
    const climb = new AStar(WalkGraph.build(stepUp, PAD)).findPath(new IVec3(0, 1, 0), new IVec3(3, 2, 0));
    assert.notEqual(climb, null);
    assert.equal((climb as Path).stepCount, 3);

    const tall = structureOf(
      floor(4)
        .place(new IVec3(3, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
        .place(new IVec3(3, 2, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ),
      "cliff"
    );
    const blocked = new AStar(WalkGraph.build(tall, PAD)).findPath(new IVec3(0, 1, 0), new IVec3(3, 3, 0));
    assert.equal(blocked, null, "a two-voxel wall needs a hatch, not a jump");
  });

  it("refuses a start or goal that is not standable", () => {
    const structure = structureOf(floor(3), "invalid");
    const pathfinder = new AStar(WalkGraph.build(structure, PAD));
    assert.equal(pathfinder.findPath(new IVec3(1, 0, 0), new IVec3(2, 1, 0)), null);
    assert.equal(pathfinder.findPath(new IVec3(1, 1, 0), new IVec3(2, 5, 0)), null);
    assert.equal(pathfinder.findPathToAny(new IVec3(1, 1, 0), []), null);
  });

  it("returns a single-cell path when already there", () => {
    const structure = structureOf(floor(3), "trivial");
    const path = new AStar(WalkGraph.build(structure, PAD)).findPath(new IVec3(1, 1, 0), new IVec3(1, 1, 0));
    assert.notEqual(path, null);
    assert.equal((path as Path).stepCount, 0);
    assert.equal((path as Path).duration(2), 0);
  });

  it("picks the nearest of several goals regardless of how they were listed", () => {
    // Spec 4.3 needs "the path to its nearest depot" to be a property of the structure,
    // not of the order the depots happen to be enumerated in.
    const structure = structureOf(floor(9), "depots");
    const pathfinder = new AStar(WalkGraph.build(structure, PAD));
    const near = new IVec3(6, 1, 0);
    const far = new IVec3(0, 1, 0);
    const forward = pathfinder.findPathToAny(new IVec3(5, 1, 0), [far, near]);
    const backward = pathfinder.findPathToAny(new IVec3(5, 1, 0), [near, far]);
    assert.notEqual(forward, null);
    assert.notEqual(backward, null);
    assert.ok((forward as Path).end.equals(near));
    assert.ok((backward as Path).end.equals(near));
  });

  it("is deterministic, step for step, across repeated searches", () => {
    // Spec 4.5 again: the same blueprint has to produce the same route every run, or the
    // fix-and-rerun loop stops meaning anything.
    const builder = new BlueprintBuilder();
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        builder.place(new IVec3(x, 0, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
      }
    }
    // A two-voxel pillar in the middle: too tall to step over, so there are exactly two
    // symmetric detours of equal length and the tie-break has to decide.
    builder.place(new IVec3(3, 1, 3), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    builder.place(new IVec3(3, 2, 3), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = structureOf(builder, "symmetric");

    const first = new AStar(WalkGraph.build(structure, PAD)).findPath(new IVec3(0, 1, 3), new IVec3(6, 1, 3));
    const second = new AStar(WalkGraph.build(structure, PAD)).findPath(new IVec3(0, 1, 3), new IVec3(6, 1, 3));
    assert.notEqual(first, null);
    const a = first as Path;
    const b = second as Path;
    assert.equal(a.cellCount, b.cellCount);
    for (let i = 0; i < a.cellCount; i++) {
      assert.ok(a.cellAt(i).equals(b.cellAt(i)), "cell " + i.toString() + " differs");
    }
    // And it really did have to go around.
    assert.equal(a.passesThrough(new IVec3(3, 1, 3)), false);
    assert.equal(a.stepCount, 8);
  });

  it("finds the shortest route, verified against breadth-first search", () => {
    // Independent check on the heuristic: A* with an admissible heuristic must agree with
    // an unguided flood fill on distance.
    const builder = new BlueprintBuilder();
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        builder.place(new IVec3(x, 0, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
      }
    }
    for (let z = 0; z < 6; z++) {
      builder.place(new IVec3(4, 1, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    }
    const structure = structureOf(builder, "maze");
    const graph = WalkGraph.build(structure, PAD);
    const start = new IVec3(0, 1, 0);
    const goal = new IVec3(7, 1, 0);
    const path = new AStar(graph).findPath(start, goal);
    assert.notEqual(path, null);
    assert.equal((path as Path).stepCount, breadthFirstDistance(graph, start, goal));
  });
});

/** Unguided flood fill, used only to check A* distances. */
function breadthFirstDistance(graph: WalkGraph, start: IVec3, goal: IVec3): number {
  const distance = new Map<number, number>();
  const queue: IVec3[] = [start];
  distance.set(graph.indexOf(start), 0);
  const scratch: IVec3[] = [];
  for (let i = 0; i < WalkGraph.maxNeighbours(); i++) {
    scratch.push(IVec3.zero());
  }
  let head = 0;
  while (head < queue.length) {
    const cell = queue[head];
    head++;
    const here = distance.get(graph.indexOf(cell)) as number;
    if (cell.equals(goal)) {
      return here;
    }
    const count = graph.neighbours(cell, scratch);
    for (let i = 0; i < count; i++) {
      const index = graph.indexOf(scratch[i]);
      if (!distance.has(index)) {
        distance.set(index, here + 1);
        queue.push(scratch[i]);
      }
    }
  }
  return -1;
}
