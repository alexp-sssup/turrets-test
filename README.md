# Turrets -- P0 prototype ("One Turret, One Lane")

Headless, deterministic implementation of the P0 prototype spec in
[docs/prototype-spec-p0.md](docs/prototype-spec-p0.md).

P0 exists to answer three questions, and the code is arranged so each one is observable
without a renderer:

1. **Is the solver fast and readable enough?** `structure/StructuralSolver` returns a
   collapse load factor plus a per-joint utilization field (the heatmap) and a predictive
   highlight set. See [docs/structural-solver.md](docs/structural-solver.md).
2. **Does the core loop hold?** A run produces a replay: an input log plus a timestamped
   event log naming the first joint that failed.
3. **Does anti-blob pressure work without a rule?** Firing arcs, crew paths, simulated
   haul distance, fire propagation and cost are all real systems, so a solid block has to
   lose on their own.

## Quick start

```sh
npm install
npm test          # builds, then runs the node:test suite
npm run demo      # runs a scripted five-wave run and prints the report
npm run site      # builds the static site published to GitHub Pages
```

The site is the docs plus a live run of the harness, redeployed by
`.github/workflows/pages.yml` on every push to the default
branch. It needs Pages set to "GitHub Actions" as its source once, under Settings -> Pages.

`npm run demo` walks all three questions: it validates the sample designs and prints the
heatmap, runs the five-wave script and prints the replay, and shows the same script telling
a sound design and an unsound one apart. Abridged:

```
"overreaching"
  structure overloaded, load factor 0.627, peak utilization 1.594, tipping margin 1.920
  joints    33 (6 in the limit mechanism, 11 highlighted)
  violations
    - structurally unsound: load factor 0.627
    - station has no route to a depot (block 14): it will fire its rack dry and fall silent

"overreaching" -- per-joint utilization
  .<0.13 :<0.25 -<0.38 =<0.50 +<0.63 *<0.75 #<0.88 !<1.00   ! = at or over capacity
  y=3
     .
     -
     *
     !
     !
     !

  first failed joint: block 1 -> block 4
```

## What P0 answered

Recorded here because the point of a prototype is the answer, not the code:

1. **Readable, yes. Fast, only at small scale.** The heatmap peaks at exactly
   `1 / loadFactor`, so it cannot disagree with the headline margin, and the predictive
   highlight is empty at a 1.5x margin and populated at 1.04x. Cost is the problem: 52
   blocks solve in 0.3 s and 136 in 8 s, which is comfortable for editor-time analysis of a
   few dozen blocks and too slow for live re-analysis of a turret near the 500-unit budget.
   Both seams for fixing that are in place. See
   [docs/structural-solver.md](docs/structural-solver.md).
2. **The loop has what it needs.** A run reproduces event-for-event from its input log, and
   the replay names the first joint that sheared, so fix-and-rerun has something to act on.
3. **Anti-blob pressure is real, not a rule.** A gun buried behind another gun reports 0% of
   its arc clear; a depot walled off from its station makes the station fire its rack dry;
   reach costs bracing because a wood arm runs out of bending capacity at five voxels. None
   of those needed a rule to say so.

Two things P0 found that were not in the spec: overturning cannot be expressed as a load
factor at all (it is invariant under one), so it is reported separately as a tipping margin;
and a wood column standing on a stone floor is a hinge, because the interface inherits
stone's zero tension.

## Layout

See [docs/architecture.md](docs/architecture.md), which also lists the C++ translation
rules the source obeys (the prototype is TypeScript, the shipping engine may not be).
