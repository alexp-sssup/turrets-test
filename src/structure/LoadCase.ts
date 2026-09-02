import { Dials } from "../config/Dials";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockStructure } from "./BlockStructure";
import { LoadSet } from "./LoadSet";

/**
 * A loading case that can be rebuilt for a changed structure.
 *
 * Collapse resolution destroys blocks between solves, so the loads have to be recomputed
 * rather than carried: an arm that has fallen off no longer weighs anything. Making this an
 * interface is also the seam recoil arrives through -- `sim/WeaponSystem` supplies a case
 * that adds a per-shot impulse at each firing station (spec 7) and the solver never learns
 * that weapons exist.
 */
export interface LoadCase {
  build(structure: BlockStructure): LoadSet;
  /**
   * Value that changes whenever the case would produce different loads. Used as a cache
   * key alongside the structure version; must not depend on wall-clock time.
   */
  stamp(): number;
}

/** Self weight only. The case the editor shows and the baseline for everything else. */
export class GravityLoadCase implements LoadCase {
  private readonly materials: MaterialTable;
  private readonly dials: Dials;

  public constructor(materials: MaterialTable, dials: Dials) {
    this.materials = materials;
    this.dials = dials;
  }

  public build(structure: BlockStructure): LoadSet {
    return LoadSet.gravity(structure, this.materials, this.dials.gravity, this.dials.voxelSize);
  }

  public stamp(): number {
    return 0;
  }
}
