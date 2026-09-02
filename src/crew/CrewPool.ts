import { Dials } from "../config/Dials";
import { AssignmentPlan } from "./AssignmentPlan";
import { CrewMember, CrewRole } from "./CrewMember";

/**
 * Spec 4.4: "fixed pool of 12 crew for the whole run. No growth, no food, no housing."
 *
 * Spec 6 calls this "a pool with an assignment layer" whose supply side is what later gets
 * replaced: growth rate, housing cap and food consumption change how many members exist,
 * and assignment, death and repair are untouched. So the pool is constructed with a count
 * and nothing here knows where the count came from.
 */
export class CrewPool {
  private readonly members: readonly CrewMember[];

  public constructor(size: number) {
    const members: CrewMember[] = [];
    for (let i = 0; i < size; i++) {
      members.push(new CrewMember(i));
    }
    this.members = members;
  }

  public get size(): number {
    return this.members.length;
  }

  public get aliveCount(): number {
    let count = 0;
    for (let i = 0; i < this.members.length; i++) {
      if (this.members[i].alive) {
        count++;
      }
    }
    return count;
  }

  public memberAt(id: number): CrewMember {
    return this.members[id];
  }

  public countInRole(role: CrewRole): number {
    let count = 0;
    for (let i = 0; i < this.members.length; i++) {
      if (this.members[i].alive && this.members[i].role === role) {
        count++;
      }
    }
    return count;
  }

  /** Living members in a role, by ascending id so iteration is reproducible. */
  public membersInRole(role: CrewRole): CrewMember[] {
    const found: CrewMember[] = [];
    for (let i = 0; i < this.members.length; i++) {
      if (this.members[i].alive && this.members[i].role === role) {
        found.push(this.members[i]);
      }
    }
    return found;
  }

  /** The living member manning a station, or null. */
  public gunnerAt(station: number): CrewMember | null {
    for (let i = 0; i < this.members.length; i++) {
      const member = this.members[i];
      if (member.alive && member.role === CrewRole.Gunner && member.stationedAt === station) {
        return member;
      }
    }
    return null;
  }

  /**
   * Applies an assignment plan, lowest crew id first. Returns false and changes nothing
   * when the plan does not fit the living pool -- reassignment is a decision the player
   * makes, so a plan that cannot be honoured is an error rather than something to
   * silently truncate.
   */
  public apply(plan: AssignmentPlan, dials: Dials): boolean {
    if (!plan.fitsIn(this.aliveCount, dials)) {
      return false;
    }
    const available: CrewMember[] = [];
    for (let i = 0; i < this.members.length; i++) {
      if (this.members[i].alive) {
        available.push(this.members[i]);
      }
    }
    let cursor = 0;
    for (let i = 0; i < available.length; i++) {
      available[i].role = CrewRole.Idle;
      available[i].stationedAt = -1;
      available[i].awayOnTrip = false;
    }
    for (let s = 0; s < plan.stationCount; s++) {
      for (let c = 0; c < dials.crewPerStation; c++) {
        const member = available[cursor];
        cursor++;
        member.role = CrewRole.Gunner;
        member.stationedAt = plan.stationAt(s);
      }
    }
    for (let d = 0; d < plan.repairDetails; d++) {
      for (let c = 0; c < dials.crewPerRepairDetail; c++) {
        const member = available[cursor];
        cursor++;
        member.role = CrewRole.Repair;
      }
    }
    for (let r = 0; r < plan.runners; r++) {
      const member = available[cursor];
      cursor++;
      member.role = CrewRole.Runner;
    }
    return true;
  }

  /**
   * Spec 4.4: "crew inside a collapsing section die and do not come back". Returns the
   * ids of the dead, ascending.
   */
  public killAt(blocks: readonly number[]): number[] {
    const dead: number[] = [];
    for (let i = 0; i < this.members.length; i++) {
      const member = this.members[i];
      if (!member.alive || member.stationedAt < 0) {
        continue;
      }
      for (let b = 0; b < blocks.length; b++) {
        if (blocks[b] === member.stationedAt) {
          member.alive = false;
          member.role = CrewRole.Idle;
          member.stationedAt = -1;
          member.awayOnTrip = false;
          dead.push(member.id);
          break;
        }
      }
    }
    return dead;
  }

  /** Repair details available, which is what sets the repair rate (spec 5). */
  public repairDetailCount(dials: Dials): number {
    return Math.floor(this.countInRole(CrewRole.Repair) / dials.crewPerRepairDetail);
  }
}
