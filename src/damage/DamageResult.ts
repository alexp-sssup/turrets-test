/** A joint whose remaining capacity was multiplied by `factor`. */
export class JointDegradation {
  public readonly blockLow: number;
  public readonly blockHigh: number;
  public readonly factor: number;

  public constructor(blockLow: number, blockHigh: number, factor: number) {
    this.blockLow = blockLow;
    this.blockHigh = blockHigh;
    this.factor = factor;
  }
}

/**
 * Spec 6: "damage verbs implement one interface against the block/joint API:
 * `apply(impact, blockSet)` -> `{destroyed blocks, degraded joints, ignitions}`". This is
 * that return type, plus depot cook-off, which is a consequence rather than a verb.
 */
export class DamageResult {
  private readonly destroyed: number[];
  private readonly degraded: JointDegradation[];
  private readonly ignited: number[];
  private readonly detonated: number[];

  public constructor() {
    this.destroyed = [];
    this.degraded = [];
    this.ignited = [];
    this.detonated = [];
  }

  public get destroyedBlocks(): readonly number[] {
    return this.destroyed;
  }

  public get degradedJoints(): readonly JointDegradation[] {
    return this.degraded;
  }

  public get ignitions(): readonly number[] {
    return this.ignited;
  }

  public get detonatedDepots(): readonly number[] {
    return this.detonated;
  }

  public addDestroyed(block: number): void {
    this.destroyed.push(block);
  }

  public addDegradation(blockLow: number, blockHigh: number, factor: number): void {
    this.degraded.push(new JointDegradation(blockLow, blockHigh, factor));
  }

  public addIgnition(block: number): void {
    for (let i = 0; i < this.ignited.length; i++) {
      if (this.ignited[i] === block) {
        return;
      }
    }
    this.ignited.push(block);
  }

  public addDetonation(block: number): void {
    this.detonated.push(block);
  }

  public absorb(other: DamageResult): void {
    for (let i = 0; i < other.destroyed.length; i++) {
      this.destroyed.push(other.destroyed[i]);
    }
    for (let i = 0; i < other.degraded.length; i++) {
      this.degraded.push(other.degraded[i]);
    }
    for (let i = 0; i < other.ignited.length; i++) {
      this.addIgnition(other.ignited[i]);
    }
    for (let i = 0; i < other.detonated.length; i++) {
      this.detonated.push(other.detonated[i]);
    }
  }

  public get isEmpty(): boolean {
    return (
      this.destroyed.length === 0 &&
      this.degraded.length === 0 &&
      this.ignited.length === 0 &&
      this.detonated.length === 0
    );
  }
}
