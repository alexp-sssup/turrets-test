import { StructuralReport } from "../structure/StructuralReport";
import { StationReadout } from "./StationReadout";
import { Violation, ViolationKind } from "./Violation";

/** Everything the editor needs to draw, in one object. */
export class ValidationReport {
  private readonly violationList: readonly Violation[];
  private readonly readoutList: readonly StationReadout[];
  public readonly structural: StructuralReport;
  public readonly cost: number;
  public readonly budget: number;

  public constructor(
    violations: readonly Violation[],
    readouts: readonly StationReadout[],
    structural: StructuralReport,
    cost: number,
    budget: number
  ) {
    this.violationList = violations;
    this.readoutList = readouts;
    this.structural = structural;
    this.cost = cost;
    this.budget = budget;
  }

  public get violations(): readonly Violation[] {
    return this.violationList;
  }

  public get stationReadouts(): readonly StationReadout[] {
    return this.readoutList;
  }

  /** A blueprint with no violations is buildable. */
  public get isValid(): boolean {
    return this.violationList.length === 0;
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

  public countOf(kind: ViolationKind): number {
    let count = 0;
    for (let i = 0; i < this.violationList.length; i++) {
      if (this.violationList[i].kind === kind) {
        count++;
      }
    }
    return count;
  }
}
