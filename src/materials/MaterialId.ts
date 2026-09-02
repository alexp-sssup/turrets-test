/**
 * Spec 4.1: two raw materials in P0, chosen because they differ in *kind* along the two
 * axes P0 tests -- structural behaviour and fire. Coal, ceramic, iron and steel are four
 * more enumerators plus four more table rows (spec 6); no other code changes.
 */
export enum MaterialId {
  Wood = 0,
  Stone = 1,
}

export const MATERIAL_COUNT: number = 2;

/** How a block comes apart. Read by the kinetic verb, not by the solver. */
export enum FractureBehaviour {
  /** Absorbs damage progressively; a hit degrades the joints around it. */
  Ductile = 0,
  /** Fails all at once under concentrated impact, and takes neighbours with it. */
  Brittle = 1,
}
