import { StationReadout } from "./StationReadout";
import { Violation, ViolationKind } from "./Violation";

/**
 * Everything the editor can tell the player *without* running the linear program.
 *
 * The split exists because the two halves of validation have costs three orders of
 * magnitude apart. Budget, required blocks, firing arcs, crew routes and connectivity are
 * all linear in the block count and come back in well under a millisecond, so they can run
 * on every placed voxel. The structural solve is a simplex over a few hundred columns and
 * takes ~100 ms at P0 sizes (docs/structural-solver.md), so it cannot.
 *
 * Spec 3.1 of the UI spec wants cost and violations felt *during* layout rather than at
 * commit. This is the report that makes that possible: the editor draws this immediately
 * and folds in the structural rows when the debounced solve lands.
 */
export class GeometryReport {
  private readonly violationList: readonly Violation[];
  private readonly readoutList: readonly StationReadout[];
  public readonly cost: number;
  public readonly budget: number;
  private readonly floatingList: readonly number[];

  public constructor(
    violations: readonly Violation[],
    readouts: readonly StationReadout[],
    cost: number,
    budget: number,
    floatingBlocks: readonly number[]
  ) {
    this.violationList = violations;
    this.readoutList = readouts;
    this.cost = cost;
    this.budget = budget;
    this.floatingList = floatingBlocks;
  }

  public get violations(): readonly Violation[] {
    return this.violationList;
  }

  public get stationReadouts(): readonly StationReadout[] {
    return this.readoutList;
  }

  /** Live blocks with no path to the pad. Found without the solver (`SupportAnalysis`). */
  public get floatingBlocks(): readonly number[] {
    return this.floatingList;
  }

  public get remainingBudget(): number {
    return this.budget - this.cost;
  }

  public has(kind: ViolationKind): boolean {
    for (let i = 0; i < this.violationList.length; i++) {
      if (this.violationList[i].kind === kind) {
        return true;
      }
    }
    return false;
  }

  public readoutOf(station: number): StationReadout | null {
    for (let i = 0; i < this.readoutList.length; i++) {
      if (this.readoutList[i].block === station) {
        return this.readoutList[i];
      }
    }
    return null;
  }
}
