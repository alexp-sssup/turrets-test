import { MATERIAL_COUNT, MaterialId } from "../materials/MaterialId";
import { Palette } from "./Palette";
import { ViewFacing } from "./ViewFacing";

/**
 * Every face fill the base composition can need, precomputed (isometric renderer spec 8).
 *
 * A voxel's fill is a function of three small things -- its material, which of the three
 * camera-facing faces this is, and how damaged it is -- and two of those are already
 * quantised. So the whole product is a fixed-size table built once, and a frame looks a
 * colour up instead of building one.
 *
 * It used to be four: a section's distance behind the reach plane dimmed it. Nothing is
 * behind anything now (no-sections spec 3), so the table is a fifth of the size it was.
 *
 * That is what "no per-cell allocation" means in a canvas renderer: the fills are strings,
 * and strings a frame does not build are strings a frame does not collect. Damage is the one
 * continuous input, and it is quantised to eighths here rather than being allowed to mint a
 * colour per cell per tick.
 */
export class FacePalette {
  public static readonly DAMAGE_STEPS: number = 8;
  /** How far damage darkens a face at full damage. */
  public static readonly DAMAGE_SHADE: number = 0.55;

  private readonly facing: ViewFacing;
  private readonly fills: readonly string[];

  public constructor(facing: ViewFacing) {
    this.facing = facing;
    const fills: string[] = [];
    for (let material = 0; material < MATERIAL_COUNT; material++) {
      for (let face = 0; face < facing.count; face++) {
        for (let damage = 0; damage <= FacePalette.DAMAGE_STEPS; damage++) {
          const shade =
            facing.at(face).shade -
            (FacePalette.DAMAGE_SHADE * damage) / FacePalette.DAMAGE_STEPS;
          fills.push(Palette.faceFill(material as MaterialId, shade));
        }
      }
    }
    this.fills = fills;
  }

  /** `damage` is a fraction; it is quantised on the way in. */
  public fill(material: MaterialId, face: number, damage: number): string {
    let step = Math.round(damage * FacePalette.DAMAGE_STEPS);
    if (step < 0) {
      step = 0;
    }
    if (step > FacePalette.DAMAGE_STEPS) {
      step = FacePalette.DAMAGE_STEPS;
    }
    const perFace = FacePalette.DAMAGE_STEPS + 1;
    const perMaterial = this.facing.count * perFace;
    return this.fills[(material as number) * perMaterial + face * perFace + step];
  }
}
