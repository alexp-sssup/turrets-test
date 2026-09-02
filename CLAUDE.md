# CLAUDE.md

Project guidance for Claude Code sessions in this repository.

## Branching: work directly on `Main`

**All work happens directly on the default branch, `Main`.** Do not create a
per-session branch, and do not open a pull request unless asked to.

- The default branch is spelled `Main` (capital M), not `main`.
- At the start of a session: `git fetch origin Main && git checkout Main && git pull origin Main`.
- Commit your changes on `Main` and push with `git push -u origin Main`.
- If a session was started on a `claude/...` branch, switch to `Main` before
  committing (`git checkout -B Main origin/Main`, carrying any work over) and
  push there instead. This instruction is the standing permission to do so.
- If a push is rejected because `Main` moved, `git pull --rebase origin Main`
  and push again. Never force-push `Main`.

## Before you push

Pushing to `Main` publishes straight to the branch CI and Pages build from, so
validate locally first:

```sh
npm run typecheck      # tsc --noEmit
npm test               # builds, then runs the node:test suite
npm run check:boundary # the sim core must stay DOM-free
```

`npm run build:web` runs the typecheck and boundary check together with the
Vite build, and is the closest local equivalent of the Pages workflow.

## Project layout

- `src/` — the simulation core (headless, no DOM) plus the renderer on top of it.
- `test/` — `node:test` suites, run from the compiled output in `dist/`.
- `docs/` — the P0 prototype, UI and structural-solver specs the code implements.
- `scripts/check-boundary.mjs` — enforces that the core keeps no DOM reference.

Requires Node >= 22.
