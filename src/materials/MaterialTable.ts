import { FractureBehaviour, MATERIAL_COUNT, MaterialId } from "./MaterialId";
import { MaterialProperties } from "./MaterialProperties";

/**
 * The material table. Indexed by `MaterialId`, so lookup is an array access and adding a
 * material is appending a row.
 *
 * The P0 numbers are set so the two materials fail differently at legible sizes:
 *
 * * A wood cantilever runs out of bending capacity at about five voxels, well before it
 *   runs out of shear -- so unbraced arms sag and shear at the root, which is the failure
 *   the replay is supposed to be able to narrate.
 * * Stone has *zero* tension capacity. Combined with the solver's moment rule
 *   (`|M| <= (N + tensionCap * A) * lever`) that means a stone joint's bending capacity is
 *   whatever compression is already sitting on it: stone cantilevers not at all, stone
 *   arches carry real load. "Compression only" is therefore a table row, not a rule.
 * * Stone is three times as dense as wood, which is also what makes a stone shot weigh
 *   three and a firepot one (spec 4.3).
 */
export class MaterialTable {
  private readonly rows: readonly MaterialProperties[];

  public constructor(rows: readonly MaterialProperties[]) {
    if (rows.length !== MATERIAL_COUNT) {
      throw new Error("MaterialTable needs one row per MaterialId");
    }
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i].id as number) !== i) {
        throw new Error("MaterialTable rows must be ordered by MaterialId");
      }
    }
    this.rows = rows;
  }

  public static defaults(): MaterialTable {
    return new MaterialTable([
      new MaterialProperties(
        MaterialId.Wood,
        "wood",
        1, // cost per voxel
        0.5, // density -- light
        120, // tension: tolerates being pulled
        160, // compression
        80, // shear
        60, // torsion
        1, // flammability: burns, and propagates to contiguous wood
        FractureBehaviour.Ductile,
        10, // integrity
        6 // burn duration, seconds
      ),
      new MaterialProperties(
        MaterialId.Stone,
        "stone",
        3, // cost per voxel
        1.5, // density -- heavy
        0, // tension: none at all, this is what "compression only" means
        800, // compression
        200, // shear
        100, // torsion
        0, // flammability: inert
        FractureBehaviour.Brittle,
        30, // integrity
        0 // never burns
      ),
    ]);
  }

  public get(material: MaterialId): MaterialProperties {
    return this.rows[material as number];
  }

  public get count(): number {
    return this.rows.length;
  }

  /** Weight of one voxel of the material under the given gravity. */
  public voxelWeight(material: MaterialId, gravity: number, voxelSize: number): number {
    const volume = voxelSize * voxelSize * voxelSize;
    return this.get(material).density * volume * gravity;
  }
}
