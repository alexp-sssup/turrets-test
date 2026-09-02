import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Direction } from "../../src/core/Direction";
import { IVec3 } from "../../src/core/IVec3";
import { Dials } from "../../src/config/Dials";
import { AmmoLoadId, AmmoTable } from "../../src/materials/AmmoTable";
import { MaterialId } from "../../src/materials/MaterialId";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { BlockKind } from "../../src/blueprint/BlockKind";
import { BlueprintBuilder } from "../../src/blueprint/BlueprintBuilder";
import { BlockStructure } from "../../src/structure/BlockStructure";
import { DamageSystem } from "../../src/damage/DamageSystem";
import { FireSimulation } from "../../src/damage/FireSimulation";
import { Impact } from "../../src/damage/Impact";
import { KineticVerb } from "../../src/damage/KineticVerb";
import { IncendiaryVerb } from "../../src/damage/IncendiaryVerb";

const materials = MaterialTable.defaults();
const ammo = AmmoTable.defaults(materials);
const dials = Dials.defaults();

function rowOf(length: number, material: MaterialId, name: string): BlockStructure {
  const builder = new BlueprintBuilder();
  for (let z = 0; z < length; z++) {
    builder.place(new IVec3(0, 0, z), material, BlockKind.Structural, Direction.PosZ);
  }
  return new BlockStructure(builder.build(name));
}

describe("KineticVerb", () => {
  const verb = KineticVerb.withDefaults(materials);

  it("punches through wood as far as its damage lasts", () => {
    // Solid shot carries 24 damage; wood has 10 integrity, so two voxels die and the
    // third is left with 4 of damage on it.
    const structure = rowOf(5, MaterialId.Wood, "wood-row");
    const impact = new Impact(new IVec3(0, 0, 0), Direction.PosZ, AmmoLoadId.SolidShot, 24, 4);
    const result = verb.apply(structure, impact);
    assert.deepEqual(Array.from(result.destroyedBlocks), [0, 1]);
    assert.equal(structure.isAlive(2), true);
    assert.equal(structure.damageOf(2), 4);
    assert.equal(structure.damageOf(3), 0, "the round ran out before reaching this one");
  });

  it("stops in stone, because integrity is what absorbs it", () => {
    const structure = rowOf(5, MaterialId.Stone, "stone-row");
    const result = verb.apply(structure, new Impact(new IVec3(0, 0, 0), Direction.PosZ, AmmoLoadId.SolidShot, 24, 4));
    assert.equal(result.destroyedBlocks.length, 0, "24 damage against 30 integrity");
    assert.equal(structure.damageOf(0), 24);
    assert.equal(structure.damageOf(1), 0);
  });

  it("degrades the joints around a block it fails to kill", () => {
    // Structure is lost before blocks are, which is what lets the heatmap warn mid-wave.
    const structure = rowOf(3, MaterialId.Stone, "degrade");
    const before = structure.jointFactor(0, 1);
    assert.equal(before, 1);
    const result = verb.apply(structure, new Impact(new IVec3(0, 0, 1), Direction.PosZ, AmmoLoadId.SolidShot, 15, 1));
    assert.ok(result.degradedJoints.length > 0);
    assert.ok(structure.jointFactor(0, 1) < 1, "the joint behind the hit is weaker");
    assert.ok(structure.jointFactor(1, 2) < 1, "and so is the one in front");
  });

  it("shatters brittle stone into its neighbours' joints", () => {
    // Spec 4.1: stone "fractures under concentrated impact". Two hits on one face of a
    // stone plate, and the hole they leave is surrounded by weakened joints -- so
    // concentrating fire on one spot is worth more than spreading it around.
    const builder = new BlueprintBuilder();
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        builder.place(new IVec3(x, 0, z), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
      }
    }
    const structure = new BlockStructure(builder.build("plate"));
    const centre = structure.indexAt(new IVec3(0, 0, 0));
    const westEdge = structure.indexAt(new IVec3(-1, 0, 0));
    const westCorner = structure.indexAt(new IVec3(-1, 0, -1));

    verb.apply(structure, new Impact(new IVec3(0, 0, 0), Direction.PosY, AmmoLoadId.SolidShot, 20, 1));
    const ringBefore = structure.jointFactor(
      westCorner < westEdge ? westCorner : westEdge,
      westCorner < westEdge ? westEdge : westCorner
    );
    const result = verb.apply(structure, new Impact(new IVec3(0, 0, 0), Direction.PosY, AmmoLoadId.SolidShot, 20, 1));
    assert.deepEqual(Array.from(result.destroyedBlocks), [centre]);
    const ringAfter = structure.jointFactor(
      westCorner < westEdge ? westCorner : westEdge,
      westCorner < westEdge ? westEdge : westCorner
    );
    assert.ok(
      ringAfter < ringBefore,
      "the fracture should reach past the block that died: " + ringBefore.toString() + " -> " + ringAfter.toString()
    );
  });

  it("passes through a hole rather than stopping at it", () => {
    const structure = rowOf(4, MaterialId.Wood, "holed");
    structure.destroy(1);
    const result = verb.apply(structure, new Impact(new IVec3(0, 0, 0), Direction.PosZ, AmmoLoadId.SolidShot, 24, 4));
    assert.deepEqual(Array.from(result.destroyedBlocks), [0, 2]);
  });

  it("finds the first contact along a heading", () => {
    const structure = rowOf(3, MaterialId.Wood, "contact");
    const hit = KineticVerb.firstContact(structure, new IVec3(0, 0, -5), Direction.PosZ, 10);
    assert.notEqual(hit, null);
    assert.ok((hit as IVec3).equals(new IVec3(0, 0, 0)));
    assert.equal(KineticVerb.firstContact(structure, new IVec3(9, 9, 9), Direction.PosZ, 3), null);
  });
});

describe("IncendiaryVerb", () => {
  const verb = IncendiaryVerb.withDefaults(materials);

  it("ignites wood it lands on", () => {
    const structure = rowOf(2, MaterialId.Wood, "catches");
    const result = verb.apply(structure, new Impact(new IVec3(0, 0, 0), Direction.PosZ, AmmoLoadId.Firepot, 6, 1));
    assert.deepEqual(Array.from(result.ignitions), [0]);
  });

  it("does not ignite stone", () => {
    const structure = rowOf(2, MaterialId.Stone, "inert");
    const result = verb.apply(structure, new Impact(new IVec3(0, 0, 0), Direction.PosZ, AmmoLoadId.Firepot, 6, 1));
    assert.equal(result.ignitions.length, 0);
  });

  it("flows downward through a gap to find something that will burn", () => {
    // Spec 4.3: it "flows downward before igniting". An open frame is worse than a closed
    // one, and this is why.
    const builder = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 4, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
    const structure = new BlockStructure(builder.build("flows"));
    // Lands in the empty cell above the wood, three voxels up.
    const result = verb.apply(structure, new Impact(new IVec3(0, 3, 0), Direction.NegY, AmmoLoadId.Firepot, 6, 1));
    const wood = structure.indexAt(new IVec3(0, 0, 0));
    assert.deepEqual(Array.from(result.ignitions), [wood]);
  });

  it("is stopped by a stone floor before it reaches the wood below", () => {
    const builder = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 1, 0), MaterialId.Stone, BlockKind.Structural, Direction.PosZ);
    const structure = new BlockStructure(builder.build("shielded"));
    const result = verb.apply(structure, new Impact(new IVec3(0, 3, 0), Direction.NegY, AmmoLoadId.Firepot, 6, 1));
    assert.equal(result.ignitions.length, 0, "a stone roof over wood is worth paying for");
  });
});

describe("FireSimulation", () => {
  it("spreads along contiguous wood and eventually consumes it", () => {
    const structure = rowOf(4, MaterialId.Wood, "burns");
    const fire = FireSimulation.withDefaults(materials);
    assert.equal(fire.ignite(structure, 0), true);
    assert.equal(fire.ignite(structure, 0), false, "already alight");
    assert.equal(fire.isBurning(0), true);

    // Wood burns for six seconds and sets its neighbours alight halfway through.
    const spread = fire.advance(structure, 3);
    assert.deepEqual(Array.from(spread.spread), [1]);
    assert.equal(spread.consumed.length, 0);

    const finish = fire.advance(structure, 3);
    assert.deepEqual(Array.from(finish.consumed), [0]);
    assert.equal(structure.isAlive(0), false);
    assert.equal(fire.isBurning(0), false);
    assert.equal(fire.isBurning(1), true, "the fire outlived the block that started it");
  });

  it("cannot cross a stone gap", () => {
    const builder = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 0, 1), MaterialId.Stone, BlockKind.Structural, Direction.PosZ)
      .place(new IVec3(0, 0, 2), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
    const structure = new BlockStructure(builder.build("firebreak"));
    const fire = FireSimulation.withDefaults(materials);
    fire.ignite(structure, structure.indexAt(new IVec3(0, 0, 0)));
    for (let i = 0; i < 10; i++) {
      fire.advance(structure, 1);
    }
    assert.equal(structure.isAlive(structure.blueprint.indexAt(new IVec3(0, 0, 2))), true);
    assert.equal(structure.isAlive(structure.blueprint.indexAt(new IVec3(0, 0, 1))), true);
    // Spec 4.1: contiguity is what fire needs, so a stone course is a firebreak.
  });

  it("refuses to ignite stone or a destroyed block", () => {
    const structure = rowOf(2, MaterialId.Stone, "unlit");
    const fire = FireSimulation.withDefaults(materials);
    assert.equal(fire.ignite(structure, 0), false);
    assert.equal(fire.ignite(structure, -1), false);
    const wood = rowOf(1, MaterialId.Wood, "gone");
    wood.destroy(0);
    assert.equal(fire.ignite(wood, 0), false);
  });

  it("burns the same way on a re-run", () => {
    const run = (): string => {
      const structure = rowOf(6, MaterialId.Wood, "determinism");
      const fire = FireSimulation.withDefaults(materials);
      fire.ignite(structure, 2);
      const log: string[] = [];
      for (let tick = 0; tick < 12; tick++) {
        const step = fire.advance(structure, 1);
        log.push(step.spread.join(",") + "|" + step.consumed.join(","));
      }
      return log.join(";");
    };
    assert.equal(run(), run());
  });

  it("drops burning blocks that something else destroyed", () => {
    const structure = rowOf(2, MaterialId.Wood, "pruned");
    const fire = FireSimulation.withDefaults(materials);
    fire.ignite(structure, 0);
    structure.destroy(0);
    fire.prune(structure);
    assert.equal(fire.burningCount, 0);
    assert.deepEqual(fire.burningBlocks(), []);
  });
});

describe("DamageSystem", () => {
  it("routes each load to its verb", () => {
    const fire = FireSimulation.withDefaults(materials);
    const system = DamageSystem.withDefaults(materials, ammo, fire, dials);
    const structure = rowOf(4, MaterialId.Wood, "routed");

    const kinetic = system.applyImpact(
      structure,
      new Impact(new IVec3(0, 0, 0), Direction.PosZ, AmmoLoadId.SolidShot, 24, 4)
    );
    assert.ok(kinetic.destroyedBlocks.length > 0);
    assert.equal(kinetic.ignitions.length, 0);

    const incendiary = system.applyImpact(
      structure,
      new Impact(new IVec3(0, 0, 3), Direction.PosZ, AmmoLoadId.Firepot, 6, 1)
    );
    assert.ok(incendiary.ignitions.length > 0);
    assert.equal(fire.isBurning(incendiary.ignitions[0]), true, "the system starts the fire itself");
  });

  it("cooks off a penetrated depot and takes its neighbours with it", () => {
    // Spec 4.3: "one central depot is cheap and one penetration away from ending the run".
    const builder = new BlueprintBuilder();
    for (let z = 0; z < 5; z++) {
      for (let x = -1; x <= 1; x++) {
        builder.place(new IVec3(x, 0, z), MaterialId.Wood, BlockKind.Structural, Direction.PosZ);
      }
    }
    builder.place(new IVec3(0, 0, 2), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    const structure = new BlockStructure(builder.build("depot"));
    const depot = structure.indexAt(new IVec3(0, 0, 2));
    const fire = FireSimulation.withDefaults(materials);
    const system = DamageSystem.withDefaults(materials, ammo, fire, dials);

    const result = system.applyImpact(
      structure,
      new Impact(new IVec3(0, 0, 2), Direction.PosZ, AmmoLoadId.SolidShot, 24, 1)
    );
    assert.deepEqual(Array.from(result.detonatedDepots), [depot]);
    assert.equal(structure.isAlive(depot), false);
    // Everything within one voxel of it is gone too.
    assert.equal(structure.isAlive(structure.blueprint.indexAt(new IVec3(0, 0, 1))), false);
    assert.equal(structure.isAlive(structure.blueprint.indexAt(new IVec3(-1, 0, 2))), false);
    assert.ok(result.destroyedBlocks.length >= 4);
  });

  it("cascades when depots are stacked next to each other", () => {
    // The other half of the same sentence: dispersal is two-sided pressure.
    const builder = new BlueprintBuilder()
      .place(new IVec3(0, 0, 0), MaterialId.Wood, BlockKind.Depot, Direction.PosZ)
      .place(new IVec3(0, 0, 1), MaterialId.Wood, BlockKind.Depot, Direction.PosZ)
      .place(new IVec3(0, 0, 2), MaterialId.Wood, BlockKind.Depot, Direction.PosZ);
    const structure = new BlockStructure(builder.build("stacked depots"));
    const fire = FireSimulation.withDefaults(materials);
    const system = DamageSystem.withDefaults(materials, ammo, fire, dials);
    const result = system.applyImpact(
      structure,
      new Impact(new IVec3(0, 0, 0), Direction.PosZ, AmmoLoadId.SolidShot, 24, 1)
    );
    assert.equal(structure.aliveCount, 0, "all three went");
    assert.ok(result.detonatedDepots.length >= 2);
  });

  it("rejects a verb table with the wrong shape", () => {
    const fire = FireSimulation.withDefaults(materials);
    assert.throws(() => new DamageSystem([], materials, ammo, fire, 1, 20));
  });
});
