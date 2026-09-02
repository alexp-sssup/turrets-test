import { Direction, Directions } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { Dials } from "../config/Dials";
import { AmmoTable } from "../materials/AmmoTable";
import { DAMAGE_VERB_COUNT, DamageVerbId } from "../materials/DamageVerbId";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockKind } from "../blueprint/BlockKind";
import { BlockStructure } from "../structure/BlockStructure";
import { DamageResult } from "./DamageResult";
import { DamageVerb } from "./DamageVerb";
import { FireSimulation } from "./FireSimulation";
import { Impact } from "./Impact";
import { IncendiaryVerb } from "./IncendiaryVerb";
import { KineticVerb } from "./KineticVerb";

/**
 * Routes an impact to its verb and then deals with the consequences that are not a verb's
 * business: depot cook-off (spec 4.3: depots "detonate when penetrated") and handing
 * ignitions to the fire simulation.
 *
 * Verbs are held in an array indexed by `DamageVerbId`, so adding explosive or corrosive is
 * one row and one class.
 */
export class DamageSystem {
  private readonly verbs: readonly (DamageVerb | null)[];
  private readonly materials: MaterialTable;
  private readonly ammo: AmmoTable;
  private readonly fire: FireSimulation;
  /** Blocks within this range of a cooking depot are destroyed outright. */
  private readonly blastRadius: number;
  /** Damage the blast does to blocks just outside that. */
  private readonly blastDamage: number;

  public constructor(
    verbs: readonly (DamageVerb | null)[],
    materials: MaterialTable,
    ammo: AmmoTable,
    fire: FireSimulation,
    blastRadius: number,
    blastDamage: number
  ) {
    if (verbs.length !== DAMAGE_VERB_COUNT) {
      throw new Error("DamageSystem needs one slot per DamageVerbId");
    }
    this.verbs = verbs;
    this.materials = materials;
    this.ammo = ammo;
    this.fire = fire;
    this.blastRadius = blastRadius;
    this.blastDamage = blastDamage;
  }

  public static withDefaults(
    materials: MaterialTable,
    ammo: AmmoTable,
    fire: FireSimulation,
    dials: Dials
  ): DamageSystem {
    const verbs: (DamageVerb | null)[] = [];
    for (let i = 0; i < DAMAGE_VERB_COUNT; i++) {
      verbs.push(null);
    }
    verbs[DamageVerbId.Kinetic as number] = KineticVerb.withDefaults(materials);
    verbs[DamageVerbId.Incendiary as number] = IncendiaryVerb.withDefaults(materials);
    return new DamageSystem(verbs, materials, ammo, fire, 1, 20);
  }

  public verbFor(id: DamageVerbId): DamageVerb {
    const verb = this.verbs[id as number];
    if (verb === null) {
      throw new Error("DamageSystem has no verb for id " + (id as number).toString());
    }
    return verb;
  }

  /**
   * Applies one round and everything it sets off. Ignitions are started here so that a
   * caller cannot forget to, and cook-off cascades (a depot taking out the depot next to
   * it) resolve before returning.
   */
  public applyImpact(structure: BlockStructure, impact: Impact): DamageResult {
    const verb = this.verbFor(this.ammo.get(impact.load).verb);
    const result = verb.apply(structure, impact);

    // Index-based queue rather than shifting the array, so the cascade is a plain
    // breadth-first walk with no allocation per step.
    const pending: number[] = [];
    for (let i = 0; i < result.detonatedDepots.length; i++) {
      pending.push(result.detonatedDepots[i]);
    }
    const seen = new Map<number, boolean>();
    let head = 0;
    while (head < pending.length) {
      const depot = pending[head];
      head++;
      if (seen.has(depot)) {
        continue;
      }
      seen.set(depot, true);
      const blast = this.detonate(structure, depot);
      result.absorb(blast);
      for (let i = 0; i < blast.detonatedDepots.length; i++) {
        pending.push(blast.detonatedDepots[i]);
      }
    }

    const ignitions = result.ignitions;
    for (let i = 0; i < ignitions.length; i++) {
      this.fire.ignite(structure, ignitions[i]);
    }
    this.fire.prune(structure);
    return result;
  }

  /**
   * Spec 4.3: "one central depot is cheap and one penetration away from ending the run".
   * This is that sentence.
   */
  private detonate(structure: BlockStructure, depot: number): DamageResult {
    const result = new DamageResult();
    const centre = structure.positionOf(depot);
    const reach = this.blastRadius + 1;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dz = -reach; dz <= reach; dz++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const distance =
            (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy) + (dz < 0 ? -dz : dz);
          if (distance === 0 || distance > reach) {
            continue;
          }
          const block = structure.indexAt(centre.add(new IVec3(dx, dy, dz)));
          if (block < 0) {
            continue;
          }
          if (distance <= this.blastRadius) {
            structure.destroy(block);
            result.addDestroyed(block);
            if (structure.kindOf(block) === BlockKind.Depot) {
              result.addDetonation(block);
            }
          } else if (structure.applyDamage(block, this.blastDamage, this.materials)) {
            result.addDestroyed(block);
            if (structure.kindOf(block) === BlockKind.Depot) {
              result.addDetonation(block);
            }
          }
        }
      }
    }
    // A cooking depot also throws fire around, so wood near it catches.
    const position = structure.positionOf(depot);
    for (let d = 0; d < 6; d++) {
      const neighbour = structure.indexAt(position.add(Directions.offset(d as Direction)));
      if (neighbour >= 0 && this.materials.get(structure.materialOf(neighbour)).isFlammable) {
        result.addIgnition(neighbour);
      }
    }
    return result;
  }
}
