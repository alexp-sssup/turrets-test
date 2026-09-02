import { AttackerKindId } from "./AttackerKind";

/** One unit entering the lane at a fixed time. */
export class SpawnOrder {
  public readonly timeSeconds: number;
  public readonly kind: AttackerKindId;
  /** Lane the unit walks, as an x coordinate. */
  public readonly laneX: number;

  public constructor(timeSeconds: number, kind: AttackerKindId, laneX: number) {
    this.timeSeconds = timeSeconds;
    this.kind = kind;
    this.laneX = laneX;
  }
}

/** One wave: an ordered spawn list and a length. */
export class Wave {
  public readonly index: number;
  public readonly title: string;
  public readonly durationSeconds: number;
  private readonly orders: readonly SpawnOrder[];

  public constructor(
    index: number,
    title: string,
    durationSeconds: number,
    orders: readonly SpawnOrder[]
  ) {
    this.index = index;
    this.title = title;
    this.durationSeconds = durationSeconds;
    this.orders = orders;
  }

  public get spawnCount(): number {
    return this.orders.length;
  }

  public spawnAt(index: number): SpawnOrder {
    return this.orders[index];
  }
}

/**
 * Spec 4.5: "five scripted waves down one lane. The script is fixed and identical on every
 * run." Escalating along the two verbs so both materials get tested.
 *
 * A wave ends when its units are dead or its duration runs out; survivors withdraw. That
 * bound is a P0 simplification -- it keeps a run finite without an economy or a retreat
 * rule -- and it is why the run loop never needs a timeout of its own.
 */
export class WaveScript {
  private readonly waves: readonly Wave[];

  public constructor(waves: readonly Wave[]) {
    this.waves = waves;
  }

  public get waveCount(): number {
    return this.waves.length;
  }

  public waveAt(index: number): Wave {
    return this.waves[index];
  }

  /** The P0 script. `centreX` is the middle of the approach. */
  public static p0(centreX: number): WaveScript {
    const left = centreX - 1;
    const right = centreX + 1;
    return new WaveScript([
      // 1. Light kinetic, single approach -- teaches arcs.
      new Wave(0, "light kinetic, single approach", 60, [
        new SpawnOrder(0, AttackerKindId.LightKinetic, centreX),
        new SpawnOrder(6, AttackerKindId.LightKinetic, centreX),
        new SpawnOrder(12, AttackerKindId.LightKinetic, centreX),
      ]),
      // 2. Light kinetic, two approaches -- teaches coverage.
      new Wave(1, "light kinetic, two approaches", 70, [
        new SpawnOrder(0, AttackerKindId.LightKinetic, left),
        new SpawnOrder(0, AttackerKindId.LightKinetic, right),
        new SpawnOrder(8, AttackerKindId.LightKinetic, left),
        new SpawnOrder(8, AttackerKindId.LightKinetic, right),
      ]),
      // 3. Incendiary -- punishes contiguous wood.
      new Wave(2, "incendiary", 80, [
        new SpawnOrder(0, AttackerKindId.Incendiary, left),
        new SpawnOrder(0, AttackerKindId.Incendiary, right),
        new SpawnOrder(10, AttackerKindId.Incendiary, centreX),
        new SpawnOrder(18, AttackerKindId.Incendiary, centreX),
      ]),
      // 4. Heavy kinetic, concentrated on one face -- punishes brittle stone and
      //    unbraced frames.
      new Wave(3, "heavy kinetic, one face", 90, [
        new SpawnOrder(0, AttackerKindId.HeavyKinetic, centreX),
        new SpawnOrder(10, AttackerKindId.HeavyKinetic, centreX),
        new SpawnOrder(20, AttackerKindId.HeavyKinetic, centreX),
      ]),
      // 5. Mixed, sustained -- punishes depot placement and crew redundancy.
      new Wave(4, "mixed, sustained", 120, [
        new SpawnOrder(0, AttackerKindId.LightKinetic, left),
        new SpawnOrder(0, AttackerKindId.HeavyKinetic, centreX),
        new SpawnOrder(8, AttackerKindId.Incendiary, right),
        new SpawnOrder(16, AttackerKindId.LightKinetic, right),
        new SpawnOrder(24, AttackerKindId.HeavyKinetic, centreX),
        new SpawnOrder(32, AttackerKindId.Incendiary, left),
        new SpawnOrder(40, AttackerKindId.LightKinetic, centreX),
      ]),
    ]);
  }
}
