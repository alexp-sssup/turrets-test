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
```

## Layout

See [docs/architecture.md](docs/architecture.md), which also lists the C++ translation
rules the source obeys (the prototype is TypeScript, the shipping engine may not be).
