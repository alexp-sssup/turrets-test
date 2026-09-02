import { Dials } from "../config/Dials";
import { AmmoTable } from "../materials/AmmoTable";
import { MaterialTable } from "../materials/MaterialTable";
import { WeaponTable } from "../materials/WeaponTable";
import { Blueprint } from "../blueprint/Blueprint";
import { Arena } from "./Arena";
import { AttackerController } from "./AttackerController";
import { AttackerTable } from "./AttackerKind";
import { InputSource } from "./InputSource";
import { RunLoop } from "./RunLoop";
import { RunResult } from "./RunResult";
import { WaveScript } from "./WaveScript";

/**
 * Five waves down one lane, fixed timestep, no wall clock and no entropy beyond the seed
 * (spec 4.5).
 *
 * Stateless and reusable: all the state of an attempt lives in the `RunLoop` this hands
 * out. `run` is the headless entry point -- build a loop and drain it -- and `begin` is the
 * one a renderer uses, because a UI owns the frame clock and needs to step the simulation
 * itself.
 */
export class RunSimulation {
  private readonly materials: MaterialTable;
  private readonly ammo: AmmoTable;
  private readonly weapons: WeaponTable;
  private readonly attackers: AttackerTable;
  private readonly dials: Dials;
  private readonly arena: Arena;

  public constructor(
    materials: MaterialTable,
    ammo: AmmoTable,
    weapons: WeaponTable,
    attackers: AttackerTable,
    dials: Dials,
    arena: Arena
  ) {
    this.materials = materials;
    this.ammo = ammo;
    this.weapons = weapons;
    this.attackers = attackers;
    this.dials = dials;
    this.arena = arena;
  }

  public static withDefaults(dials: Dials, arena: Arena): RunSimulation {
    const materials = MaterialTable.defaults();
    return new RunSimulation(
      materials,
      AmmoTable.defaults(materials),
      WeaponTable.defaults(dials.stationRackCapacity),
      AttackerTable.defaults(),
      dials,
      arena
    );
  }

  /** An attempt the caller steps itself. */
  public begin(
    blueprint: Blueprint,
    controller: AttackerController,
    script: WaveScript,
    inputs: InputSource,
    seed: number
  ): RunLoop {
    return new RunLoop(
      this.materials,
      this.ammo,
      this.weapons,
      this.attackers,
      this.dials,
      this.arena,
      blueprint,
      seed,
      controller,
      script,
      inputs
    );
  }

  public run(
    blueprint: Blueprint,
    controller: AttackerController,
    script: WaveScript,
    inputs: InputSource,
    seed: number
  ): RunResult {
    return this.begin(blueprint, controller, script, inputs, seed).runToCompletion();
  }
}
