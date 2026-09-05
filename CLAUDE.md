# CLAUDE.md

Project guidance for Claude Code sessions in this repository.

## Branching: work directly on `main`

**All work happens directly on the default branch, `main`** (lowercase). Do not
create a per-session branch, and do not open a pull request unless asked to.

- At the start of a session: `git fetch origin main && git checkout main && git pull origin main`.
- Commit your changes on `main` and push with `git push -u origin main`.
- If a session was started on a `claude/...` branch, switch to `main` before
  committing (`git checkout main && git merge --ff-only <that branch>`, so any
  work already committed carries over) and push there instead. This instruction
  is the standing permission to do so.
- If a push is rejected because `main` moved, `git pull --rebase origin main`
  and push again. Never force-push `main`.

## Before you push

Pushing to `main` publishes straight to the branch CI and Pages build from, so
validate locally first:

```sh
npm run typecheck      # tsc --noEmit
npm test               # builds, then runs the node:test suite
npm run check:boundary # the sim core must stay DOM-free
```

`npm run build:web` runs the typecheck and boundary check together with the
Vite build, and is the closest local equivalent of the Pages workflow.

## This is a spec-driven project

The specs come first and the code follows. **All specs live in `specs/`.** Before
changing behaviour, read the spec section that governs it; if the spec and the code
disagree, the spec wins and the code is the bug.

**A spec is amended forward, never edited in place.** A rule that turns out to be wrong is
superseded by a *new* dated document, not by a rewrite of the one that carried it. The
directory is a history: it has to keep reading as the order the thinking went in, and a
reader who follows a `spec 4.5` citation out of the code needs the paragraph that code was
written against rather than a later opinion of it. So changing a rule is two commits, in
this order:

1. **The follow-up document**, `specs/YYYYMMDD-<subject>.md`, on its own. It opens by
   naming exactly what it supersedes or amends and what it leaves standing, gives the
   legend for its cross-references, says what code and tests should cite it as, argues why
   the old rule was wrong -- with the measurement, where there is one -- and ends with the
   tests it requires. Link it from `specs/README.md` in the same commit.
2. **The code that implements it**, citing the new document's section numbers.

Edit an existing spec in place only for a typo, a broken link, or the tail of a rename.
Never to change what it says. The supersedes line at the top of the newer document is what
tells a reader which rule is live and what replaced the one it replaced; a silent rewrite
leaves them nothing to read that from, and quietly falsifies every citation already
pointing at the old wording.

- **Name every file in `specs/` `YYYYMMDD-<subject>.md`** -- the date the document
  was first written, then its subject (`20260903-mobile-ui.md`). The prefix is how
  a later reader sees the order the specs evolved in, so use the date of writing
  when creating a file and leave it alone when editing one afterwards; it dates the
  document, it does not version it. Renaming an existing spec means updating the
  links to it in `specs/README.md` and in the other specs in the same commit.
- Cite the spec in code and in tests. A comment or a test name that says
  `spec 4.5` is how a reader gets from an implementation back to the rule it
  serves, so keep those references accurate when specs are renumbered.
- If a task needs behaviour no spec covers, say so and propose the spec wording
  rather than inventing the rule silently in code.
- `specs/` is the only place a spec lives. The stale copies of the P0 prototype and
  tester-build specs that `docs/` used to carry beside them have been deleted, so
  never re-add a spec there or leave a second copy of one behind: a reader who finds
  two must not have to work out which one is current. What remains in `docs/` is
  `architecture.md`, the tester-build notes, and `structural-solver.md`, the one spec
  still awaiting migration here.

## Language: TypeScript now, C++ later

The prototype is TypeScript, but **it will be ported to C++**. Write every line as
if a C++ translation of it is already scheduled -- because it is. Prefer the
subset of TypeScript that has an obvious C++ counterpart.

Do use:

- `class` with explicit `public` / `private` / `readonly` members, one concept
  per class, constructors that fully initialize their object.
- `interface` for abstract contracts (they become pure virtual classes) and
  `implements` on the concrete types.
- Plain value types: `number`, `boolean`, string enums or `const` unions used as
  tags, and small immutable structs like `Vec3`.
- `readonly T[]` and index loops; fixed-size, pre-sized arrays where the size is
  known.
- Explicit types on every parameter and return, including private helpers.

Avoid, unless a spec forces it:

- Structural typing tricks with no C++ shape: anonymous object literals passed as
  parameters, index signatures used as ad-hoc records, intersection types.
- Type-level machinery: mapped and conditional types, `keyof`/`typeof` gymnastics,
  decorators, generics beyond a single plain type parameter.
- `any`, `unknown` outside a `catch`, non-null assertions (`!`), and optional
  chaining used to paper over a value that should never be absent.
- Closures captured as long-lived state, `async`/`await` and promises in the
  simulation core, exceptions as control flow, `Object` spread for cloning, and
  garbage-collector-dependent lifetimes (hold owners explicitly).
- JSON and reflection anywhere below `data/` and `persistence/`.

Determinism is part of this: no `Math.random`, no `Date.now`, no
`performance.now()` in the headless core -- see `scripts/check-boundary.mjs`.
Integer-valued quantities stay integral; compare floats through the helpers in
`src/core/Numeric.ts`, never with `===`.

## Code structure: one class per file, clean interfaces

Mirror the layout that is already there -- it is the layout a C++ tree will want.

- **One class (or one interface, or one small value type) per file, named exactly
  after the file.** `src/core/Vec3.ts` exports `Vec3`. No grab-bag modules.
- Group files into a directory per subsystem, and re-export the subsystem's public
  surface from its `index.ts` (see `src/crew/index.ts`). Cross-subsystem imports
  go through that barrel; reaching into another subsystem's internal file is a
  sign the interface is missing.
- **Dependencies point strictly downward** through the layer list in
  `docs/architecture.md`. `math/lp` knows nothing about voxels; `structure` knows
  nothing about waves. No cycles between files -- C++ has no way to express one.
- Depend on interfaces at subsystem seams (`DamageVerb`, `BudgetProvider`,
  `AttackerController` are the pattern): the caller takes the interface, the
  concrete type is injected by the composition root in `src/app/`.
- Keep the headless/browser split absolute. `src/render/` and `src/ui/` may touch
  the DOM; nothing else may, and the DOM types will not port.
- When a file grows past roughly 300 lines or a class past a handful of
  responsibilities, split it rather than adding another section comment.

## Tests: add them with every change, consistently

`test/` mirrors `src/` directory for directory, and every subsystem carries a
suite. Keep it that way.

- **New class or new behaviour means new test cases in the same commit.** A
  subsystem without a `test/<subsystem>/` suite is an incomplete change.
- Put a test beside its subsystem: `src/editor/BlueprintValidator.ts` is covered
  by `test/editor/BlueprintValidator.test.ts`.
- Use `node:test` with `import { strict as assert } from "node:assert";` only.
  No test framework, no mocking library -- construct the real objects and inject
  stub implementations of the interfaces, which is what the C++ tests will do too.
- Name each case after the rule it pins, and cite the spec section in the name or
  a comment so a failure points at the spec.
- Cover the worked examples from the specs verbatim (`src/data/WorkedExamples.ts`)
  and assert exact numbers, not ranges: the core is deterministic, so a test that
  tolerates drift hides a bug.
- Every bug fix starts with a test that fails before it.
- Tests run from compiled output in `dist/`, so `npm test` builds first.

## Project layout

- `specs/` — the specs this project is built from. The source of truth; read
  before writing code, and see `specs/README.md` for the conventions.
- `src/` — the simulation core (headless, no DOM) plus the renderer on top of it.
  One class per file, grouped into a directory per subsystem.
- `test/` — `node:test` suites mirroring `src/`, run from the compiled output in `dist/`.
- `docs/` — `architecture.md`, the `ui-p0.md` tester-build notes, and
  `structural-solver.md`, the last spec written before `specs/` existed and not yet
  migrated into it.
- `scripts/check-boundary.mjs` — enforces that the core keeps no DOM reference.

Requires Node >= 22.
