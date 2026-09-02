import { Dials } from "../config/Dials";

/**
 * How the fixed crew pool is divided up (spec 4.4). Declarative: the plan says what is
 * wanted and `CrewPool.apply` says whether it fits.
 *
 * Spec 4.3 is explicit that this is meant to be a real allocation puzzle -- gunners versus
 * repair versus runners -- so the plan is a first-class object a player edits between waves
 * rather than an implicit consequence of block placement.
 */
export class AssignmentPlan {
  private readonly stations: readonly number[];
  public readonly repairDetails: number;
  public readonly runners: number;

  public constructor(stations: readonly number[], repairDetails: number, runners: number) {
    if (repairDetails < 0 || runners < 0) {
      throw new Error("AssignmentPlan cannot ask for negative crew");
    }
    this.stations = stations;
    this.repairDetails = repairDetails;
    this.runners = runners;
  }

  public get stationCount(): number {
    return this.stations.length;
  }

  public stationAt(index: number): number {
    return this.stations[index];
  }

  public crewRequired(dials: Dials): number {
    return (
      this.stations.length * dials.crewPerStation +
      this.repairDetails * dials.crewPerRepairDetail +
      this.runners
    );
  }

  public fitsIn(available: number, dials: Dials): boolean {
    return this.crewRequired(dials) <= available;
  }

  /**
   * A default split: man every station, then put whatever is left into one repair detail
   * and the remainder into the runner pool. Not clever -- it is the baseline a player is
   * meant to beat.
   */
  public static defaultFor(
    stations: readonly number[],
    available: number,
    dials: Dials
  ): AssignmentPlan {
    const manned: number[] = [];
    let spent = 0;
    for (let i = 0; i < stations.length; i++) {
      if (spent + dials.crewPerStation > available) {
        break;
      }
      manned.push(stations[i]);
      spent += dials.crewPerStation;
    }
    let details = 0;
    if (spent + dials.crewPerRepairDetail <= available) {
      details = 1;
      spent += dials.crewPerRepairDetail;
    }
    const runners = available - spent;
    return new AssignmentPlan(manned, details, runners);
  }
}
