import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { MaterialId } from "../materials/MaterialId";
import { BlockKind } from "../blueprint/BlockKind";
import { Blueprint } from "../blueprint/Blueprint";
import { BlueprintBuilder } from "../blueprint/BlueprintBuilder";

/** A worked example, with the lesson it is built to teach. */
export class WorkedExample {
  public readonly key: string;
  public readonly title: string;
  /** What a tester is meant to notice. Shown in the library and the first-run prompt. */
  public readonly lesson: string;
  public readonly blueprint: Blueprint;

  public constructor(key: string, title: string, lesson: string, blueprint: Blueprint) {
    this.key = key;
    this.title = title;
    this.lesson = lesson;
    this.blueprint = blueprint;
  }
}

/**
 * The three designs a tester starts from (UI spec 7.2).
 *
 * The reasoning behind shipping them at all is the fork-don't-start-blank decision: the
 * hypothesis under test is the *loop*, not the editor, so the first session must not open on
 * an empty grid. Each of the three is deliberately flawed, and each fails a different way,
 * so whichever one a tester picks up they get a replay with something to point at.
 *
 * They are authored here rather than as rows in `data/` because a worked example is a
 * designed teaching artifact -- the placement of every block is the content -- and the
 * codebase already keeps its authored fixtures in `blueprint/SampleBlueprints`. They
 * round-trip through `BlueprintCodec`, so exporting one as JSON from the library is exactly
 * the same design.
 */
export class WorkedExamples {
  public static all(): WorkedExample[] {
    return [
      new WorkedExample(
        "bad-joint",
        "reaching gun",
        "It stands at rest and it will not stay standing. The gun is on a wood arm out over " +
          "the lane; watch the stress overlay before you press start, then watch which joint " +
          "goes first.",
        WorkedExamples.badJoint()
      ),
      new WorkedExample(
        "stone-box",
        "stone keep",
        "This one holds. Two rings of stone, a sunk core, and nothing in five waves gets " +
          "through it -- for 171 material and one gun. Ask what you would knock down to " +
          "afford a second station, and watch the solver readout while it runs.",
        WorkedExamples.stoneBox()
      ),
      new WorkedExample(
        "wood-frame",
        "wood frame",
        "Cheap, well armed and entirely made of one contiguous flammable material. It gets " +
          "to wave three.",
        WorkedExamples.woodFrame()
      ),
    ];
  }

  public static byKey(key: string): WorkedExample | null {
    const all = WorkedExamples.all();
    for (let i = 0; i < all.length; i++) {
      if (all[i].key === key) {
        return all[i];
      }
    }
    return null;
  }

  /** The one the guided first run opens on: it fails structurally, early, at one joint. */
  public static guidedFirstRun(): WorkedExample {
    const example = WorkedExamples.byKey("bad-joint");
    if (example === null) {
      throw new Error("the guided first run needs its worked example");
    }
    return example;
  }

  /**
   * A stone-and-wood hybrid with one bad joint.
   *
   * Sound at rest, so the editor does not warn about it and the tester has no reason to
   * distrust it. The station hangs off a two-voxel wood arm reaching out over the lane, and
   * a wood cantilever runs out of *bending* capacity long before it runs out of shear -- so
   * the first thing the attackers' fire has to do is tip the balance at the arm's root.
   * That is the failure the replay is built to narrate.
   */
  private static badJoint(): Blueprint {
    const builder = new BlueprintBuilder();
    builder.fillBox(
      new IVec3(0, 0, 0),
      new IVec3(4, 0, 4),
      MaterialId.Stone,
      BlockKind.Structural,
      Direction.PosZ
    );
    // The core sits at wall height rather than sunk into the floor. That is the second
    // thing wrong with this design and the tester is not told about it: a flat kinetic
    // trajectory can reach it through the front wall, so once the gun is gone there is
    // nothing stopping the lane.
    builder.place(new IVec3(2, 1, 2), MaterialId.Stone, BlockKind.Core, Direction.PosZ);
    WorkedExamples.perimeter(builder, MaterialId.Wood);
    // The arm: a five-voxel wood cantilever over the lane with a gun on the end of it.
    // Five is the number the solver picks out. Wood runs out of *bending* capacity at
    // about five voxels, well before it runs out of shear, so the arm's root joint is
    // where it gives way -- and at five the margin is 0.96, which means it gives way on
    // the first solve of the run rather than at some point a tester would not connect to
    // the design. Four stands with a margin of 1.5 and only ever loses blocks to being
    // shot off, which the replay narrates as "unsupported" and not as a joint.
    for (let reach = 1; reach <= 4; reach++) {
      builder.place(new IVec3(3, 1, -reach), MaterialId.Wood, BlockKind.Structural, Direction.NegZ);
    }
    builder.place(new IVec3(3, 1, -5), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    builder.place(new IVec3(2, 1, 4), MaterialId.Wood, BlockKind.Hatch, Direction.PosZ);
    builder.place(new IVec3(1, 1, 1), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    builder.place(new IVec3(3, 1, 3), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    return builder.build("reaching gun");
  }

  /**
   * An over-braced stone box that is too expensive to arm properly.
   *
   * This one does not fall over, and that is the point of shipping it. It survives all five
   * waves behind two rings of stone and a sunk core, and the bill it hands you for that is
   * 171 material -- four times the wood frame -- for a single gun. It is P0's honest answer
   * about blobs: the pressure against them here is cost and firepower rather than collapse,
   * which is exactly the partial answer UI spec 2 warns a 2D build can give to §1.3.
   *
   * It is also the design that shows a tester where the solver runs out. At 59 blocks a
   * re-solve costs around 300 ms against a 16 ms budget (docs/structural-solver.md), and
   * the dev readout says so while they watch.
   */
  private static stoneBox(): Blueprint {
    const builder = new BlueprintBuilder();
    builder.fillBox(
      new IVec3(0, 0, 0),
      new IVec3(4, 0, 4),
      MaterialId.Stone,
      BlockKind.Structural,
      Direction.PosZ
    );
    builder.place(new IVec3(2, 0, 2), MaterialId.Stone, BlockKind.Core, Direction.PosZ);
    for (let y = 1; y <= 2; y++) {
      WorkedExamples.perimeterAt(builder, MaterialId.Stone, y);
    }
    builder.place(new IVec3(2, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    builder.place(new IVec3(2, 1, 4), MaterialId.Wood, BlockKind.Hatch, Direction.PosZ);
    builder.place(new IVec3(1, 1, 2), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    return builder.build("stone keep");
  }

  /**
   * A light wood frame that burns.
   *
   * Well armed, cheap, and one contiguous flammable body from the floor up, so wave three's
   * firepots have somewhere to go. Fire runs downhill in this game before it climbs, which
   * means the floor under the guns is what gets consumed.
   */
  private static woodFrame(): Blueprint {
    const builder = new BlueprintBuilder();
    builder.fillBox(
      new IVec3(0, 0, 0),
      new IVec3(4, 0, 4),
      MaterialId.Wood,
      BlockKind.Structural,
      Direction.PosZ
    );
    // A wood core, which is the decision this example is really about: it saves two
    // material and it puts the win condition inside the flammable body.
    builder.place(new IVec3(2, 0, 2), MaterialId.Wood, BlockKind.Core, Direction.PosZ);
    WorkedExamples.perimeter(builder, MaterialId.Wood);
    builder.place(new IVec3(1, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    builder.place(new IVec3(3, 1, 0), MaterialId.Wood, BlockKind.Station, Direction.NegZ);
    builder.place(new IVec3(2, 1, 4), MaterialId.Wood, BlockKind.Hatch, Direction.PosZ);
    builder.place(new IVec3(1, 1, 1), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    builder.place(new IVec3(3, 1, 3), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    return builder.build("wood frame");
  }

  private static perimeter(builder: BlueprintBuilder, material: MaterialId): void {
    WorkedExamples.perimeterAt(builder, material, 1);
  }

  /** A one-voxel-tall ring around the 5x5 footprint at height `y`. */
  private static perimeterAt(builder: BlueprintBuilder, material: MaterialId, y: number): void {
    for (let x = 0; x <= 4; x++) {
      builder.place(new IVec3(x, y, 0), material, BlockKind.Structural, Direction.NegZ);
      builder.place(new IVec3(x, y, 4), material, BlockKind.Structural, Direction.PosZ);
    }
    for (let z = 1; z <= 3; z++) {
      builder.place(new IVec3(0, y, z), material, BlockKind.Structural, Direction.NegX);
      builder.place(new IVec3(4, y, z), material, BlockKind.Structural, Direction.PosX);
    }
  }
}
