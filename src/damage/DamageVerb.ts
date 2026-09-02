import { BlockStructure } from "../structure/BlockStructure";
import { DamageVerbId } from "../materials/DamageVerbId";
import { DamageResult } from "./DamageResult";
import { Impact } from "./Impact";

/**
 * Spec 6's one interface. Shrapnel, explosive and corrosive are three more
 * implementations, and because joints rather than blocks are the unit of degradation,
 * corrosive already has somewhere to put its effect.
 *
 * A verb mutates the structure and reports what it did. It never touches the solver, the
 * crew or the fire simulation -- the caller routes those consequences.
 */
export interface DamageVerb {
  readonly id: DamageVerbId;
  apply(structure: BlockStructure, impact: Impact): DamageResult;
}
