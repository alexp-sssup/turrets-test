import { Dials } from "../config/Dials";
import * as dialsJsonModule from "./dials.json";

/** The shape `dials.json` has to have. Anything missing is a build error, not a default. */
export interface DialsRecord {
  readonly materialBudget: number;
  readonly crewPool: number;
  readonly crewPerStation: number;
  readonly crewPerRepairDetail: number;
  readonly waveCount: number;
  readonly interWaveWindowSeconds: number;
  readonly crewCarryCapacity: number;
  readonly stationRackCapacity: number;
  readonly rackRefillThreshold: number;
  readonly crewWalkSpeed: number;
  readonly depotCapacity: number;
  readonly tickSeconds: number;
  readonly gravity: number;
  readonly voxelSize: number;
  readonly predictiveThreshold: number;
  readonly repairSecondsPerVoxel: number;
  readonly handlingSeconds: number;
  readonly structuralIntervalSeconds: number;
}

/**
 * The tuning table as data (UI spec 5.5).
 *
 * `Dials.defaults()` stays the authority for the headless core -- it is plain TypeScript
 * with no I/O and it translates -- and this file is the same numbers in a form a tester
 * build can reload without a recompile. `test/data/DialsTable.test.ts` asserts the two
 * agree, so editing one and forgetting the other fails the build rather than quietly
 * changing what the numbers mean.
 */
export class DialsTable {
  /** The dials as shipped, read from `dials.json`. */
  public static load(): Dials {
    return DialsTable.fromRecord(DialsTable.shipped());
  }

  /**
   * The bundled record. A JSON module reaches us as a namespace under CommonJS and behind
   * a `default` under the browser bundler, so both shapes are unwrapped here rather than
   * pinning the whole build to one module format for the sake of one file.
   */
  public static shipped(): DialsRecord {
    const asModule = dialsJsonModule as unknown as { default?: DialsRecord };
    if (asModule.default !== undefined) {
      return asModule.default;
    }
    return dialsJsonModule as unknown as DialsRecord;
  }

  public static fromRecord(record: DialsRecord): Dials {
    return new Dials(
      record.materialBudget,
      record.crewPool,
      record.crewPerStation,
      record.crewPerRepairDetail,
      record.waveCount,
      record.interWaveWindowSeconds,
      record.crewCarryCapacity,
      record.stationRackCapacity,
      record.rackRefillThreshold,
      record.crewWalkSpeed,
      record.depotCapacity,
      record.tickSeconds,
      record.gravity,
      record.voxelSize,
      record.predictiveThreshold,
      record.repairSecondsPerVoxel,
      record.handlingSeconds,
      record.structuralIntervalSeconds
    );
  }

  /** Field-by-field comparison. Used by the test that keeps the two definitions honest. */
  public static differences(a: Dials, b: Dials): string[] {
    const names: readonly string[] = [
      "materialBudget",
      "crewPool",
      "crewPerStation",
      "crewPerRepairDetail",
      "waveCount",
      "interWaveWindowSeconds",
      "crewCarryCapacity",
      "stationRackCapacity",
      "rackRefillThreshold",
      "crewWalkSpeed",
      "depotCapacity",
      "tickSeconds",
      "gravity",
      "voxelSize",
      "predictiveThreshold",
      "repairSecondsPerVoxel",
      "handlingSeconds",
      "structuralIntervalSeconds",
    ];
    const left = DialsTable.values(a);
    const right = DialsTable.values(b);
    const found: string[] = [];
    for (let i = 0; i < names.length; i++) {
      if (left[i] !== right[i]) {
        found.push(names[i] + ": " + left[i].toString() + " vs " + right[i].toString());
      }
    }
    return found;
  }

  private static values(dials: Dials): number[] {
    return [
      dials.materialBudget,
      dials.crewPool,
      dials.crewPerStation,
      dials.crewPerRepairDetail,
      dials.waveCount,
      dials.interWaveWindowSeconds,
      dials.crewCarryCapacity,
      dials.stationRackCapacity,
      dials.rackRefillThreshold,
      dials.crewWalkSpeed,
      dials.depotCapacity,
      dials.tickSeconds,
      dials.gravity,
      dials.voxelSize,
      dials.predictiveThreshold,
      dials.repairSecondsPerVoxel,
      dials.handlingSeconds,
      dials.structuralIntervalSeconds,
    ];
  }
}
