/** What one entry in the draw list is (isometric renderer spec 4). */
export enum DrawKind {
  Voxel = 0,
  Shadow = 1,
  Attacker = 2,
  Crew = 3,
  Projectile = 4,
}

/**
 * The base composition's back-to-front pass, as one sorted list (isometric renderer spec 4).
 *
 * Every item -- a voxel, an actor, a projectile, a contact shadow -- carries a depth key,
 * `p + y - r`, which is the world position dotted with the direction toward the camera. The
 * list draws in ascending key, which is the exact view-ray order: no depth buffer, no
 * per-fragment work, and no special case for the actors, which is what puts a runner behind
 * the wall they walk behind.
 *
 * Items with equal keys lie in one plane perpendicular to the view direction, where unit
 * cubes meet edge-to-edge and never overlap, so any tie order is correct. Ties are broken
 * anyway -- x, then y, then z, then kind -- because two runs of the same replay must produce
 * the same pixels.
 *
 * Storage is parallel typed arrays, grown only when a frame needs more than the last one
 * did, and sorted through an index permutation with a heapsort. Nothing here allocates per
 * cell (spec 8), and nothing here recurses.
 */
export class DrawList {
  private keys: Float64Array;
  private kinds: Int32Array;
  private payloads: Int32Array;
  private xs: Float64Array;
  private ys: Float64Array;
  private zs: Float64Array;
  private order: Int32Array;
  private used: number;

  public constructor(capacity: number) {
    const size = capacity < 64 ? 64 : capacity;
    this.keys = new Float64Array(size);
    this.kinds = new Int32Array(size);
    this.payloads = new Int32Array(size);
    this.xs = new Float64Array(size);
    this.ys = new Float64Array(size);
    this.zs = new Float64Array(size);
    this.order = new Int32Array(size);
    this.used = 0;
  }

  public get count(): number {
    return this.used;
  }

  public get capacity(): number {
    return this.keys.length;
  }

  public clear(): void {
    this.used = 0;
  }

  /** `payload` is a block index, an actor index or a projectile index, by kind. */
  public add(kind: DrawKind, payload: number, x: number, y: number, z: number, key: number): void {
    if (this.used === this.keys.length) {
      this.grow();
    }
    const at = this.used;
    this.keys[at] = key;
    this.kinds[at] = kind as number;
    this.payloads[at] = payload;
    this.xs[at] = x;
    this.ys[at] = y;
    this.zs[at] = z;
    this.used = at + 1;
  }

  private grow(): void {
    const size = this.keys.length * 2;
    const keys = new Float64Array(size);
    keys.set(this.keys);
    const kinds = new Int32Array(size);
    kinds.set(this.kinds);
    const payloads = new Int32Array(size);
    payloads.set(this.payloads);
    const xs = new Float64Array(size);
    xs.set(this.xs);
    const ys = new Float64Array(size);
    ys.set(this.ys);
    const zs = new Float64Array(size);
    zs.set(this.zs);
    this.keys = keys;
    this.kinds = kinds;
    this.payloads = payloads;
    this.xs = xs;
    this.ys = ys;
    this.zs = zs;
    this.order = new Int32Array(size);
  }

  /** Back to front. Call once, after the last `add`. */
  public sort(): void {
    for (let i = 0; i < this.used; i++) {
      this.order[i] = i;
    }
    const n = this.used;
    for (let start = (n >> 1) - 1; start >= 0; start--) {
      this.siftDown(start, n);
    }
    for (let end = n - 1; end > 0; end--) {
      const top = this.order[0];
      this.order[0] = this.order[end];
      this.order[end] = top;
      this.siftDown(0, end);
    }
  }

  private siftDown(root: number, length: number): void {
    let parent = root;
    for (;;) {
      let child = parent * 2 + 1;
      if (child >= length) {
        return;
      }
      if (child + 1 < length && this.precedes(this.order[child], this.order[child + 1])) {
        child += 1;
      }
      if (!this.precedes(this.order[parent], this.order[child])) {
        return;
      }
      const swap = this.order[parent];
      this.order[parent] = this.order[child];
      this.order[child] = swap;
      parent = child;
    }
  }

  /** The total order of spec 4: key, then x, then y, then z, then kind. */
  private precedes(a: number, b: number): boolean {
    if (this.keys[a] !== this.keys[b]) {
      return this.keys[a] < this.keys[b];
    }
    if (this.xs[a] !== this.xs[b]) {
      return this.xs[a] < this.xs[b];
    }
    if (this.ys[a] !== this.ys[b]) {
      return this.ys[a] < this.ys[b];
    }
    if (this.zs[a] !== this.zs[b]) {
      return this.zs[a] < this.zs[b];
    }
    return this.kinds[a] < this.kinds[b];
  }

  /** The slot drawn `position` from the back. */
  public slotAt(position: number): number {
    return this.order[position];
  }

  public kindOf(slot: number): DrawKind {
    return this.kinds[slot] as DrawKind;
  }

  public payloadOf(slot: number): number {
    return this.payloads[slot];
  }

  public xOf(slot: number): number {
    return this.xs[slot];
  }

  public yOf(slot: number): number {
    return this.ys[slot];
  }

  public zOf(slot: number): number {
    return this.zs[slot];
  }

  public keyOf(slot: number): number {
    return this.keys[slot];
  }
}
