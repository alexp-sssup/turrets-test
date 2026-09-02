/**
 * Every tunable number in P0, in one place, because spec 5 says they are placeholders and
 * all expected to move. Nothing in `src/` may hard-code a value that belongs here.
 */
export class Dials {
  /** Spec 5: material budget per run. */
  public readonly materialBudget: number;
  /** Spec 4.4: fixed crew pool for the whole run. */
  public readonly crewPool: number;
  public readonly crewPerStation: number;
  public readonly crewPerRepairDetail: number;
  public readonly waveCount: number;
  /** Seconds of the inter-wave repair window. */
  public readonly interWaveWindowSeconds: number;
  /** Spec 4.3: carry limit is a weight budget, not a round count. */
  public readonly crewCarryCapacity: number;
  public readonly stationRackCapacity: number;
  public readonly rackRefillThreshold: number;
  /** Voxels per second. */
  public readonly crewWalkSpeed: number;
  public readonly depotCapacity: number;

  /** Simulation tick length. Fixed step: spec 4.5 requires determinism. */
  public readonly tickSeconds: number;
  /** Acceleration used to turn density into weight. */
  public readonly gravity: number;
  /** Edge length of one voxel, in the same units as positions. */
  public readonly voxelSize: number;
  /** Joints at or above this utilization are reported as predictive highlights. */
  public readonly predictiveThreshold: number;
  /** Seconds a crew member needs to repair one voxel back to blueprint. */
  public readonly repairSecondsPerVoxel: number;
  /** Seconds a crew member spends loading at a depot or rack. */
  public readonly handlingSeconds: number;
  /**
   * How often the run loop re-checks structural soundness when nothing has changed.
   *
   * A solve is expensive (see docs/structural-solver.md), so the loop also re-checks
   * immediately whenever the structure or the recoil loading changes -- this interval only
   * bounds how stale a quiet frame's answer can be.
   */
  public readonly structuralIntervalSeconds: number;

  public constructor(
    materialBudget: number,
    crewPool: number,
    crewPerStation: number,
    crewPerRepairDetail: number,
    waveCount: number,
    interWaveWindowSeconds: number,
    crewCarryCapacity: number,
    stationRackCapacity: number,
    rackRefillThreshold: number,
    crewWalkSpeed: number,
    depotCapacity: number,
    tickSeconds: number,
    gravity: number,
    voxelSize: number,
    predictiveThreshold: number,
    repairSecondsPerVoxel: number,
    handlingSeconds: number,
    structuralIntervalSeconds: number
  ) {
    this.materialBudget = materialBudget;
    this.crewPool = crewPool;
    this.crewPerStation = crewPerStation;
    this.crewPerRepairDetail = crewPerRepairDetail;
    this.waveCount = waveCount;
    this.interWaveWindowSeconds = interWaveWindowSeconds;
    this.crewCarryCapacity = crewCarryCapacity;
    this.stationRackCapacity = stationRackCapacity;
    this.rackRefillThreshold = rackRefillThreshold;
    this.crewWalkSpeed = crewWalkSpeed;
    this.depotCapacity = depotCapacity;
    this.tickSeconds = tickSeconds;
    this.gravity = gravity;
    this.voxelSize = voxelSize;
    this.predictiveThreshold = predictiveThreshold;
    this.repairSecondsPerVoxel = repairSecondsPerVoxel;
    this.handlingSeconds = handlingSeconds;
    this.structuralIntervalSeconds = structuralIntervalSeconds;
  }

  /** The P0 values from spec 5. */
  public static defaults(): Dials {
    return new Dials(
      500, // material budget
      12, // crew pool
      1, // crew per station
      2, // crew per repair detail
      5, // waves
      30, // inter-wave repair window, seconds
      12, // crew carry capacity, weight units
      9, // station ready rack, weight units
      3, // rack refill threshold, weight units
      2, // crew walk speed, voxels/s
      240, // depot capacity, weight units
      0.05, // tick, seconds (20 Hz)
      10, // gravity
      1, // voxel size
      0.85, // predictive highlight threshold
      2, // repair seconds per voxel
      1, // handling seconds at a rack or depot
      3 // structural re-check interval, seconds
    );
  }
}
