import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { AmmoLoadId, AmmoTable } from "../../src/materials/AmmoTable";
import { DamageVerbId } from "../../src/materials/DamageVerbId";
import { FractureBehaviour, MaterialId } from "../../src/materials/MaterialId";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { WeaponClassId, WeaponTable } from "../../src/materials/WeaponTable";
import { Dials } from "../../src/config/Dials";

describe("MaterialTable", () => {
  const materials = MaterialTable.defaults();

  it("matches the spec 4.1 cost column", () => {
    assert.equal(materials.get(MaterialId.Wood).costPerVoxel, 1);
    assert.equal(materials.get(MaterialId.Stone).costPerVoxel, 3);
  });

  it("encodes the two behavioural differences P0 tests", () => {
    const wood = materials.get(MaterialId.Wood);
    const stone = materials.get(MaterialId.Stone);
    // Structural axis: wood tolerates tension, stone is compression only.
    assert.ok(wood.tensionCapacity > 0);
    assert.equal(stone.tensionCapacity, 0);
    assert.ok(stone.compressionCapacity > wood.compressionCapacity);
    // Fire axis: wood burns and propagates, stone is inert.
    assert.equal(wood.isFlammable, true);
    assert.equal(stone.isFlammable, false);
    // Fracture: stone is brittle, wood is not.
    assert.equal(stone.fractureBehaviour, FractureBehaviour.Brittle);
    assert.equal(wood.fractureBehaviour, FractureBehaviour.Ductile);
    // Mass: stone is the heavy one.
    assert.ok(stone.density > wood.density);
  });

  it("computes voxel weight from density and gravity", () => {
    const dials = Dials.defaults();
    const woodWeight = materials.voxelWeight(MaterialId.Wood, dials.gravity, dials.voxelSize);
    const stoneWeight = materials.voxelWeight(MaterialId.Stone, dials.gravity, dials.voxelSize);
    assert.equal(woodWeight, 5);
    assert.equal(stoneWeight, 15);
  });

  it("rejects a table that is not indexed by MaterialId", () => {
    const wood = materials.get(MaterialId.Wood);
    assert.throws(() => new MaterialTable([wood]));
    assert.throws(() => new MaterialTable([materials.get(MaterialId.Stone), wood]));
  });
});

describe("AmmoTable", () => {
  const materials = MaterialTable.defaults();
  const ammo = AmmoTable.defaults(materials);

  it("derives shot weight from the body material, giving the spec 4.3 weights", () => {
    assert.equal(ammo.shotWeight(AmmoLoadId.SolidShot), 3);
    assert.equal(ammo.shotWeight(AmmoLoadId.Firepot), 1);
  });

  it("derives rounds per trip as floor(capacity / weight): 4 shot or 12 firepots", () => {
    const capacity = Dials.defaults().crewCarryCapacity;
    assert.equal(capacity, 12);
    assert.equal(ammo.roundsPerTrip(AmmoLoadId.SolidShot, capacity), 4);
    assert.equal(ammo.roundsPerTrip(AmmoLoadId.Firepot, capacity), 12);
  });

  it("keeps rounds per trip a consequence of weight, not a tuned constant", () => {
    // A heavier body material must reduce rounds per trip with no other change; this is
    // the property spec 6 leans on when steel shot arrives.
    assert.ok(
      ammo.roundsPerTrip(AmmoLoadId.SolidShot, 12) < ammo.roundsPerTrip(AmmoLoadId.Firepot, 12)
    );
    assert.equal(ammo.roundsPerTrip(AmmoLoadId.SolidShot, 2), 0, "a trip that cannot carry one round");
  });

  it("pairs each load with a distinct verb", () => {
    assert.equal(ammo.get(AmmoLoadId.SolidShot).verb, DamageVerbId.Kinetic);
    assert.equal(ammo.get(AmmoLoadId.Firepot).verb, DamageVerbId.Incendiary);
    assert.ok(ammo.get(AmmoLoadId.SolidShot).penetrationDepth > ammo.get(AmmoLoadId.Firepot).penetrationDepth);
  });
});

describe("WeaponTable", () => {
  it("ships one station class that accepts both loads", () => {
    const dials = Dials.defaults();
    const weapons = WeaponTable.defaults(dials.stationRackCapacity);
    const gun = weapons.get(WeaponClassId.Gun);
    assert.equal(gun.rackCapacity, dials.stationRackCapacity);
    assert.equal(gun.accepts(AmmoLoadId.SolidShot), true);
    assert.equal(gun.accepts(AmmoLoadId.Firepot), true);
    assert.equal(gun.loadCount, 2);
    assert.ok(gun.recoilImpulse > 0, "spec 7: recoil ships as a per-shot impulse");
    assert.ok(gun.arcHalfAngle > 0 && gun.arcHalfAngle < Math.PI);
  });
});

describe("Dials", () => {
  it("carries the spec 5 values", () => {
    const dials = Dials.defaults();
    assert.equal(dials.materialBudget, 500);
    assert.equal(dials.crewPool, 12);
    assert.equal(dials.crewPerStation, 1);
    assert.equal(dials.crewPerRepairDetail, 2);
    assert.equal(dials.waveCount, 5);
    assert.equal(dials.interWaveWindowSeconds, 30);
    assert.equal(dials.crewCarryCapacity, 12);
    assert.equal(dials.stationRackCapacity, 9);
    assert.equal(dials.rackRefillThreshold, 3);
    assert.equal(dials.crewWalkSpeed, 2);
    assert.equal(dials.depotCapacity, 240);
  });

  it("keeps the sensitive rack-to-carry ratio at the spec 5 starting point", () => {
    const dials = Dials.defaults();
    assert.ok(dials.stationRackCapacity < dials.crewCarryCapacity, "a trip must be able to fill a rack");
    assert.ok(dials.rackRefillThreshold < dials.stationRackCapacity);
  });
});
