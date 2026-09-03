# specs/

The specifications this project is built from. **This directory is the source of
truth**: the code implements the specs, the specs do not describe the code.

What is here so far:

- [`20260902-prototype-spec-p0.md`](20260902-prototype-spec-p0.md) — P0, "One Turret,
  One Lane".
- [`20260902-ui-spec-p0-tester-build.md`](20260902-ui-spec-p0-tester-build.md) — the
  browser tester build on top of it.
- [`20260903-mobile-ui.md`](20260903-mobile-ui.md) — touch and small screens, extending
  that one.

`structural-solver.md` still lives in [`../docs/`](../docs) and has not been migrated yet;
it will be moved or superseded here. The duplicate copies of the two P0 specs that sat
beside it are gone -- the versions in this directory are the only ones.

Conventions:

- Every file here is named `YYYYMMDD-<subject>.md`: the date the document was
  first written, then the subject it covers (`20260903-structural-solver.md`).
  The prefix records how the specs evolved and orders the directory by that
  history; it is not a version, so it stays fixed when the document is edited
  later. One document per subject, and the subject half of the name says what
  the document is about, not which phase it belongs to.
- Sections are numbered, because the code cites them. A comment or a test name
  saying `spec 4.5` has to keep resolving to the same paragraph, so renumber a
  document only together with the references into it.
- A spec change is its own commit, separate from the code that follows it.
