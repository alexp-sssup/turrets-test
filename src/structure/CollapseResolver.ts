import { Dials } from "../config/Dials";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockStructure } from "./BlockStructure";
import { GROUND_BLOCK } from "./Joint";
import { JointGraph } from "./JointGraph";
import { LoadCase } from "./LoadCase";
import { StructuralReport, StructuralStatus } from "./StructuralReport";
import { StructuralSolver } from "./StructuralSolver";
import { SupportAnalysis } from "./SupportAnalysis";
import { SupportSurface } from "./SupportSurface";

/** Why a round of collapse happened. The replay reads this out loud. */
export enum CollapseCause {
  /** Joints reached capacity and sheared. */
  JointFailure = 0,
  /** Blocks had no path to the ground left. */
  Unsupported = 1,
  /** The whole turret went over its footprint. */
  Tipping = 2,
  /** No admissible force field at any load: nothing on the path could hold the weight. */
  NoCapacity = 3,
}

export function collapseCauseName(cause: CollapseCause): string {
  if (cause === CollapseCause.JointFailure) {
    return "joint failure";
  }
  if (cause === CollapseCause.Unsupported) {
    return "unsupported";
  }
  if (cause === CollapseCause.Tipping) {
    return "tipping";
  }
  return "no capacity";
}

/**
 * Names a joint by its blocks rather than by its graph index.
 *
 * Joint indices are a function of the *current* structure, so they change the moment a
 * block dies. A replay event recorded during wave 2 has to still mean something in wave 5,
 * so events store this instead.
 */
export class JointRef {
  public readonly blockLow: number;
  public readonly blockHigh: number;

  public constructor(blockLow: number, blockHigh: number) {
    this.blockLow = blockLow;
    this.blockHigh = blockHigh;
  }

  public get isSupport(): boolean {
    return this.blockLow === GROUND_BLOCK;
  }

  public equals(other: JointRef): boolean {
    return this.blockLow === other.blockLow && this.blockHigh === other.blockHigh;
  }
}

/** One round of a cascade. A collapse is an ordered list of these, not a boolean. */
export class CollapseEvent {
  public readonly timeSeconds: number;
  /** 0 for the first round of this collapse, 1 for what the first round then caused. */
  public readonly round: number;
  public readonly cause: CollapseCause;
  public readonly loadFactorBefore: number;
  private readonly severed: readonly JointRef[];
  private readonly destroyed: readonly number[];

  public constructor(
    timeSeconds: number,
    round: number,
    cause: CollapseCause,
    loadFactorBefore: number,
    severed: readonly JointRef[],
    destroyed: readonly number[]
  ) {
    this.timeSeconds = timeSeconds;
    this.round = round;
    this.cause = cause;
    this.loadFactorBefore = loadFactorBefore;
    this.severed = severed;
    this.destroyed = destroyed;
  }

  public get severedJoints(): readonly JointRef[] {
    return this.severed;
  }

  public get destroyedBlocks(): readonly number[] {
    return this.destroyed;
  }
}

export class CollapseOutcome {
  private readonly eventList: readonly CollapseEvent[];
  private readonly destroyedList: readonly number[];
  public readonly firstFailedJoint: JointRef | null;
  public readonly finalReport: StructuralReport;
  /** True when the cascade was cut off by the round budget rather than settling. */
  public readonly exhaustedRounds: boolean;

  public constructor(
    events: readonly CollapseEvent[],
    destroyed: readonly number[],
    firstFailedJoint: JointRef | null,
    finalReport: StructuralReport,
    exhaustedRounds: boolean
  ) {
    this.eventList = events;
    this.destroyedList = destroyed;
    this.firstFailedJoint = firstFailedJoint;
    this.finalReport = finalReport;
    this.exhaustedRounds = exhaustedRounds;
  }

  public get events(): readonly CollapseEvent[] {
    return this.eventList;
  }

  /** Every block lost across the whole cascade, in ascending index order. */
  public get destroyedBlocks(): readonly number[] {
    return this.destroyedList;
  }

  public get collapsed(): boolean {
    return this.eventList.length > 0;
  }
}

/**
 * Turns "this structure is over capacity" into an ordered, timestamped story.
 *
 * The loop is: solve, find what gives way, remove it, solve again. That is what produces the
 * second half of the core loop in spec 1.2 -- lose a turret, watch the replay, see the joint
 * that sheared -- and it is why the solver reports a failure *mechanism* rather than just a
 * verdict.
 */
export class CollapseResolver {
  private readonly solver: StructuralSolver;
  private readonly materials: MaterialTable;
  private readonly dials: Dials;
  private readonly maxRounds: number;

  public constructor(
    solver: StructuralSolver,
    materials: MaterialTable,
    dials: Dials,
    maxRounds: number
  ) {
    this.solver = solver;
    this.materials = materials;
    this.dials = dials;
    this.maxRounds = maxRounds;
  }

  public static withDefaults(
    solver: StructuralSolver,
    materials: MaterialTable,
    dials: Dials
  ): CollapseResolver {
    return new CollapseResolver(solver, materials, dials, 12);
  }

  /**
   * Resolves the structure until it stands or nothing is left. Mutates `structure`:
   * destroyed blocks stay destroyed and severed joints stay severed.
   */
  public resolve(
    structure: BlockStructure,
    surface: SupportSurface,
    loadCase: LoadCase,
    timeSeconds: number
  ): CollapseOutcome {
    const events: CollapseEvent[] = [];
    const destroyedAll: number[] = [];
    let firstFailed: JointRef | null = null;
    let round = 0;
    let report = this.analyse(structure, surface, loadCase);

    while (round < this.maxRounds) {
      if (report.floatingBlocks.length > 0) {
        const destroyed = this.destroyBlocks(structure, report.floatingBlocks, destroyedAll);
        events.push(
          new CollapseEvent(timeSeconds, round, CollapseCause.Unsupported, report.loadFactor, [], destroyed)
        );
        round++;
        report = this.analyse(structure, surface, loadCase);
        continue;
      }

      if (report.isTipping) {
        // Rigid-body toppling is deferred to P1 (spec 3), so P0 resolves it the blunt
        // legible way: the turret goes over and is wrecked. It is still the right pressure
        // -- it is what makes a wide base worth paying for.
        const standing: number[] = [];
        for (let block = 0; block < structure.blockCount; block++) {
          if (structure.isAlive(block)) {
            standing.push(block);
          }
        }
        if (standing.length === 0) {
          return new CollapseOutcome(events, destroyedAll, firstFailed, report, false);
        }
        const destroyed = this.destroyBlocks(structure, standing, destroyedAll);
        events.push(
          new CollapseEvent(timeSeconds, round, CollapseCause.Tipping, report.loadFactor, [], destroyed)
        );
        return new CollapseOutcome(
          events,
          destroyedAll,
          firstFailed,
          this.analyse(structure, surface, loadCase),
          false
        );
      }

      if (report.status === StructuralStatus.Sound) {
        return new CollapseOutcome(events, destroyedAll, firstFailed, report, false);
      }

      const joints = report.joints;
      if (report.criticalJoints.length > 0) {
        const severed = this.severJoints(structure, joints, report.criticalJoints);
        if (firstFailed === null && severed.length > 0) {
          firstFailed = severed[0];
        }
        events.push(
          new CollapseEvent(
            timeSeconds,
            round,
            CollapseCause.JointFailure,
            report.loadFactor,
            severed,
            []
          )
        );
        round++;
        report = this.analyse(structure, surface, loadCase);
        continue;
      }

      // Degenerate case: the optimum is a zero force field, so there is no force to point
      // at. The local check knows which blocks cannot hold themselves.
      const doomed = SupportAnalysis.locallyUnsupportable(
        structure,
        joints,
        this.materials,
        this.dials.gravity,
        this.dials.voxelSize,
        1e-9
      );
      const casualties: number[] = [];
      if (doomed.length > 0) {
        for (let i = 0; i < doomed.length; i++) {
          casualties.push(doomed[i]);
        }
      } else {
        // Nothing local explains it either: the standing set has no admissible force field
        // as a whole, so all of it goes.
        for (let block = 0; block < structure.blockCount; block++) {
          if (structure.isAlive(block)) {
            casualties.push(block);
          }
        }
      }
      const destroyed = this.destroyBlocks(structure, casualties, destroyedAll);
      events.push(
        new CollapseEvent(timeSeconds, round, CollapseCause.NoCapacity, report.loadFactor, [], destroyed)
      );
      round++;
      report = this.analyse(structure, surface, loadCase);
    }

    return new CollapseOutcome(events, destroyedAll, firstFailed, report, true);
  }

  private analyse(
    structure: BlockStructure,
    surface: SupportSurface,
    loadCase: LoadCase
  ): StructuralReport {
    const joints = this.solver.buildJointGraph(structure, surface);
    return this.solver.analyse(structure, joints, loadCase.build(structure));
  }

  private severJoints(
    structure: BlockStructure,
    joints: JointGraph,
    indices: readonly number[]
  ): JointRef[] {
    const severed: JointRef[] = [];
    for (let i = 0; i < indices.length; i++) {
      const joint = joints.jointAt(indices[i]);
      structure.severJoint(joint.blockLow, joint.blockHigh);
      severed.push(new JointRef(joint.blockLow, joint.blockHigh));
    }
    return severed;
  }

  private destroyBlocks(
    structure: BlockStructure,
    blocks: readonly number[],
    accumulator: number[]
  ): number[] {
    const destroyed: number[] = [];
    for (let i = 0; i < blocks.length; i++) {
      if (structure.isAlive(blocks[i])) {
        structure.destroy(blocks[i]);
        destroyed.push(blocks[i]);
        accumulator.push(blocks[i]);
      }
    }
    destroyed.sort((a: number, b: number): number => a - b);
    accumulator.sort((a: number, b: number): number => a - b);
    return destroyed;
  }
}
