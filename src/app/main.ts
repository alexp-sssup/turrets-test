import { tmpdir } from "node:os";
import { join } from "node:path";
import { Dials } from "../config/Dials";
import { AmmoTable } from "../materials/AmmoTable";
import { MaterialTable } from "../materials/MaterialTable";
import { Blueprint } from "../blueprint/Blueprint";
import { ConstantBudgetProvider } from "../blueprint/BudgetProvider";
import { SampleBlueprints } from "../blueprint/SampleBlueprints";
import { BlueprintValidator } from "../editor/BlueprintValidator";
import { BlueprintLibrary } from "../persistence/BlueprintLibrary";
import { BlockStructure } from "../structure/BlockStructure";
import { GravityLoadCase } from "../structure/LoadCase";
import { StructuralSolver } from "../structure/StructuralSolver";
import { Arena } from "../sim/Arena";
import { InputScript } from "../sim/InputScript";
import { RunSimulation } from "../sim/RunSimulation";
import { ScriptedAttacker } from "../sim/ScriptedAttacker";
import { WaveScript } from "../sim/WaveScript";
import { FileBlueprintStore } from "./FileBlueprintStore";
import { HeatmapView } from "./HeatmapView";
import { ReportView } from "./ReportView";

/**
 * Headless harness for the P0 prototype.
 *
 * P0 exists to answer three questions (spec 1), so this walks through all three: it
 * validates designs and prints the heatmap the player is supposed to read (question 1),
 * runs the five-wave script and prints the replay (question 2), and shows the same script
 * telling two designs apart (question 3).
 */
function main(): void {
  const dials = Dials.defaults();
  const materials = MaterialTable.defaults();
  const ammo = AmmoTable.defaults(materials);
  const arena = Arena.p0();
  const pad = SampleBlueprints.pad();
  const budget = new ConstantBudgetProvider(dials.materialBudget);
  const validator = BlueprintValidator.withDefaults(materials, dials);
  const solver = StructuralSolver.withDefaults(materials, dials);
  const loadCase = new GravityLoadCase(materials, dials);

  banner("P0 -- one turret, one lane");

  const designs: readonly Blueprint[] = [
    SampleBlueprints.standardTurret(),
    SampleBlueprints.buriedStationTurret(),
    SampleBlueprints.severedDepotTurret(),
    SampleBlueprints.overreachingTurret(),
  ];

  section("1. The editor: designs validated before anything is built");
  for (let i = 0; i < designs.length; i++) {
    const design = designs[i];
    print("");
    print('"' + design.name + '"');
    printAll(ReportView.blueprintSummary(design, materials, dials.materialBudget));
    const started = process.hrtime.bigint();
    const report = validator.validate(design, pad, budget);
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    printAll(ReportView.validation(report, ammo));
    print("  validated in " + elapsed.toFixed(0) + " ms");
  }

  section("2. The heatmap: what the player reads before wave one");
  const standard = designs[0];
  const standardStructure = new BlockStructure(standard);
  const standardJoints = solver.buildJointGraph(standardStructure, pad);
  const standardReport = solver.analyse(
    standardStructure,
    standardJoints,
    loadCase.build(standardStructure)
  );
  print('"' + standard.name + '" -- what each block is for');
  print("  S station  D depot  H hatch  # stone  + wood");
  printAll(HeatmapView.renderKinds(standardStructure));
  print("");
  print('"' + standard.name + '" -- per-joint utilization');
  print("  " + HeatmapView.utilizationLegend());
  printAll(HeatmapView.renderUtilization(standardStructure, standardReport));

  const overreaching = designs[3];
  const badStructure = new BlockStructure(overreaching);
  const badJoints = solver.buildJointGraph(badStructure, pad);
  const badReport = solver.analyse(badStructure, badJoints, loadCase.build(badStructure));
  print("");
  print('"' + overreaching.name + '" -- the same view on a design that will not hold');
  print(
    "  load factor " +
      badReport.loadFactor.toFixed(3) +
      " (under 1: it is over capacity before a single shot is fired)"
  );
  printAll(HeatmapView.renderUtilization(badStructure, badReport));

  section("3. The run: five scripted waves down one lane");
  const script = WaveScript.p0(arena.laneCentreX);
  const simulation = RunSimulation.withDefaults(dials, arena);
  const started = process.hrtime.bigint();
  const result = simulation.run(
    standard,
    new ScriptedAttacker(script),
    script,
    InputScript.empty(),
    2026
  );
  const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  printAll(ReportView.runSummary(result));
  print("  simulated in " + wallSeconds.toFixed(1) + "s of wall time");
  print("");
  print("  what happened, by event kind");
  printAll(ReportView.eventHistogram(result.replay));
  print("");
  print("  the last few lines of the replay");
  printAll(ReportView.tail(result.replay, 12));

  section("4. The other half of the loop: watching a design come apart");
  const badRun = RunSimulation.withDefaults(dials, arena).run(
    overreaching,
    new ScriptedAttacker(script),
    script,
    InputScript.empty(),
    2026
  );
  printAll(ReportView.runSummary(badRun));
  print("");
  printAll(ReportView.collapseStory(badRun.replay, 8));

  section("5. The library: the whole of cross-run progression");
  const path = join(tmpdir(), "turrets-p0-library.txt");
  const store = new FileBlueprintStore(path);
  const library = new BlueprintLibrary();
  for (let i = 0; i < designs.length; i++) {
    library.save(designs[i]);
  }
  store.write(library);
  const reloaded = store.read();
  print("  saved " + library.size.toString() + " design(s) to " + store.location);
  print("  reloaded " + reloaded.size.toString() + ": " + reloaded.names().join(", "));
  print(
    "  byte-identical on re-encode: " + (reloaded.encode() === library.encode() ? "yes" : "no")
  );

  section("What P0 answers");
  print("  1. Solver readable?  yes -- the heatmap peaks at exactly 1/loadFactor, and the");
  print("     predictive highlight fills up as the margin thins rather than after failure.");
  print("     Fast enough? only at small scale; see docs/structural-solver.md for numbers.");
  print("  2. Core loop?        a run is reproducible event-for-event, and the replay names");
  print("     the first joint that sheared, so fix-and-rerun has something to act on.");
  print("  3. Anti-blob?        arcs, crew paths, haul distance, fire and cost are all real");
  print("     systems here -- the buried station and the severed depot above are both");
  print("     violations no rule had to declare.");
}

function banner(text: string): void {
  print("");
  print("=".repeat(78));
  print("  " + text);
  print("=".repeat(78));
}

function section(text: string): void {
  print("");
  print("-".repeat(78));
  print(text);
  print("-".repeat(78));
}

function print(line: string): void {
  // The one place the project writes to a console.
  process.stdout.write(line + "\n");
}

function printAll(lines: readonly string[]): void {
  for (let i = 0; i < lines.length; i++) {
    print(lines[i]);
  }
}

main();
