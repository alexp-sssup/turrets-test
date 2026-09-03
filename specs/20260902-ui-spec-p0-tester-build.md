# UI spec — P0 tester build

Layers on top of *Prototype spec — P0 "One Turret, One Lane"*. Section references (§) point at that document.

Stack: HTML + TypeScript, static files, no install for the tester.

Tags: **[in]**, **[stub]**, **[out]** as before.

---

## 1. Why this document is not a wrapper

Two of P0's three hypotheses live entirely in the UI. §1.1 asks whether the solver is *readable*; §1.2 asks whether the loop of replay-diagnose-fix is engaging. Neither can fail or succeed in the sim layer. A correct solver with an illegible heatmap returns a false negative on the most expensive system in the project.

So the readability tools are the deliverable, not the chrome around it. Budget them accordingly.

A second requirement comes from putting this in front of testers rather than the team: testers cannot tell you *why* the heatmap failed them. They will say it was confusing. The build therefore has to capture enough per-attempt data to answer the hypotheses without relying on tester articulation (§7).

---

## 2. Headline decision: P0 renders in 2D

**The tester build is a side-on 2D voxel cross-section, not 3D.** This is a deliberate deviation from the voxel framing in v0.2, taken for the prototype only.

> **Amended by [20260903-depth-view.md](20260903-depth-view.md).** The cross-section is now the *default* view rather than the only one: an optional fixed-camera 2.5D depth view draws the same scene with the x axis given a place on screen. Everything below still holds — it is one projection over the same layer registry, there is still no camera to learn, and `sim/` and `structure/` are still untouched.

Everything P0 tests exists in two dimensions: load paths under gravity, joint utilization, tension vs. compression, fire flowing down through contiguous wood, firing arcs, crew paths, and haul round trips.

What 2D buys, all of it directly serving the hypotheses:

- **Interiors are visible for free.** The resupply model (§4.3) only pays off if a tester can watch a runner walk a corridor and watch that corridor get cut. In 3D that needs cutaway modes, transparency, and a camera the tester has to learn. In 2D it is the default view.
- **No camera to teach.** Testers spend their attention on the structure, not on orbit controls. Zero onboarding cost.
- **A renderer that fits in a prototype.** A 2D canvas over a ~48×48 grid is trivially within frame budget, which keeps §1.1's performance question about the *solver* rather than about the renderer.

The seam: the solver operates on a joint graph and a cell index, neither of which is dimensional. Going to 3D replaces the renderer and the editor's placement input; it does not touch `sim/` or `solver/`. Cell indices become 3-tuples in one type change.

**Risk, stated plainly.** 2D cannot test whether firing arcs and occlusion produce anti-blob pressure in three dimensions, where a blob has far more interior volume to waste. §1.3 gets a partial answer here. Note it before reading the results.

---

## 3. Screens

Four screens and one persistent shell. The loop is Design → Allocate → Run → Replay → Design.

| Screen | Status | Purpose |
|---|---|---|
| Shell | **[in]** | Phase indicator, budget, crew tally, overlay switcher, dev readout |
| Design | **[in]** | Voxel editor, palette, stations, depots, validation, overlays |
| Allocate | **[in]** | Crew across gunners / repair / runners; pre-wave and inter-wave |
| Run | **[in]** | The wave playing out, live overlays, focus-fire click |
| Replay | **[in]** | Scrub, failure chain, first-failed joint, severed-path callout |
| Run summary | **[in]** | Cause of loss, jump-to-moment, return to editor with blueprint loaded |
| Library | **[stub]** | Local list, fork, rename, JSON import/export. No sharing UI. |
| Map / node selection | **[out]** | P2 |
| Opponent view, spectator | **[out]** | P1 |
| Touch / mobile layout | **[in]** | One build, responsive; see [20260903-mobile-ui.md](20260903-mobile-ui.md) |
| 2.5D depth view | **[in]** | Optional, additive, flat stays default; see [20260903-depth-view.md](20260903-depth-view.md) |
| Art, audio, VFX polish | **[out]** | Legibility over fidelity everywhere |

### 3.1 Design

Left rail is the palette: wood, stone, station, depot, erase. Each palette entry shows unit cost. The bill of materials and remaining budget update live per placed voxel — cost is never revealed only at commit, because §1.3 relies on cost being felt during layout.

Placement is click-drag rectangles plus single-cell. Undo/redo unlimited. No rotation, no copy-paste in P0.

The **validation panel** is always open, never a modal, never a blocking error. It lists violations with a click-to-locate:

- Station with no clear firing arc
- Station or depot with no traversable crew path to a hatch
- Station with no traversable path to any depot (new, per §4.3)
- Joint over utilization at rest
- Unsupported floating cells

Per selected station the panel shows: arc sweep, path to nearest depot, round-trip time, and rounds per trip for each load. This is the mandatory editor support §4.3 calls for.

### 3.2 Run

Non-interactive except for focus-fire clicks and pause. Testers are here to watch their design fail, and every extra verb dilutes the attribution.

Must be visible at a glance:

- Station status per station: firing, reloading, **dry**, unmanned, **no path**
- Runners in motion along their paths, carrying load
- Depot fill level and detonation risk proximity
- Fire spread front
- Live joint utilization if the stress overlay is on

Dry and no-path get the loudest treatment in the whole build. A silent gun that the tester does not notice reads as the game cheating, which is the exact failure mode §7 lists as a risk.

Pause is allowed and is not logged as a sim command. Speed control is 1× only — variable speed invites tester confusion about whether slowdown was jank or intent.

### 3.3 Replay

- Scrub bar with tick timestamps, keyboard frame-step
- Failure chain as an ordered list: joint, tick, cause. Clicking an entry seeks and highlights.
- **First-failed joint** is called out separately and prominently. It is the answer the tester came for.
- Severed-path events shown on the same timeline as structural failures, so "my gun went quiet" and "that corridor collapsed" appear as cause and effect.
- Export button produces a single JSON file (§6).

Overlays work in replay exactly as in design and run. Same code path, same shortcuts.

---

## 4. Overlays

The readability tools. One switcher, keyboard `1`–`5`, available on every screen.

| Key | Overlay | Shows |
|---|---|---|
| 1 | Material | Default. Cell material, damage, ignition. |
| 2 | Stress | Per-joint utilization as a colour ramp plus hatch bands |
| 3 | Predict | Hover or select a cell → what collapses if it dies |
| 4 | Logistics | Station-to-depot paths, round-trip times, runner positions |
| 5 | Arcs | Firing arcs, occlusion shadows from own blocks |

Requirements that are not negotiable:

- **Utilization must not encode on hue alone.** Colourblind testers exist and this is the hypothesis-critical overlay. Use a perceptually ordered ramp plus discrete hatch patterns at utilization bands (<0.5, 0.5–0.8, 0.8–1.0, >1.0). A tester should be able to read the overlay in greyscale.
- **Predict is live during a run.** The claim in §1.1 is that a player can *anticipate* a collapse. An overlay that only makes sense in hindsight during replay has already failed the test.
- Overlays compose with the base layer rather than replacing it. Losing sight of the structure to read its stress defeats the purpose.

---

## 5. Architecture

### 5.1 The one hard boundary

`sim/` and `solver/` are deterministic, fixed-timestep, and contain no DOM reference of any kind. They run headless. Enforce with a lint rule banning DOM and `window` imports from those directories, and a CI check that a canned attempt replays to an identical final state hash headlessly.

This exists because determinism is a P0 hard requirement (§4.5) and because you will want to batch-run collected tester blueprints against the wave script later without a browser.

The renderer reads `Readonly<SimState>` and never writes to it.

### 5.2 Commands, and why input is split

```ts
// Logged. Feeds the sim. Determinism depends on these being total and ordered.
export type SimCommand =
  | { k: 'placeBlueprint'; blueprint: BlueprintId }
  | { k: 'assign'; crew: CrewId; role: CrewRole }
  | { k: 'focus'; target: AttackerId | null }
  | { k: 'startWave' };

// Never logged. Cannot affect sim state.
export type ViewCommand =
  | { k: 'overlay'; mode: OverlayMode }
  | { k: 'inspect'; cell: CellIndex | null }
  | { k: 'seek'; tick: number }
  | { k: 'pan'; dx: number; dy: number }
  | { k: 'zoom'; factor: number };
```

Every piece of player input funnels through one dispatcher that routes on this split. A replay is `seed + blueprint + ordered SimCommand log` — no state capture, per §4.5. If a `ViewCommand` can ever change sim state, replay silently diverges and the loop breaks, so the type split is load-bearing rather than tidy.

### 5.3 Types

```ts
export type MaterialId = 'wood' | 'stone';
export type LoadId = 'solid' | 'firepot';
export type CrewRole = 'gunner' | 'repair' | 'runner';
export type CellIndex = number;              // 3-tuple when P1 goes 3D

export interface Cell {
  readonly material: MaterialId;
  hp: number;
  ignition: number;                          // 0 cold … 1 burning
}

export interface JointState {
  readonly a: CellIndex;
  readonly b: CellIndex;
  utilization: number;                       // >1 = failing. Drives overlay 2.
  integrity: number;                         // degraded by corrosive in P3
}

export interface StationState {
  readonly at: CellIndex;
  readonly arc: { from: number; to: number };
  crew: CrewId | null;
  rack: number;                              // weight units, cap from class data
  status: 'firing' | 'reloading' | 'dry' | 'unmanned' | 'no-path';
}

export interface CrewState {
  readonly id: CrewId;
  role: CrewRole;
  pos: Vec2;
  path: CellIndex[] | null;
  carrying: { load: LoadId; weight: number } | null;
  alive: boolean;
}

export interface SimState {
  readonly tick: number;
  grid: { w: number; h: number; cells: (Cell | null)[] };
  joints: JointState[];
  stations: StationState[];
  depots: DepotState[];
  crew: CrewState[];
  attackers: AttackerState[];
  events: SimEvent[];                        // append-only per tick; drained by render + telemetry
}
```

`SimEvent` is the shared channel for the replay timeline and telemetry — joint failure, ignition, crew death, depot detonation, path severed, station dry. Both consumers read the same stream, so the replay can never show something the metrics missed.

### 5.4 Render layers

```ts
export interface Layer {
  readonly id: OverlayMode | 'base';
  draw(
    ctx: CanvasRenderingContext2D,
    s: Readonly<SimState>,
    v: Readonly<ViewState>
  ): void;
}
```

A registry of `Layer`s, composited in order. Adding an overlay in P3 — corrosion, blast radius, mass distribution — is one registration. Nothing else changes.

### 5.5 Layout and dependencies

```
/src
  sim/         deterministic tick, no DOM
  solver/      LP structural solve, joint graph
  render/      canvas layers
  ui/          DOM panels, dispatcher, screens
  telemetry/   metrics, attempt records, export
  data/        materials.json, waves.json, blueprints/*.json
```

One `<canvas>` for the field; plain HTML and CSS for all panels. No UI framework — the panel count is small, and a framework adds a dependency surface and a render-timing question that the frame budget does not need. Vite for the build. Output is static files behind one URL.

All tuning values from §5 of the prototype spec live in `data/` as JSON, hot-reloadable in dev. Testers report on feel; you want to change a dial and re-run the same attempt log the same afternoon.

---

## 6. Performance and the dev readout

The frame budget is where §1.1 is answered, so it must be measured in front of the tester rather than reconstructed afterwards.

| Target | Value |
|---|---|
| Render | 60 fps sustained, 48×48 grid |
| Solver re-solve after damage | p95 under 16 ms, ~1500 cells |
| Full failure-chain resolve | under 100 ms |
| Cold load to first interaction | under 3 s |

A dev readout, on by default in the tester build, shows solver ms, render ms, cell count, and tick. When a tester says it stuttered, the report should contain numbers.

---

## 7. Tester requirements

These do not exist in the prototype spec and are the reason for a separate document.

### 7.1 Zero friction

One URL. No install, no account, no build step. Session ID generated locally and shown in the corner so a tester can quote it in feedback. Everything persists to local storage; nothing requires a server.

### 7.2 First 60 seconds put the tester in the loop, not in the editor

The hypothesis under test is the loop, not the editor. So the first session does not open on an empty grid, and does not open on the editor at all.

It opens mid-loop: a preloaded, **deliberately flawed** worked example is already on the pad, and the tester's first action is to start wave 1 and watch it fall over. Then the replay opens itself, points at the joint that sheared, and the button out of the replay is *Fix this blueprint*, which lands them in the editor with the failed joint selected and the stress overlay already on.

Three worked examples ship, per the fork-don't-start-blank decision in v0.2: an over-braced stone box that is too expensive to arm properly, a light wood frame that burns, and a stone-and-wood hybrid with one bad joint. Each fails a different way.

### 7.3 Metrics that answer the hypotheses

Recorded per attempt, no tester action required:

| Metric | Hypothesis |
|---|---|
| Stress/predict overlay opened before a run, and dwell time | §1.1 readability |
| Replay opened after a loss; watch fraction; scrub count | §1.2 loop |
| **Blueprint edited after replay, and whether the same joint failed again** | §1.2 — the single most important number in the build |
| Attempts to first survival; attempts to abandonment | §1.2 |
| Stations-per-cell and enclosed-volume ratio over successive attempts | §1.3 anti-blob |
| Dry-station seconds and no-path seconds per run | §7 resupply legibility |
| Solver p95, render p95, cell count | §1.1 performance |

"Did the replay cause a fix that worked" is the whole prototype in one field. Instrument it first.

### 7.4 Feedback capture

One hotkey opens a note box pinned to the current attempt ID and tick. The note ships with the attempt record, so a comment about a confusing moment arrives attached to the exact frame that caused it.

### 7.5 Export

One JSON file per attempt: session ID, blueprint, blueprint hash, seed, command log, event stream, metrics, notes. Small enough to paste. This is also the replay format and the headless-batch input format — one artifact, three uses.

---

## 8. Seams

- **3D** replaces `render/` and editor placement. `CellIndex` widens; `sim/` and `solver/` are untouched.
- **New overlays** are one `Layer` registration.
- **New materials and loads** are `data/` rows plus a palette entry. Weight-derived rounds-per-trip already flows to the logistics overlay with no UI change (§6 of the prototype spec).
- **Weapon classes** add a palette entry and a station-class field; the status enum already covers the states a new class can be in.
- **A second player** consumes the same command log with an owner tag. The Run screen becomes two structures on one field; Design and Replay are unchanged.
- **The map screen** in P2 is a new screen above the loop. Design, Allocate, Run, and Replay become what happens inside a node.
- **Community sharing** is a server in front of the export format that already exists. The local library becomes a cache.

---

## 9. Build order

1. Canvas grid, material overlay, placement, budget readout. No sim.
2. Solver integration, stress overlay, at-rest validation. Still no wave.
3. Fixed-timestep sim, command log, one wave, damage, collapse.
4. Replay from log, failure chain, first-failed-joint callout. **The loop closes here** — everything before this is unverifiable.
5. Crew, stations, resupply trips, logistics overlay, dry and no-path states.
6. Predict overlay, arcs overlay.
7. Telemetry, feedback hotkey, export, worked examples, guided first run.

Step 4 is the milestone worth defending. Nothing in the build tests anything until a tester can lose a turret and watch why.
