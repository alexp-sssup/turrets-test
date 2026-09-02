import { Dials } from "../config/Dials";
import { Direction } from "../core/Direction";
import { IVec3 } from "../core/IVec3";
import { MaterialId } from "../materials/MaterialId";
import { MaterialTable } from "../materials/MaterialTable";
import { BlockKind } from "../blueprint/BlockKind";
import { Blueprint } from "../blueprint/Blueprint";
import { BlueprintBuilder } from "../blueprint/BlueprintBuilder";
import { BudgetProvider } from "../blueprint/BudgetProvider";
import { BlueprintValidator } from "../editor/BlueprintValidator";
import { GeometryReport } from "../editor/GeometryReport";
import { BlockStructure } from "../structure/BlockStructure";
import { StructuralReport } from "../structure/StructuralReport";
import { SupportSurface } from "../structure/SupportSurface";

/** One palette entry: what a click places, and what it costs. */
export class PaletteEntry {
  public readonly key: string;
  public readonly label: string;
  public readonly material: MaterialId;
  public readonly kind: BlockKind;
  /** True for the eraser, which places nothing. */
  public readonly erases: boolean;

  public constructor(
    key: string,
    label: string,
    material: MaterialId,
    kind: BlockKind,
    erases: boolean
  ) {
    this.key = key;
    this.label = label;
    this.material = material;
    this.kind = kind;
    this.erases = erases;
  }
}

/**
 * The editable design, its history, and the two-speed validation the editor needs.
 *
 * **Why validation is two-speed.** UI spec 3.1 says cost and violations are felt *during*
 * layout, never revealed at commit, because §1.3 relies on cost being felt while placing.
 * But a structural solve costs ~100 ms at P0 sizes and cannot run on every placed voxel.
 * So the cheap checks -- budget, bill of materials, required blocks, firing arcs, crew
 * routes, connectivity -- run synchronously on every edit, and the linear program runs on a
 * short debounce with the panel saying which rows are still catching up. Both halves come
 * from `BlueprintValidator`, the same object the runtime uses, so a design that validates
 * cannot behave differently in the arena.
 */
export class EditorModel {
  /** Milliseconds of quiet before the structural solve is worth starting. */
  public static readonly SOLVE_DEBOUNCE_MS: number = 220;

  private builder: BlueprintBuilder;
  private name: string;
  private readonly undoStack: BlueprintBuilder[];
  private readonly redoStack: BlueprintBuilder[];
  private readonly validator: BlueprintValidator;
  private readonly materials: MaterialTable;
  private readonly surface: SupportSurface;
  private readonly budget: BudgetProvider;
  private readonly dials: Dials;

  private geometryReport: GeometryReport | null;
  private structuralReport: StructuralReport | null;
  private structureValue: BlockStructure | null;
  private blueprintValue: Blueprint | null;
  private dirtyAtMs: number;
  private structuralStale: boolean;
  private lastSolveMs: number;
  private paletteValue: PaletteEntry;

  public constructor(
    blueprint: Blueprint,
    validator: BlueprintValidator,
    materials: MaterialTable,
    surface: SupportSurface,
    budget: BudgetProvider,
    dials: Dials
  ) {
    this.builder = BlueprintBuilder.fromBlueprint(blueprint);
    this.name = blueprint.name;
    this.undoStack = [];
    this.redoStack = [];
    this.validator = validator;
    this.materials = materials;
    this.surface = surface;
    this.budget = budget;
    this.dials = dials;
    this.geometryReport = null;
    this.structuralReport = null;
    this.structureValue = null;
    this.blueprintValue = null;
    this.dirtyAtMs = 0;
    this.structuralStale = true;
    this.lastSolveMs = 0;
    this.paletteValue = EditorModel.palette()[0];
    this.rebuild(0);
  }

  public static palette(): PaletteEntry[] {
    return [
      new PaletteEntry("wood", "wood", MaterialId.Wood, BlockKind.Structural, false),
      new PaletteEntry("stone", "stone", MaterialId.Stone, BlockKind.Structural, false),
      new PaletteEntry("station", "station", MaterialId.Wood, BlockKind.Station, false),
      new PaletteEntry("depot", "depot", MaterialId.Wood, BlockKind.Depot, false),
      new PaletteEntry("hatch", "hatch", MaterialId.Wood, BlockKind.Hatch, false),
      new PaletteEntry("core", "core", MaterialId.Stone, BlockKind.Core, false),
      new PaletteEntry("erase", "erase", MaterialId.Wood, BlockKind.Structural, true),
    ];
  }

  public get palette(): PaletteEntry {
    return this.paletteValue;
  }

  public selectPalette(key: string): void {
    const entries = EditorModel.palette();
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].key === key) {
        this.paletteValue = entries[i];
        return;
      }
    }
  }

  public get blueprintName(): string {
    return this.name;
  }

  public rename(name: string): void {
    this.name = name.length === 0 ? "untitled" : name;
    this.blueprintValue = null;
  }

  /** The design as an immutable blueprint. Cached until the next edit. */
  public blueprint(): Blueprint {
    if (this.blueprintValue === null) {
      this.blueprintValue = this.builder.build(this.name);
    }
    return this.blueprintValue;
  }

  public structure(): BlockStructure {
    if (this.structureValue === null) {
      this.structureValue = new BlockStructure(this.blueprint());
    }
    return this.structureValue;
  }

  public get geometry(): GeometryReport | null {
    return this.geometryReport;
  }

  public get structural(): StructuralReport | null {
    return this.structuralReport;
  }

  /** True while the structural rows of the panel are one edit behind. */
  public get awaitingSolve(): boolean {
    return this.structuralStale;
  }

  public get solveMs(): number {
    return this.lastSolveMs;
  }

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public get blockCount(): number {
    return this.builder.blockCount;
  }

  public hasBlockAt(cell: IVec3): boolean {
    return this.builder.has(cell);
  }

  // ---------------------------------------------------------------- editing

  /**
   * Places or erases a rectangle. A single cell is a rectangle of one, so click and
   * click-drag are the same code path and undo treats them the same way.
   */
  public applyRect(from: IVec3, to: IVec3, nowMs: number): boolean {
    const entry = this.paletteValue;
    const minY = from.y < to.y ? from.y : to.y;
    const maxY = from.y < to.y ? to.y : from.y;
    const minZ = from.z < to.z ? from.z : to.z;
    const maxZ = from.z < to.z ? to.z : from.z;
    const snapshot = this.snapshot();
    let changed = false;
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const cell = new IVec3(from.x, y, z);
        if (entry.erases) {
          if (this.builder.has(cell)) {
            this.builder.remove(cell);
            changed = true;
          }
          continue;
        }
        this.builder.place(cell, entry.material, entry.kind, EditorModel.facingFor(entry.kind));
        changed = true;
      }
    }
    if (!changed) {
      return false;
    }
    this.pushHistory(snapshot);
    this.rebuild(nowMs);
    return true;
  }

  public undo(nowMs: number): boolean {
    const previous = this.undoStack.pop();
    if (previous === undefined) {
      return false;
    }
    this.redoStack.push(this.snapshot());
    this.builder = previous;
    this.rebuild(nowMs);
    return true;
  }

  public redo(nowMs: number): boolean {
    const next = this.redoStack.pop();
    if (next === undefined) {
      return false;
    }
    this.undoStack.push(this.snapshot());
    this.builder = next;
    this.rebuild(nowMs);
    return true;
  }

  public load(blueprint: Blueprint, nowMs: number): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.builder = BlueprintBuilder.fromBlueprint(blueprint);
    this.name = blueprint.name;
    this.rebuild(nowMs);
  }

  /**
   * A station faces the lane and a hatch faces the back of the pad. P0 has no rotation
   * tool, so the sensible default has to be the right one: a gun that cannot see the lane
   * is a violation, and making the tester fix that by hand would teach nothing.
   */
  private static facingFor(kind: BlockKind): Direction {
    if (kind === BlockKind.Station) {
      return Direction.NegZ;
    }
    return Direction.PosZ;
  }

  private snapshot(): BlueprintBuilder {
    return BlueprintBuilder.fromBlueprint(this.builder.build(this.name));
  }

  private pushHistory(snapshot: BlueprintBuilder): void {
    this.undoStack.push(snapshot);
    this.redoStack.length = 0;
  }

  // ---------------------------------------------------------------- validation

  /** The cheap pass. Runs on every edit. */
  private rebuild(nowMs: number): void {
    this.blueprintValue = null;
    this.structureValue = null;
    if (this.builder.blockCount === 0) {
      this.geometryReport = null;
      this.structuralReport = null;
      this.structuralStale = false;
      return;
    }
    this.geometryReport = this.validator.validateGeometry(this.blueprint(), this.surface, this.budget);
    this.structuralStale = true;
    this.dirtyAtMs = nowMs;
  }

  /** True when the debounce has elapsed and the expensive pass should be run now. */
  public solveDue(nowMs: number): boolean {
    if (!this.structuralStale || this.builder.blockCount === 0) {
      return false;
    }
    return nowMs - this.dirtyAtMs >= EditorModel.SOLVE_DEBOUNCE_MS;
  }

  /** The expensive pass: the linear program, and the heatmap that comes out of it. */
  public solve(): void {
    const started = EditorModel.now();
    const report = this.validator.validate(this.blueprint(), this.surface, this.budget);
    this.structuralReport = report.structural;
    this.geometryReport = new GeometryReport(
      report.violations,
      report.stationReadouts,
      report.cost,
      report.budget,
      report.structural.floatingBlocks
    );
    this.structuralStale = false;
    this.lastSolveMs = EditorModel.now() - started;
  }

  public get cost(): number {
    return this.geometryReport === null ? 0 : this.geometryReport.cost;
  }

  public get remainingBudget(): number {
    return this.geometryReport === null
      ? this.budget.materialBudget()
      : this.geometryReport.remainingBudget;
  }

  public get materialTable(): MaterialTable {
    return this.materials;
  }

  public get dialValues(): Dials {
    return this.dials;
  }

  private static now(): number {
    if (typeof performance !== "undefined") {
      return performance.now();
    }
    return 0;
  }
}
