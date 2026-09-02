/**
 * Spec: two damage verbs in P0. Explosive, shrapnel and corrosive are three more
 * enumerators and three more `DamageVerb` implementations (spec 6).
 */
export enum DamageVerbId {
  /** Deep, narrow penetration. */
  Kinetic = 0,
  /** Ignites flammables, propagates along contiguous ones, flows downward first. */
  Incendiary = 1,
}

export const DAMAGE_VERB_COUNT: number = 2;
