import { FractureBehaviour, MaterialId } from "./MaterialId";

/**
 * One row of the material table (spec 6: "materials are a table row, not code").
 *
 * Capacities are stresses -- force per unit of joint area -- so a joint's capacity is the
 * product of the stress and the shared face area. The solver reads only the four capacity
 * fields and `density`; everything else is read by damage or by cost.
 */
export class MaterialProperties {
  public readonly id: MaterialId;
  public readonly name: string;
  /** Spec 4.1 cost per voxel: wood 1, stone 3. */
  public readonly costPerVoxel: number;
  /** Mass per unit volume. Also gives shot weight (spec 6). */
  public readonly density: number;
  /** Stress the joint carries in pull-apart. Stone's is zero: "compression only". */
  public readonly tensionCapacity: number;
  public readonly compressionCapacity: number;
  public readonly shearCapacity: number;
  public readonly torsionCapacity: number;
  /** 0 = inert, 1 = ignites readily. Drives fire propagation (spec 4.5 wave 3). */
  public readonly flammability: number;
  public readonly fractureBehaviour: FractureBehaviour;
  /** Kinetic damage a block absorbs before it is destroyed. */
  public readonly integrity: number;
  /** Seconds a burning block survives before it is consumed. */
  public readonly burnDurationSeconds: number;

  public constructor(
    id: MaterialId,
    name: string,
    costPerVoxel: number,
    density: number,
    tensionCapacity: number,
    compressionCapacity: number,
    shearCapacity: number,
    torsionCapacity: number,
    flammability: number,
    fractureBehaviour: FractureBehaviour,
    integrity: number,
    burnDurationSeconds: number
  ) {
    this.id = id;
    this.name = name;
    this.costPerVoxel = costPerVoxel;
    this.density = density;
    this.tensionCapacity = tensionCapacity;
    this.compressionCapacity = compressionCapacity;
    this.shearCapacity = shearCapacity;
    this.torsionCapacity = torsionCapacity;
    this.flammability = flammability;
    this.fractureBehaviour = fractureBehaviour;
    this.integrity = integrity;
    this.burnDurationSeconds = burnDurationSeconds;
  }

  public get isFlammable(): boolean {
    return this.flammability > 0;
  }
}
