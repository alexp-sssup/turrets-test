import { BlockStructure } from "./BlockStructure";
import { StructuralReport } from "./StructuralReport";

/**
 * Memoises the last analysis against the structure's version stamp and a caller-supplied
 * stamp for the loading case.
 *
 * Spec 1.1 wants soundness to re-evaluate "under live damage at interactive rates". Most
 * frames change neither the structure nor the load, and a re-solve on those frames is pure
 * waste, so this is the first line of defence -- and the seam where an incremental
 * (warm-started) solve would go if the full re-solve ever stops being fast enough.
 */
export class StructuralAnalysisCache {
  private structureVersion: number = -1;
  private loadStamp: number = -1;
  private cached: StructuralReport | null = null;
  private hitCount: number = 0;
  private missCount: number = 0;

  /** The stored report for this exact (structure, load) pair, or null. */
  public lookup(structure: BlockStructure, loadStamp: number): StructuralReport | null {
    if (
      this.cached !== null &&
      this.structureVersion === structure.version &&
      this.loadStamp === loadStamp
    ) {
      this.hitCount++;
      return this.cached;
    }
    this.missCount++;
    return null;
  }

  public store(structure: BlockStructure, loadStamp: number, report: StructuralReport): void {
    this.structureVersion = structure.version;
    this.loadStamp = loadStamp;
    this.cached = report;
  }

  public invalidate(): void {
    this.cached = null;
    this.structureVersion = -1;
    this.loadStamp = -1;
  }

  public get hits(): number {
    return this.hitCount;
  }

  public get misses(): number {
    return this.missCount;
  }
}
