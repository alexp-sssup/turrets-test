import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { DialsTable } from "../../src/data/DialsTable";

describe("DialsTable", (): void => {
  it("agrees with Dials.defaults(), so the browser build and the harness cannot drift", (): void => {
    const differences = DialsTable.differences(DialsTable.load(), Dials.defaults());
    assert.deepEqual(differences, []);
  });

  it("builds a Dials from an arbitrary record, which is what a tuning session edits", (): void => {
    const record = {
      materialBudget: 250,
      crewPool: 6,
      crewPerStation: 1,
      crewPerRepairDetail: 2,
      waveCount: 2,
      interWaveWindowSeconds: 10,
      crewCarryCapacity: 6,
      stationRackCapacity: 3,
      rackRefillThreshold: 1,
      crewWalkSpeed: 3,
      depotCapacity: 60,
      tickSeconds: 0.1,
      gravity: 9.81,
      voxelSize: 1,
      predictiveThreshold: 0.9,
      repairSecondsPerVoxel: 1,
      handlingSeconds: 0.5,
      structuralIntervalSeconds: 1,
    };
    const dials = DialsTable.fromRecord(record);
    assert.equal(dials.materialBudget, 250);
    assert.equal(dials.tickSeconds, 0.1);
    assert.equal(dials.predictiveThreshold, 0.9);
  });
});
