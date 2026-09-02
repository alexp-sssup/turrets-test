/**
 * A bounded window of measurements, with the percentile the performance targets are
 * written against (UI spec 6: "solver re-solve p95 under 16 ms").
 *
 * Bounded because a tester session is open for as long as it is interesting and an
 * unbounded array of frame timings would outgrow the frames themselves. The window keeps
 * the last few hundred samples, which is what "p95 right now" means to somebody watching
 * the dev readout.
 */
export class SampleSet {
  private readonly capacity: number;
  private values: number[];
  private countValue: number;
  private maxValue: number;
  private sum: number;

  public constructor(capacity: number) {
    this.capacity = capacity;
    this.values = [];
    this.countValue = 0;
    this.maxValue = 0;
    this.sum = 0;
  }

  public push(value: number): void {
    this.values.push(value);
    if (this.values.length > this.capacity) {
      this.values.shift();
    }
    this.countValue++;
    this.sum += value;
    if (value > this.maxValue) {
      this.maxValue = value;
    }
  }

  public get count(): number {
    return this.countValue;
  }

  public get max(): number {
    return this.maxValue;
  }

  public get mean(): number {
    return this.countValue > 0 ? this.sum / this.countValue : 0;
  }

  public percentile(fraction: number): number {
    if (this.values.length === 0) {
      return 0;
    }
    const sorted: number[] = [];
    for (let i = 0; i < this.values.length; i++) {
      sorted.push(this.values[i]);
    }
    sorted.sort((a: number, b: number): number => a - b);
    let index = Math.floor(sorted.length * fraction);
    if (index >= sorted.length) {
      index = sorted.length - 1;
    }
    return sorted[index];
  }

  public get p95(): number {
    return this.percentile(0.95);
  }

  public get latest(): number {
    return this.values.length === 0 ? 0 : this.values[this.values.length - 1];
  }
}
