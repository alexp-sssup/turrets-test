# The P0 tester build

Implements [UI spec — P0 tester build](../specs/20260902-ui-spec-p0-tester-build.md) on
top of the headless core described in [architecture.md](architecture.md). Static files, one
URL, no install for the tester.

```sh
npm run dev        # vite dev server, hot-reloads data/dials.json
npm run build:web  # typecheck + boundary check + static build into dist-web/
npm run preview    # serve the built output
```

The build is published to GitHub Pages by `.github/workflows/pages.yml` on every push to the
development branch, after typecheck, the boundary check and the headless test suite all pass.

**Pages needs enabling once, by a repository admin:** Settings → Pages → Source: *GitHub
Actions*. The workflow token cannot do it itself -- `configure-pages` with `enablement: true`
comes back "Resource not accessible by integration" -- so until somebody flips that switch the
build job fails at `configure-pages` with a message saying exactly that. If the `github-pages`
environment is also restricted to the default branch, either add this branch to its allowed
list or merge first; the deploy job reports that separately.

## What the tester sees

The first session opens **mid-loop**, not in the editor (§7.2): a deliberately flawed worked
example is already on the pad, and the only thing to do is start wave 1. The example's gun is
on a five-voxel wood cantilever with a margin of 0.96, so the arm shears on the first solve,
the core is reachable through the front wall, and the run is over in about twenty seconds of
arena time. Then the replay opens itself, names the joint that went first, and the way out of
it is *fix this blueprint* — which lands in the editor with that joint selected and the stress
overlay already on.

Three worked examples ship (`src/data/WorkedExamples.ts`), each failing a different way:

| Example | What it does in P0 |
|---|---|
| **reaching gun** | Stands at rest at 0.96, shears its arm root immediately, loses the core in wave 1. |
| **wood frame** | Cheap, well armed, one contiguous flammable body with a wood core. Dies in wave 3. |
| **stone keep** | Survives all five waves for 171 material and one gun — and re-solves in ~300 ms. |

The keep is the honest exception to "each fails a different way". It does not fall over,
because P0's pressure against a blob is cost and firepower rather than collapse, and because
a core sunk in a stone floor is unreachable by this wave script. That is a finding, not a
fudge, and §1.3 gets a partial answer here exactly as the spec warns it will.

## Layout

```
src/
  render/       canvas layers, the frame snapshot, the projection, predictive analysis
  ui/           DOM panels, the dispatcher, the screens, the frame clock
  telemetry/    per-attempt metrics, the export format, the session store seam
  data/         dials.json + the worked examples
```

`render/` and `ui/` are the only directories allowed to touch the DOM. `telemetry/` and
`data/` are DOM-free and covered by the headless test suite. Everything below them is the
existing core, unchanged in behaviour: `npm run demo` still prints the same report it did
before this build existed, event for event.

Those three directories are also exempt from the C++ translation rules in
[architecture.md](architecture.md). They will not be translated — a shipping engine has its
own renderer — so they use template-free string building where the core would, but they use
`Map`, closures for event handlers and `catch` blocks freely.

## The decisions worth arguing with

### The cross-section is (z, y), and one slice at a time

The spec's headline decision is that P0 renders in 2D. The core it renders is already 3D, so
"2D" here means a side-on cross-section: **z across** (the lane, attackers entering from the
left), **y up**, and **x** as the slice. One slice is drawn solid; the rest are ghosted behind
it so a five-wide turret does not look one-wide. `[` and `]` move the slice, and the strip in
the shell shows which sections exist.

Everything §1.1–§1.3 tests lives in that plane: load paths under gravity, joint utilization,
fire running down through contiguous wood, crew walking a corridor and that corridor being
cut. The one thing that does not is the firing arc, which is a fan in the *horizontal* plane —
so the arcs overlay draws the sight line in the main view and the real nine-ray fan in a small
plan inset, each in the plane it belongs to. Drawing the fan as a wedge in a vertical section
would be a picture of something that is not there.

Going to 3D replaces `render/` and the editor's placement input. `sim/` and `structure/` never
learn about it.

### The 2.5D depth view, and how you see inside a multilayer turret

`v` toggles a second projection over the same scene, specified in
[specs/20260903-depth-view.md](../specs/20260903-depth-view.md). It is a fixed oblique
projection — one constant screen offset per section, up and to the right, no camera and no
rotation — and the flat cross-section stays the default.

The question it answers is the one the flat view cannot: a five-wide turret's other four
sections all land in the same place there, so a wall and a corridor are the same grey smear.
The answer is a rule rather than a slider. **The active cross-section is never occluded:
everything nearer the viewer is peeled back to an outline, everything behind it is drawn
solid and dimmed with distance.** The peel plane is the active section, so `[` and `]` are
still the only depth control — stepping toward the viewer takes one more wall off the front.

Three things fall out of measuring the depth offset from the active section rather than from
the world origin: the section you are working in does not move when you toggle the mode,
screen-to-world still resolves in exactly one plane (so a click is never a picking problem),
and the flat view is the same code with the offset set to zero.

### Playback and simulation are separate clocks

A structural re-solve costs 60–300 ms at P0 sizes and happens a hundred-odd times in a
five-wave run (see [structural-solver.md](structural-solver.md)). Stepping the simulation in
lockstep with the frame clock would drop six frames every couple of seconds, and a tester
cannot tell a stutter caused by the solver from one caused by a renderer — which would put a
confound straight through the one question this build exists to answer.

So `AttemptSession` keeps the simulation about 1.25 s *ahead* of playback, spending at most
9 ms of each animation frame on ticks. Playback then reads finished frames at a steady 1×.
When a collapse cascade costs more than the buffer holds, playback stalls, the panel says so,
and the dev readout reports the solve that did it. Nothing is smoothed over.

The cost is that a focus-fire click lands at the simulation's leading edge rather than at what
the tester is looking at — at most 1.25 s of lag, which is why the lead is one of the numbers
in the dev readout.

### The run stops between waves

Spec 4.4 makes crew reassignment inter-wave only, so the run has to actually stop at a wave
boundary -- and because the simulation runs ahead of playback it would otherwise have opened
the next wave before the tester had finished watching the last one. So `AttemptSession`
holds the loop at the boundary until playback drains to it, and then until the tester presses
*next wave*. The Allocate screen appears there with what is left of the crew, and the way out
of a run you no longer want to fly is *abandon this run*, which records the attempt as flown
and lost rather than dropping it: "attempts to abandonment" is one of the numbers §7.3 asks
for.

### Validation is two-speed

§3.1 wants cost and violations felt *during* layout, and a full validate costs ~70 ms at 49
blocks. So `BlueprintValidator` was split: `validateGeometry` runs budget, bill of materials,
required blocks, firing arcs, crew routes and connectivity on every placed voxel, and
`validate` adds the linear program on a 220 ms debounce. The panel marks the structural rows
`re-solving…` rather than blanking them, and prints what the last solve cost whenever it is
over the 16 ms budget. Both halves come from the same object the runtime uses, so a design
that validates cannot behave differently in the arena.

### The stress overlay does not encode on hue alone

Four bands (<0.5, 0.5–0.8, 0.8–1.0, >1.0), ordered by luminance *and* carrying distinct hatch
patterns, so the field survives greyscale and colourblindness. The key in the shell uses the
same patterns as the field rather than an approximation of them.

One correction the spec did not anticipate: the solver's `criticalJoints` — the failure
mechanism at the *collapse* load — is a non-empty set even for a structure with a margin of
thirty. Ringing those in red would tell a tester their sound design was failing, so the loud
ring is reserved for joints over capacity at the load actually applied.

### Predict runs on a clone

"What collapses if this cell dies" is answered by cloning the structure
(`BlockStructure.clone`), destroying the block on the copy, and resolving the cascade on the
copy with the same `CollapseResolver` the run uses. Loading is self-weight only: recoil is a
one-tick transient and would make the answer flicker. It runs after the draw, at most one per
140 ms, and reports its own cost in the panel — 200–500 ms is normal, and that is the §1.1
answer rather than something to hide.

## Metrics

Recorded per attempt with no tester action, and exported as one JSON file (§7.5):

| Metric | Where it comes from |
|---|---|
| Stress/predict dwell, before and during the run | `Telemetry.noteOverlay` |
| Replay opened, watch fraction, scrub count | `Telemetry.noteReplayOpened` / `noteScrub` |
| **Edited after replay, and whether the same joint failed again** | `AttemptRecord.sameJointFailedAgain` |
| Attempts to first survival | `SessionSummary` |
| Stations per cell, enclosed volume ratio | `DesignMetrics` (flood fill from outside the design) |
| Dry-station and no-path seconds | accumulated off the frames the tester actually saw |
| Solver p95/max, render p95, cell count | `SampleSet`, sampled per tick and per frame |

`sameJointFailedAgain` is the field the whole prototype is in, so it is computed from the
previous attempt's first-failed joint rather than reconstructed later.

**Note capture (§7.4) is not in this build.** It was cut on request: no hotkey, no note box,
and no `notes` field in the export. Everything else in §7 is present.

## Deviations from the spec, in one place

1. **Module names.** The spec's `solver/` is this codebase's `structure/`, and its `sim/` is
   already `sim/`. No directory was renamed for the sake of the document.
2. **`data/` holds the dials and the examples, not every table.** `dials.json` is the tuning
   file §5.5 asks for, and a test asserts it agrees with `Dials.defaults()` field for field so
   the browser build and the headless harness cannot drift. Materials, ammunition and waves
   stay as typed tables: they have behaviour attached, and the spec's own reason for `data/`
   (change a dial, re-run the same attempt) is served by the dials file alone. Worked examples
   are authored in TypeScript like the existing fixtures, and round-trip through
   `BlueprintCodec`, so exporting one as JSON gives exactly the same design.
3. **`SimCommand` / `ViewCommand` are enums and classes, not string-literal unions.** The
   split is what matters and it is enforced structurally: `Dispatcher.dispatchView` holds a
   `ViewState` and a seek target and has no reference to the simulation.
4. **The command log in the export is the simulation's own.** `placeBlueprint` and `startWave`
   are not in it; the blueprint and the fact the attempt was flown are separate fields.
5. **No `Library` screen beyond the stub the spec asked for**: local list, fork, rename, JSON
   import and export, no sharing UI.
