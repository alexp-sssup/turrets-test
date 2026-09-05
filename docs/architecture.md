# Architecture

The P0 build is a **headless deterministic simulation core**, a CLI harness, and a browser
tester build layered on top of both.

The core is the part that matters: every claim in the spec (§1) is observable through data
alone -- the heatmap is a per-joint utilization array, the replay is an event log, the editor
is a validator that returns violations -- so it can be tested, batch-run and translated
without a renderer ever existing. See [ui-p0.md](ui-p0.md) for the build that draws it.

```
src/
  core/         Value types, deterministic RNG, fixed-point-safe comparisons, dense grids.
  math/lp/      General bounded-variable simplex LP solver. No game knowledge.
  materials/    The material table (spec §6: "materials are a table row, not code").
  blueprint/    Authored designs: blocks, bill of materials, budget provider.
  structure/    Joint graph + limit-analysis structural solver + collapse resolution.
  path/         Deterministic voxel pathfinding (hatch access, depot hauls).
  editor/       Blueprint validation + per-station logistics readout.
  damage/       DamageVerb interface, kinetic + incendiary implementations, fire sim.
  crew/         Fixed crew pool, assignment layer, repair details, runners.
  sim/          Attacker controller interface, scripted waves, run loop, replay recorder.
  persistence/  Blueprint library that survives between runs.
  app/          Headless CLI harness. The only file I/O and the only console output.

  render/       The isometric projection, the depth-sorted composition, canvas layers, the
                frame snapshot, predictive analysis. Browser only.
  ui/           DOM panels, the input dispatcher, the screens. Browser only.
  telemetry/    Per-attempt metrics and the export format. No I/O, no clock of its own.
  data/         dials.json and the worked examples.
```

Dependencies point strictly downward in that list; `math/lp` knows nothing about voxels
and `structure` knows nothing about waves.

## Layer map to the spec

| Spec section | Module |
|---|---|
| §4.1 Materials | `materials/MaterialTable` |
| §4.2 Crew stations | `blueprint/Blueprint`, `editor/BlueprintValidator` |
| §4.3 Ammunition and depots | `materials/AmmoTable`, `crew/LogisticsSystem` |
| §4.4 Crew as a resource | `crew/CrewPool`, `crew/AssignmentPlan` |
| §4.5 The attack | `sim/ScriptedAttacker`, `sim/WaveScript` |
| §4.6 Targeting | `sim/TargetingSystem` |
| §1.1 Solver | `structure/StructuralSolver` |
| §1.2 Replay | `sim/ReplayRecorder` |
| §7 Recoil | `structure/LoadSet` + `sim/WeaponSystem` |
| Isometric renderer §2 projection | `render/IsoProjection`, `render/ViewYaw`, `render/ZoomLadder` |
| Isometric renderer §3-4 voxels and the sort | `render/VoxelFaces`, `render/VoxelPainter`, `render/DrawList`, `render/FieldComposition` |
| Isometric renderer §5 picking | `render/CellPick`, `render/FaceHit`, `render/Projection` |
| Face-adjacent placement §2 | `render/PlacementRule`, `render/GroundPick`, `ui/PointerTarget` |
| Isometric renderer §6 the peel | `render/PeelPlane`, `render/SectionCue` |
| Isometric renderer §7 the scene | `render/ScenePainter`, `render/ActorPainter` |
| Isometric renderer §8 budget | `render/StructureCache`, `render/DetailLevel` |

## The structural solver

See [structural-solver.md](structural-solver.md). Short version: rigid voxel blocks,
deformable joints, static equilibrium as a linear program, objective = maximise the
collapse load factor. The optimum is a single legible number (`loadFactor`) and a
per-joint utilization field (the heatmap).

## The one hard boundary

`core`, `math`, `materials`, `blueprint`, `structure`, `path`, `editor`, `damage`, `crew`,
`sim`, `config` and `persistence` contain no DOM reference and no wall clock -- not
`document`, not `performance.now`, not `Date.now`. `scripts/check-boundary.mjs` enforces it
and CI runs it, because determinism (spec 4.5) is what makes the replay an input log rather
than a state capture, and because collected tester blueprints have to be batch-runnable
without a browser. The same check refuses a renderer that mutates simulation state.

`render/`, `ui/` and `telemetry/` are browser-side and **exempt from the C++ translation
rules below**: they will not be translated, since a shipping engine brings its own renderer.
They still follow the surrounding naming and comment conventions.

## Determinism

Required by spec §4.5. The rules the code obeys:

* No wall-clock time, no `Math.random`, no iteration over hash containers in an
  order-dependent way. `SplitMix64` (`core/Rng`) is the only entropy source and it is
  seeded per run.
* Every container that feeds an ordering decision is an array with an explicit sort, and
  every sort comparator is a total order (ties broken on a stable integer id).
* Pathfinding tie-breaks on the linear cell index (`path/AStar`), never on insertion order.
* Floating point is used, but the *sequence* of operations is fixed, so a given input
  reproduces bit-identically on one platform. The replay is therefore an input log
  (spec §4.5), not a state capture.

## C++ translation rules

The code is written to be mechanically translatable. Enforced by review, not by a tool:

1. Classes and interfaces only. No structural typing tricks, no mixins, no decorators.
2. `enum` for closed sets (maps to `enum class`). No string literal unions in core code.
3. No `async`/`await`, no generators, no `Promise` in `src/` outside `app/`.
4. No object/array spread, no destructuring, no optional chaining, no `slice`; explicit
   field access and explicit `for` loops instead of `map`/`filter`/`reduce`. Lambdas appear
   only as sort comparators and as container iteration callbacks, because those are exactly
   what they become in C++ (`std::sort` with a comparator, a range-`for` over a map).
5. Collections are `Array<T>` (`std::vector`) or `Map<number, T>` (`std::unordered_map`
   with an integer key). No string-keyed maps in hot paths.
6. Nullable references are written `T | null` (maps to `T*` / `std::optional<T>`) and are
   always checked explicitly. Sentinel `-1` is used for absent indices.
7. Value types (`Vec3`, `IVec3`) are immutable and returned by value.
8. No exceptions for control flow: solvers return a status enum. `throw` is reserved for
   programmer error (precondition violations).
