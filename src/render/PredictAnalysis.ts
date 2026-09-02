import { Dials } from "../config/Dials";
import { IVec3 } from "../core/IVec3";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockStructure } from "../structure/BlockStructure";
import { CollapseResolver, JointRef } from "../structure/CollapseResolver";
import { GravityLoadCase } from "../structure/LoadCase";
import { StructuralSolver } from "../structure/StructuralSolver";
import { SupportSurface } from "../structure/SupportSurface";

/** What would happen if one cell died. */
export class PredictOutcome {
  public readonly cell: IVec3;
  public readonly block: number;
  /** Blocks lost in the cascade, excluding the one that was killed. Ascending. */
  public readonly lostBlocks: readonly number[];
  public readonly severedJoints: readonly JointRef[];
  public readonly loadFactorAfter: number;
  /** Wall-clock cost of the answer. Reported in the dev readout, per UI spec 6. */
  public readonly solveMs: number;

  public constructor(
    cell: IVec3,
    block: number,
    lostBlocks: readonly number[],
    severedJoints: readonly JointRef[],
    loadFactorAfter: number,
    solveMs: number
  ) {
    this.cell = cell;
    this.block = block;
    this.lostBlocks = lostBlocks;
    this.severedJoints = severedJoints;
    this.loadFactorAfter = loadFactorAfter;
    this.solveMs = solveMs;
  }

  public get collapses(): boolean {
    return this.lostBlocks.length > 0;
  }

  public static none(cell: IVec3): PredictOutcome {
    return new PredictOutcome(cell, -1, [], [], Number.POSITIVE_INFINITY, 0);
  }
}

/**
 * "What collapses if this cell dies", answered by asking the same solver the run asks.
 *
 * Spec 1.1's claim is that a player can *anticipate* a collapse, so the answer has to be
 * available before the block is lost -- during a run, not only in the replay. It is
 * computed on a clone of the live structure (`BlockStructure.clone`), so speculating is
 * free of consequence: the block is destroyed on the copy, the cascade is resolved on the
 * copy, and the copy is thrown away.
 *
 * The loading is self-weight only. Recoil is a transient that lasts one tick and would make
 * the answer flicker; "does the frame hold itself up without this block" is the question a
 * player is actually asking.
 *
 * It is not cheap -- a cascade is several linear programs, ~100 ms each at P0 sizes -- so
 * the caller runs it off the render path and reports the cost. That honesty is deliberate:
 * §6 exists so the tester's "it stuttered" arrives with numbers attached.
 */
export class PredictAnalysis {
  private readonly materials: MaterialTable;
  private readonly dials: Dials;
  private readonly surface: SupportSurface;
  private readonly resolver: CollapseResolver;
  private readonly loadCase: GravityLoadCase;

  public constructor(materials: MaterialTable, dials: Dials, surface: SupportSurface) {
    this.materials = materials;
    this.dials = dials;
    this.surface = surface;
    const solver = StructuralSolver.withDefaults(materials, dials);
    this.resolver = CollapseResolver.withDefaults(solver, materials, dials);
    this.loadCase = new GravityLoadCase(materials, dials);
  }

  public analyse(structure: BlockStructure, cell: IVec3, block: number): PredictOutcome {
    if (block < 0 || !structure.isAlive(block)) {
      return PredictOutcome.none(cell);
    }
    const started = PredictAnalysis.now();
    const hypothetical = structure.clone();
    hypothetical.destroy(block);
    const outcome = this.resolver.resolve(hypothetical, this.surface, this.loadCase, 0);

    const lost: number[] = [];
    const destroyed = outcome.destroyedBlocks;
    for (let i = 0; i < destroyed.length; i++) {
      if (destroyed[i] !== block) {
        lost.push(destroyed[i]);
      }
    }
    const severed: JointRef[] = [];
    for (let e = 0; e < outcome.events.length; e++) {
      const joints = outcome.events[e].severedJoints;
      for (let j = 0; j < joints.length; j++) {
        severed.push(joints[j]);
      }
    }
    return new PredictOutcome(
      cell,
      block,
      lost,
      severed,
      outcome.finalReport.loadFactor,
      PredictAnalysis.now() - started
    );
  }

  /** The only wall clock in the build, and it is outside `sim/` and `structure/` by design. */
  private static now(): number {
    if (typeof performance !== "undefined") {
      return performance.now();
    }
    return 0;
  }
}
