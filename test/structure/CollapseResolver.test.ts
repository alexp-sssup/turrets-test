import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { Vec3 } from "../../src/core/Vec3";
import { MaterialId } from "../../src/materials/MaterialId";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { BlockStructure } from "../../src/structure/BlockStructure";
import {
  CollapseCause,
  CollapseResolver,
  collapseCauseName,
  JointRef,
} from "../../src/structure/CollapseResolver";
import { GravityLoadCase, LoadCase } from "../../src/structure/LoadCase";
import { LoadSet } from "../../src/structure/LoadSet";
import { PadSurface } from "../../src/structure/SupportSurface";
import { StructuralStatus } from "../../src/structure/StructuralReport";
import { Harness } from "./StructureHarness";

const harness = Harness.withDefaults();
const resolver = CollapseResolver.withDefaults(harness.solver, harness.materials, harness.dials);
const gravity = new GravityLoadCase(harness.materials, harness.dials);

/** A wall with an arm of `armLength` voxels reaching out of its top. */
function cantilever(armLength: number): BlueprintBuilder {
  const builder = new BlueprintBuilder().fillBox(
    new IVec3(-2, 0, 0),
    new IVec3(0, 3, 0),
    MaterialId.Wood,
    BlockKind.Structural,
    Direction.PosZ
  );
  for (let x = 1; x <= armLength; x++) {
    builder.place(new IVec3(x, 3, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
  }
  return builder;
}

const wallPad = new PadSurface(0, -2, 0, 0, 0);

describe("CollapseResolver", () => {
  it("leaves a sound structure completely alone", () => {
    const structure = harness.structureOf(cantilever(3).build("sound"));
    const versionBefore = structure.version;
    const outcome = resolver.resolve(structure, wallPad, gravity, 12.5);
    assert.equal(outcome.collapsed, false);
    assert.equal(outcome.events.length, 0);
    assert.equal(outcome.destroyedBlocks.length, 0);
    assert.equal(outcome.firstFailedJoint, null);
    assert.equal(structure.version, versionBefore, "a sound structure must not be touched");
    assert.equal(outcome.finalReport.status, StructuralStatus.Sound);
  });

  it("shears the root joint of an over-long arm and drops what it was holding", () => {
    const structure = harness.structureOf(cantilever(6).build("collapsing"));
    const rootBlock = structure.indexAt(new IVec3(0, 3, 0));
    const armBlock = structure.indexAt(new IVec3(1, 3, 0));
    const outcome = resolver.resolve(structure, wallPad, gravity, 40);

    assert.equal(outcome.collapsed, true);
    assert.notEqual(outcome.firstFailedJoint, null);
    const first = outcome.firstFailedJoint as JointRef;

    // The story reads in order: a joint fails, then what it was holding is unsupported.
    assert.ok(outcome.events.length >= 2, "expected a cascade, got " + outcome.events.length.toString());
    assert.equal(outcome.events[0].cause, CollapseCause.JointFailure);
    assert.equal(outcome.events[0].round, 0);
    assert.equal(outcome.events[0].timeSeconds, 40);
    assert.ok(outcome.events[0].loadFactorBefore < 1);
    assert.ok(outcome.events[0].severedJoints.length > 0);

    let sawUnsupported = false;
    for (let i = 1; i < outcome.events.length; i++) {
      if (outcome.events[i].cause === CollapseCause.Unsupported) {
        sawUnsupported = true;
        assert.ok(outcome.events[i].round > 0);
      }
    }
    assert.equal(sawUnsupported, true, "the arm should come off after its root goes");

    // The arm is gone; the wall is still standing.
    assert.equal(structure.isAlive(armBlock), false);
    assert.equal(structure.isAlive(rootBlock), true);
    assert.equal(structure.isAlive(structure.blueprint.indexAt(new IVec3(-2, 0, 0))), true);
    assert.ok(outcome.destroyedBlocks.length >= 6, "the whole arm falls");
    assert.equal(outcome.finalReport.status, StructuralStatus.Sound, "what remains stands");
    assert.equal(outcome.exhaustedRounds, false);

    // Every severed joint is named by its blocks, which survive renumbering.
    assert.ok(first.blockLow >= -1 && first.blockHigh >= 0);
    assert.equal(collapseCauseName(CollapseCause.JointFailure), "joint failure");
  });

  it("destroys blocks that were already floating", () => {
    const builder = new BlueprintBuilder()
      .fillBox(new IVec3(0, 0, 0), new IVec3(1, 1, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(5, 3, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = harness.structureOf(builder.build("floater"));
    const floater = structure.indexAt(new IVec3(5, 3, 0));
    const outcome = resolver.resolve(structure, new PadSurface(0, 0, 1, 0, 0), gravity, 3);
    assert.equal(outcome.events.length, 1);
    assert.equal(outcome.events[0].cause, CollapseCause.Unsupported);
    assert.deepEqual(Array.from(outcome.destroyedBlocks), [floater]);
    assert.equal(structure.isAlive(floater), false);
  });

  it("cascades when a support is cut out from under a tower", () => {
    const builder = new BlueprintBuilder().fillBox(
      new IVec3(0, 0, 0),
      new IVec3(0, 3, 0),
      MaterialId.Wood,
      BlockKind.Structural,
      Direction.PosZ
    );
    const structure = harness.structureOf(builder.build("cut-tower"));
    structure.severJoint(-1, structure.indexAt(new IVec3(0, 0, 0)));
    const outcome = resolver.resolve(structure, new PadSurface(0, 0, 0, 0, 0), gravity, 9);
    assert.equal(outcome.events.length, 1);
    assert.equal(outcome.events[0].cause, CollapseCause.Unsupported);
    assert.equal(outcome.destroyedBlocks.length, 4, "the whole tower goes at once");
    assert.equal(structure.aliveCount, 0);
  });

  it("wrecks a turret that recoil throws over its own footprint", () => {
    // Spec 7's failure mode. Tipping itself is deferred to P1, so P0 resolves it bluntly,
    // but the pressure -- pay for a wide base -- is present and legible.
    const builder = new BlueprintBuilder()
      .fillBox(new IVec3(0, 0, 0), new IVec3(0, 3, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 4, 0), MaterialId.Wood, BlockKind.Station, Direction.NegX);
    const structure = harness.structureOf(builder.build("tipper"));
    const recoil = new RecoilLoadCase(harness.materials, harness.dials, 40);
    const outcome = resolver.resolve(structure, new PadSurface(0, 0, 0, 0, 0), recoil, 21);
    assert.ok(outcome.events.length >= 1);
    assert.equal(outcome.events[0].cause, CollapseCause.Tipping);
    assert.equal(structure.aliveCount, 0);
  });

  it("names the casualty when the optimum has no force to point at", () => {
    // Stone hanging from stone: the load factor is zero with an all-zero force field, so
    // there is no critical joint. The local capacity check is what resolves it.
    const builder = new BlueprintBuilder()
      .fillBox(new IVec3(0, 0, 0), new IVec3(0, 2, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 2, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(1, 1, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
    const structure = harness.structureOf(builder.build("hanging-stone"));
    const hanging = structure.indexAt(new IVec3(1, 1, 0));
    structure.severJoint(structure.indexAt(new IVec3(0, 1, 0)), hanging);
    const outcome = resolver.resolve(structure, new PadSurface(0, 0, 0, 0, 0), gravity, 5);
    assert.equal(outcome.collapsed, true);
    assert.equal(outcome.events[0].cause, CollapseCause.NoCapacity);
    let hangingDied = false;
    for (let i = 0; i < outcome.destroyedBlocks.length; i++) {
      if (outcome.destroyedBlocks[i] === hanging) {
        hangingDied = true;
      }
    }
    assert.equal(hangingDied, true);
  });

  it("produces an identical cascade on a re-run, which is what makes the loop work", () => {
    // Spec 4.5: a blueprint change has to be the only variable between two attempts.
    const first = resolver.resolve(
      harness.structureOf(cantilever(6).build("replay-a")),
      wallPad,
      gravity,
      17
    );
    const second = resolver.resolve(
      harness.structureOf(cantilever(6).build("replay-b")),
      wallPad,
      gravity,
      17
    );
    assert.equal(first.events.length, second.events.length);
    for (let i = 0; i < first.events.length; i++) {
      assert.equal(first.events[i].cause, second.events[i].cause);
      assert.equal(first.events[i].round, second.events[i].round);
      assert.equal(first.events[i].loadFactorBefore, second.events[i].loadFactorBefore);
      assert.deepEqual(
        Array.from(first.events[i].destroyedBlocks),
        Array.from(second.events[i].destroyedBlocks)
      );
      assert.equal(first.events[i].severedJoints.length, second.events[i].severedJoints.length);
      for (let k = 0; k < first.events[i].severedJoints.length; k++) {
        assert.equal(
          first.events[i].severedJoints[k].equals(second.events[i].severedJoints[k]),
          true
        );
      }
    }
    assert.deepEqual(Array.from(first.destroyedBlocks), Array.from(second.destroyedBlocks));
  });

  it("stops at its round budget rather than spinning", () => {
    const tight = new CollapseResolver(harness.solver, harness.materials, harness.dials, 1);
    const structure = harness.structureOf(cantilever(6).build("budgeted"));
    const outcome = tight.resolve(structure, wallPad, gravity, 0);
    assert.equal(outcome.events.length, 1);
    assert.equal(outcome.exhaustedRounds, true);
  });
});

/** Gravity plus a fixed recoil impulse at every station, pushing along +x. */
class RecoilLoadCase implements LoadCase {
  private readonly base: GravityLoadCase;
  private readonly impulse: number;

  public constructor(
    materials: typeof harness.materials,
    dials: typeof harness.dials,
    impulse: number
  ) {
    this.base = new GravityLoadCase(materials, dials);
    this.impulse = impulse;
  }

  public build(structure: BlockStructure): LoadSet {
    const loads = this.base.build(structure);
    const stations = structure.aliveOfKind(BlockKind.Station);
    for (let i = 0; i < stations.length; i++) {
      loads.addForce(stations[i], new Vec3(this.impulse, 0, 0));
    }
    return loads;
  }

  public stamp(): number {
    return 1;
  }
}
