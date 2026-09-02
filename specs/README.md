# specs/

The specifications this project is built from. **This directory is the source of
truth**: the code implements the specs, the specs do not describe the code.

Nothing has been uploaded here yet. The specs written so far still live in
[`../docs/`](../docs) (`prototype-spec-p0.md`, `ui-spec-p0.md`,
`structural-solver.md`); they will be moved or superseded here.

Conventions once specs land:

- One document per subject, named for the subject (`structural-solver.md`), not
  for a phase or a date.
- Sections are numbered, because the code cites them. A comment or a test name
  saying `spec 4.5` has to keep resolving to the same paragraph, so renumber a
  document only together with the references into it.
- A spec change is its own commit, separate from the code that follows it.
