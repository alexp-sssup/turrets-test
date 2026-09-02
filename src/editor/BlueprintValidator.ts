import { IVec3 } from "../core/IVec3";
import { Dials } from "../config/Dials";
import { AMMO_LOAD_COUNT, AmmoLoadId, AmmoTable } from "../materials/AmmoTable";
import { MaterialTable } from "../materials/MaterialTable";
import { WeaponClassId, WeaponTable } from "../materials/WeaponTable";
import { BlockKind } from "../blueprint/BlockKind";
import { Blueprint } from "../blueprint/Blueprint";
import { BudgetProvider } from "../blueprint/BudgetProvider";
import { AStar } from "../path/AStar";
import { Path } from "../path/Path";
import { WalkGraph } from "../path/WalkGraph";
import { BlockStructure } from "../structure/BlockStructure";
import { GravityLoadCase } from "../structure/LoadCase";
import { StructuralStatus } from "../structure/StructuralReport";
import { StructuralSolver } from "../structure/StructuralSolver";
import { SupportAnalysis } from "../structure/SupportAnalysis";
import { SupportSurface } from "../structure/SupportSurface";
import { FiringArc } from "./FiringArc";
import { GeometryReport } from "./GeometryReport";
import { StationReadout } from "./StationReadout";
import { ValidationReport } from "./ValidationReport";
import { Violation, ViolationKind } from "./Violation";

/**
 * Everything the editor checks before a blueprint may be built.
 *
 * The checks are deliberately the *same code* the runtime uses -- the same solver, the same
 * walk graph, the same pathfinder -- so a design that validates cannot then behave
 * differently in the arena. That is the whole content of the "readable solver" principle
 * (spec 4.3): the player learns the cost of a decision while making it, not afterwards.
 */
export class BlueprintValidator {
  private readonly materials: MaterialTable;
  private readonly ammo: AmmoTable;
  private readonly weapons: WeaponTable;
  private readonly dials: Dials;
  private readonly solver: StructuralSolver;
  /** Arc coverage below this counts as blocked even when the centre line is clear. */
  private readonly minimumArcFraction: number;

  public constructor(
    materials: MaterialTable,
    ammo: AmmoTable,
    weapons: WeaponTable,
    dials: Dials,
    solver: StructuralSolver,
    minimumArcFraction: number
  ) {
    this.materials = materials;
    this.ammo = ammo;
    this.weapons = weapons;
    this.dials = dials;
    this.solver = solver;
    this.minimumArcFraction = minimumArcFraction;
  }

  public static withDefaults(materials: MaterialTable, dials: Dials): BlueprintValidator {
    return new BlueprintValidator(
      materials,
      AmmoTable.defaults(materials),
      WeaponTable.defaults(dials.stationRackCapacity),
      dials,
      StructuralSolver.withDefaults(materials, dials),
      0.5
    );
  }

  public validate(
    blueprint: Blueprint,
    surface: SupportSurface,
    budget: BudgetProvider
  ): ValidationReport {
    const violations: Violation[] = [];
    const cost = blueprint.totalCost(this.materials);
    const allowance = budget.materialBudget();
    this.checkBudget(cost, allowance, violations);
    this.checkRequiredBlocks(blueprint, violations);

    const structure = new BlockStructure(blueprint);
    const joints = this.solver.buildJointGraph(structure, surface);
    const loadCase = new GravityLoadCase(this.materials, this.dials);
    const structural = this.solver.analyse(structure, joints, loadCase.build(structure));

    this.checkConnectivity(structural.floatingBlocks, violations);
    if (structural.status === StructuralStatus.Overloaded || structural.status === StructuralStatus.Unsupportable) {
      violations.push(
        new Violation(
          ViolationKind.StructurallyUnsound,
          -1,
          "load factor " + structural.loadFactor.toFixed(3)
        )
      );
    }
    if (structural.isTipping) {
      violations.push(
        new Violation(
          ViolationKind.Tipping,
          -1,
          "tipping margin " + structural.tippingMargin.toFixed(3)
        )
      );
    }

    const readouts = this.buildStationReadouts(structure, violations);
    return new ValidationReport(violations, readouts, structural, cost, allowance);
  }

  /**
   * Everything above except the linear program: the checks cheap enough to re-run on every
   * edit (UI spec 3.1). The violation order matches `validate` so the editor's panel does
   * not reshuffle when the debounced structural solve lands.
   */
  public validateGeometry(
    blueprint: Blueprint,
    surface: SupportSurface,
    budget: BudgetProvider
  ): GeometryReport {
    const violations: Violation[] = [];
    const cost = blueprint.totalCost(this.materials);
    const allowance = budget.materialBudget();
    this.checkBudget(cost, allowance, violations);
    this.checkRequiredBlocks(blueprint, violations);

    const structure = new BlockStructure(blueprint);
    const joints = this.solver.buildJointGraph(structure, surface);
    const floating = SupportAnalysis.floatingBlocks(structure, joints);
    this.checkConnectivity(floating, violations);

    const readouts = this.buildStationReadouts(structure, violations);
    return new GeometryReport(violations, readouts, cost, allowance, floating);
  }

  private checkBudget(cost: number, allowance: number, violations: Violation[]): void {
    if (cost > allowance) {
      violations.push(
        new Violation(
          ViolationKind.OverBudget,
          -1,
          cost.toString() + " of " + allowance.toString() + " material"
        )
      );
    }
  }

  private checkConnectivity(floating: readonly number[], violations: Violation[]): void {
    if (floating.length > 0) {
      violations.push(
        new Violation(
          ViolationKind.DisconnectedBlocks,
          floating[0],
          floating.length.toString() + " block(s) with no path to the pad"
        )
      );
    }
  }

  private checkRequiredBlocks(blueprint: Blueprint, violations: Violation[]): void {
    const cores = blueprint.countOfKind(BlockKind.Core);
    if (cores === 0) {
      violations.push(new Violation(ViolationKind.NoCoreBlock, -1, "the win condition needs one"));
    } else if (cores > 1) {
      violations.push(
        new Violation(ViolationKind.MultipleCoreBlocks, -1, cores.toString() + " cores")
      );
    }
    if (blueprint.countOfKind(BlockKind.Station) === 0) {
      violations.push(new Violation(ViolationKind.NoStation, -1, "firepower equals manned stations"));
    }
    if (blueprint.countOfKind(BlockKind.Depot) === 0) {
      violations.push(new Violation(ViolationKind.NoDepot, -1, "nothing to resupply from"));
    }
    if (blueprint.countOfKind(BlockKind.Hatch) === 0) {
      violations.push(new Violation(ViolationKind.NoHatch, -1, "crew cannot get in"));
    }
  }

  /**
   * Per-station geometry and logistics. Runs the real pathfinder against the real walk
   * graph, so the round-trip time shown here is the one the runner will actually pay.
   */
  private buildStationReadouts(structure: BlockStructure, violations: Violation[]): StationReadout[] {
    const graph = WalkGraph.build(structure);
    const pathfinder = new AStar(graph);
    const weapon = this.weapons.get(WeaponClassId.Gun);
    const stations = structure.aliveOfKind(BlockKind.Station);
    const hatchCells = this.accessCellsOfKind(structure, graph, BlockKind.Hatch);
    const depots = structure.aliveOfKind(BlockKind.Depot);

    const readouts: StationReadout[] = [];
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      const position = structure.positionOf(station);
      const facing = structure.blueprint.blockAt(station).facing;

      const arcFraction = FiringArc.clearFraction(
        structure,
        station,
        facing,
        weapon.arcHalfAngle,
        weapon.range
      );
      const centreClear = FiringArc.isCentreClear(structure, station, facing, weapon.range);
      if (!centreClear || arcFraction < this.minimumArcFraction) {
        violations.push(
          new Violation(
            ViolationKind.StationArcBlocked,
            station,
            (arcFraction * 100).toFixed(0) + "% of the arc is clear"
          )
        );
      }

      const crewCells = graph.accessCells(position);
      const crewCell = crewCells.length > 0 ? crewCells[0] : null;
      if (crewCell === null) {
        violations.push(
          new Violation(ViolationKind.StationNoCrewSpace, station, "no standable cell adjacent")
        );
        readouts.push(
          new StationReadout(
            station,
            position,
            arcFraction,
            centreClear,
            null,
            null,
            null,
            -1,
            Number.POSITIVE_INFINITY,
            new Int32Array(AMMO_LOAD_COUNT)
          )
        );
        continue;
      }

      const hatchPath = hatchCells.length > 0 ? pathfinder.findPathToAny(crewCell, hatchCells) : null;
      if (hatchPath === null) {
        violations.push(
          new Violation(ViolationKind.StationNoHatchPath, station, "hatch access is not traversable")
        );
      }

      let depotPath: Path | null = null;
      let nearestDepot = -1;
      for (let d = 0; d < depots.length; d++) {
        const cells = graph.accessCells(structure.positionOf(depots[d]));
        if (cells.length === 0) {
          continue;
        }
        const candidate = pathfinder.findPathToAny(crewCell, cells);
        if (candidate === null) {
          continue;
        }
        if (depotPath === null || candidate.stepCount < depotPath.stepCount) {
          depotPath = candidate;
          nearestDepot = depots[d];
        }
      }
      if (depotPath === null) {
        violations.push(
          new Violation(
            ViolationKind.StationNoDepotPath,
            station,
            "it will fire its rack dry and fall silent"
          )
        );
      }

      const roundTrip =
        depotPath === null
          ? Number.POSITIVE_INFINITY
          : depotPath.roundTripDuration(this.dials.crewWalkSpeed) + 2 * this.dials.handlingSeconds;
      const rounds = new Int32Array(AMMO_LOAD_COUNT);
      for (let load = 0; load < AMMO_LOAD_COUNT; load++) {
        rounds[load] = this.ammo.roundsPerTrip(load as AmmoLoadId, this.dials.crewCarryCapacity);
      }

      readouts.push(
        new StationReadout(
          station,
          position,
          arcFraction,
          centreClear,
          crewCell,
          hatchPath,
          depotPath,
          nearestDepot,
          roundTrip,
          rounds
        )
      );
    }
    return readouts;
  }

  private accessCellsOfKind(
    structure: BlockStructure,
    graph: WalkGraph,
    kind: BlockKind
  ): IVec3[] {
    const cells: IVec3[] = [];
    const blocks = structure.aliveOfKind(kind);
    for (let i = 0; i < blocks.length; i++) {
      const position = structure.positionOf(blocks[i]);
      if (graph.isStandable(position)) {
        cells.push(position);
      }
      const adjacent = graph.accessCells(position);
      for (let k = 0; k < adjacent.length; k++) {
        cells.push(adjacent[k]);
      }
    }
    return cells;
  }
}
