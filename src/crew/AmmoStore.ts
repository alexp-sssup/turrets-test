import { AMMO_LOAD_COUNT, AmmoLoadId, AmmoTable } from "../materials/AmmoTable";

/**
 * A weight-limited ammunition store: a station's ready rack or a munition depot.
 *
 * Capacity is a weight budget, not a round count (spec 4.3), so how much a store holds
 * depends on what is in it. That is the property that makes a steel shot in P3 automatically
 * displace two wooden ones with no retuning.
 */
export class AmmoStore {
  public readonly capacity: number;
  private readonly rounds: Int32Array;
  private readonly ammo: AmmoTable;

  public constructor(capacity: number, ammo: AmmoTable) {
    this.capacity = capacity;
    this.ammo = ammo;
    this.rounds = new Int32Array(AMMO_LOAD_COUNT);
  }

  public countOf(load: AmmoLoadId): number {
    return this.rounds[load as number];
  }

  public get totalRounds(): number {
    let total = 0;
    for (let i = 0; i < this.rounds.length; i++) {
      total += this.rounds[i];
    }
    return total;
  }

  public get weight(): number {
    let total = 0;
    for (let i = 0; i < this.rounds.length; i++) {
      total += this.rounds[i] * this.ammo.shotWeight(i as AmmoLoadId);
    }
    return total;
  }

  public get freeWeight(): number {
    const free = this.capacity - this.weight;
    return free > 0 ? free : 0;
  }

  public get isEmpty(): boolean {
    return this.totalRounds === 0;
  }

  /** Rounds of `load` that would still fit. */
  public roomFor(load: AmmoLoadId): number {
    const unit = this.ammo.shotWeight(load);
    if (unit <= 0) {
      return 0;
    }
    return Math.floor(this.freeWeight / unit);
  }

  /** Adds up to `rounds`, returning how many actually fitted. */
  public add(load: AmmoLoadId, rounds: number): number {
    const accepted = Math.min(rounds, this.roomFor(load));
    if (accepted <= 0) {
      return 0;
    }
    this.rounds[load as number] += accepted;
    return accepted;
  }

  /** Removes up to `rounds`, returning how many were actually there. */
  public remove(load: AmmoLoadId, rounds: number): number {
    const available = this.rounds[load as number];
    const taken = rounds < available ? rounds : available;
    this.rounds[load as number] -= taken;
    return taken;
  }

  public fill(load: AmmoLoadId): number {
    return this.add(load, this.roomFor(load));
  }

  public clear(): void {
    for (let i = 0; i < this.rounds.length; i++) {
      this.rounds[i] = 0;
    }
  }
}
