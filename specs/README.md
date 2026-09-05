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
- [`20260903-isometric-renderer.md`](20260903-isometric-renderer.md) — the isometric 2.5D
  renderer: the projection, depth sorting, picking, the peel plane, and the scene the turret
  stands in. Amends §2 and §3 of the UI spec and supersedes the depth-view spec below.
- [`20260903-depth-view.md`](20260903-depth-view.md) — **superseded** by the isometric
  renderer spec. Kept for the peel rule it first argued and the alternatives it ruled out;
  not to be implemented against.
- [`20260904-loss-conditions.md`](20260904-loss-conditions.md) — how a run ends. Removes the
  Core block from P0 and replaces the win-condition dial in §5 of the P0 spec with a win and
  two named losses, wrecked and unmanned.
- [`20260904-touch-gestures.md`](20260904-touch-gestures.md) — a one-finger drag pans on
  every screen. Amends the gesture table and caption rows of the mobile UI spec. Its §6 said
  the mouse was unchanged; the document below supersedes that section and nothing else.
- [`20260904-mouse-gestures.md`](20260904-mouse-gestures.md) — the mouse follows: placement
  is single-cell on every pointer, a drag pans, and §3.1 of the UI spec loses its
  click-drag rectangles. Read with the touch document above; together they are the whole
  gesture set.
- [`20260904-hatches.md`](20260904-hatches.md) — what a hatch is: a ladder, and a hole that
  carries almost no load and stops no shot. Adds the §4 section the P0 spec never had and
  one dial. Its §7 is superseded by the document below.
- [`20260904-crew-access.md`](20260904-crew-access.md) — crew walk in through an opening in
  the ground floor, and hatches are only for going up. Deletes the "no hatch" violation.
- [`20260904-standable-ground.md`](20260904-standable-ground.md) — the pad and a one-cell
  apron are a floor crew can stand on. Closes the edge the document above left open, and
  narrows where corridor-severing bites.
- [`20260904-pointing-at-blocks.md`](20260904-pointing-at-blocks.md) — inspect and the
  eraser address the block under the pointer. Restores §5.2 of the isometric renderer spec
  on the Design screen and carves the eraser out of its §5.3; placement stays plane-locked.
- [`20260904-gun-ports.md`](20260904-gun-ports.md) — a station is a firing slit and its
  gunner stands in it. Deletes the `StationNoCrewSpace` violation and corrects a round-trip
  pair quoted in the hatches spec. Its §2.1 and §2.6 are superseded by the document below.
- [`20260904-palette-material.md`](20260904-palette-material.md) — the palette says which
  material it authors. Writes down the P0 restriction that a station, a depot and a hatch
  are wood, and amends the palette sentence of §3.1 of the UI spec to name it.
- [`20260905-station-terminus.md`](20260905-station-terminus.md) — a slit is not a doorway.
  Crew stand in a station and no route passes through one, so a gun port in the ground-floor
  wall stops being a way in. Supersedes §2.1 and §2.6 of the gun-ports document above.
- [`20260905-crew-are-visible.md`](20260905-crew-are-visible.md) — the twelve can be seen,
  counted and told apart. The Allocate screen draws the crew it is allocating, crew with no
  post muster one to a cell on the ground, and the role colours are named and keyed. Amends §3
  of the UI spec and §7.4 of the isometric renderer.

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
