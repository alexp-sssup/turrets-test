# specs/

The specifications this project is built from. **This directory is the source of
truth**: the code implements the specs, the specs do not describe the code.

What is here so far:

- [`prototype-spec-p0.md`](prototype-spec-p0.md) — P0, "One Turret, One Lane".
- [`ui-spec-p0-tester-build.md`](ui-spec-p0-tester-build.md) — the browser tester build
  on top of it.
- [`mobile-ui.md`](mobile-ui.md) — touch and small screens, extending that one.

`structural-solver.md` still lives in [`../docs/`](../docs), along with copies of the two
P0 specs above; it will be moved or superseded here.

Conventions:

- One document per subject, named for the subject (`structural-solver.md`), not
  for a phase or a date.
- Sections are numbered, because the code cites them. A comment or a test name
  saying `spec 4.5` has to keep resolving to the same paragraph, so renumber a
  document only together with the references into it.
- A spec change is its own commit, separate from the code that follows it.
