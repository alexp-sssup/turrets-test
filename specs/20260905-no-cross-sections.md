# The cross-section goes: you dig your way in

**Supersedes §6 of [`20260903-isometric-renderer.md`](20260903-isometric-renderer.md)** (the
peel plane) and **§9 of the same document** (the flat developer view) in full, and **§3 of
[`20260905-face-adjacent-placement.md`](20260905-face-adjacent-placement.md)** (the reach
plane, the derived peel, the resets and the sheet), which was written yesterday and is the
document this one exists to finish. It also **deletes §2.5 of
[`20260904-pointing-at-blocks.md`](20260904-pointing-at-blocks.md)** — nothing is peeled, so
nothing is unaddressable — and **removes the cross-section rows** from mobile §6.1's control
bar, mobile §6.2's gesture table, and the keyboard tables of §3.1 and iso §12.

**There is no cross-section.** No slice index, no stepper, no picker, no `[` and `]`, no
peel, no wireframe, no ghosts, no second projection. One solid turret, seen from four
quarter turns.

**Amends face-placement §2.4**, which stands as written and becomes unreachable; §2 below
shows why, and it is now a theorem rather than a rule.

**Leaves standing:** face-placement §1, §2.1, §2.2, §2.3, §2.6 and §4 — the placement rule
itself is untouched and is what makes this affordable. pointing §2.1 and §2.2. mouse-gestures
§2 and touch-gestures §2 in full. iso §2, §3, §4, §5, §7 and §8, less what §4 below takes out
of the pieces that only ever served a section.

References written **iso §n** point at the isometric renderer spec, **face-placement §n** at
the document above, **pointing §n** at *Pointing at blocks*, **§n** at *UI spec — P0 tester
build*, and **mobile §n** at the mobile UI spec.

Code and tests cite this document as `no-sections spec n.n`.

---

## 1. Why the last job was not a job

face-adjacent-placement §3 kept the cross-section and gave it one meaning: the reach plane,
"the nearest section a verb can still address". The argument was that a ray stops at the
first solid block, so without a depth control an interior block can never be pointed at.

The premise is true. The conclusion does not follow, because **the editor already has a way
in, and it is the one the game will ship: erase the wall, do the work, build the wall back.**
That is what a voxel game does, the two verbs are already there, undo is unlimited
(mouse-gestures §5), and an erase refunds its block to the bill (§3.1). A control was
introduced to avoid using verbs the tester has anyway.

Three things it cost, none of them small:

- **A concept with no counterpart in the game.** iso §1 spent a renderer on the claim that a
  prototype must be measured in the terms the game will ship in. The section index is not one
  of those terms. A tester who learns `[` and `]` learns something the game will never ask
  of them, and the attention is spent out of the same budget §3.3 says every extra verb
  dilutes.
- **A second meaning for the camera.** Under face-placement §3.3 a quarter turn had to reset
  the plane, because "frontmost" is a fact about the yaw. So `q` moved the camera *and*
  silently threw away the tester's reach depth. Two controls entangled is what §3 was trying
  to end.
- **Roughly a fifth of `render/`.** `PeelPlane`, `SectionCue`, the wireframe pass, the ghost
  pass, the dim ramp, the per-section fill table, the second projection and its painter, the
  strip, the stepper, the picker, two telemetry counters. All of it exists to serve one
  index.

**What replaces it is nothing, and that is the point.** Digging is worse than a cutaway for
reaching one block and better for everything else: it is two verbs instead of three, it needs
no mode, it cannot be left switched on by accident, and what a tester sees on Design is
exactly what they see in Run — which is what iso §6's own per-screen table was reaching for
when it made Run solid.

**The real answer to "let me get inside" is a camera, not a cutaway**, and it is a first-person
view. That is **[out]** here and named so this document is not read as denying the need. What
it denies is that a section index is a down payment on it: a first-person camera shares no
code with a peel plane, so keeping the peel until then buys nothing toward it.

---

## 2. The rule

### 2.1 One view **[in]**

The isometric 2.5D view of iso §2, solid, at four quarter turns. Every live block is drawn
with faces, shading, kind, damage, fire and glyphs — the "reach plane" row of iso §6's
treatment table, applied to the whole turret. There is no other treatment and no other
projection.

`ViewMode` goes with the flat view. iso §9 kept the side-on cross-section as a developer
diagnostic on the grounds that it "costs nothing to keep"; that was true while the section
machinery was there for other reasons and is false now, because it would be the only thing
left holding all of it up. A diagnostic is not worth a concept.

### 2.2 Interiors: erase, work, rebuild **[in]**

The way to a block you cannot see is the block in front of it. Erase (pointing §2.2), do
what you came to do, and build the wall back across the face you exposed
(face-placement §2.1). Nothing new is needed for this and nothing is added for it.

The cost is honest and is not hidden: a round trip through a wall is `n` erases and `n`
placements, each one an undo entry and a bill movement. On a P0 design — five by five, the
worked examples run to 43 blocks — a wall is two or three cells thick at the point you want
through, so the trip is a handful of clicks.

### 2.3 A placement can no longer collide, and this is a theorem **[in]**

face-placement §2.4 refuses a placement into an occupied cell, because the peel could hide a
block in the target. With no peel it cannot happen, and the proof is one line of the
traversal:

> The ray enters a block through the face it last crossed, so the cell across that face is
> the cell the ray visited immediately before — and the traversal only got there by finding
> that cell empty. The pad case is the same: a ray reaches the pad only by passing through
> the cell resting on it.

So the guard stays in `PlacementRule` and stops being reachable. It is kept because it is
free, because it is the contract of a value function that a future caller might feed a hit
it did not walk a ray for, and because the theorem is worth a test rather than a comment.
§5 requires that test.

### 2.4 The overlays stop having a favourite section **[in]**

Every overlay drew its marks at full strength on the active section and dimmed the rest;
the stress overlay went further and drew **only** the joints touching it (iso §10, "anchored
to the reach plane"). With no section there is no such thing as anchored, and the rule
becomes the simple one: **every overlay draws every mark, at full strength.**

For the stress heatmap that is a change in what is on screen, not only in how it is tinted,
and it is the right one: §1.1 asks whether a tester can read the solver, and the field the
solver produces is the whole field. Anchoring it to a section was answering "can a tester
read one plane of the solver".

**The bias to watch,** stated as face-placement §6 stated its own: on a design with a thick
interior, every interior joint's mark now lands on top of the wall in front of it, because
UI §4.1 says an overlay is occluded by nothing. On the P0 designs this is measured against —
tens of blocks on a five-by-five pad — the interior is a handful of cells and the reading
stays clean. What would falsify the choice is testers saying the stress overlay is
unreadable on their *own* designs rather than on the worked examples; the fix then is a
filter on utilization, not the return of a section index.

### 2.5 What the freed controls do: nothing **[in]**

`[` and `]` are unbound. The cross-section cell of mobile §6.1's control bar is gone, and
the row it occupied is not refilled — 6.1 ranks the cross-section above the transport, so
this is space given back to the two rows below it rather than an opening for a new verb.
The `m` projection toggle in the dev readout goes with the projection.

---

## 3. What the removal reaches

Load-bearing, because a reader who follows a citation into one of these needs to find it
gone rather than find it stale:

| Gone | Was |
|---|---|
| `render/PeelPlane`, `render/SectionCue` | iso §6, the treatment table and the peel proof |
| `render/ViewMode`, the flat painter, `Projection`'s flat branches, `IsoProjection.inSection` | iso §9 |
| `ViewState.slice`, `ViewState.mode`, `ViewCommand.slice`, `ViewCommand.mode` | iso §5.3, §6, §9 |
| `FieldDesign.sliceMin` / `sliceMax` / `clampSlice` / `frontSlice` / `blocksInSlice` | the strip, the stepper, face-placement §3.3 |
| `ScenePainter`'s reach-plane sheet, `Palette.reachPlane*`, `Palette.ghost`, `Palette.peelEdge` | iso §5.3's second affordance, face-placement §3.4 |
| `VoxelPainter.paintWireframe`, `paintGhost`, the dim ramp in `FacePalette` | iso §6's table, iso §9 |
| `DetailLevel`'s reach-grid rung | iso §8's degradation ladder, which loses a rung and keeps its order |
| The slice strip, stepper and picker in `FieldControls`; `useSliceStepper`, `slicePickerOpen`, `sliceCounts`, `peeling`, `peeledSections` in `ShellState` | mobile §6.1, §6.2 |
| `Telemetry.notePeel` / `notePeelMove`, and `peelMovesInDesign` / `peelMovesInRun` / `runSecondsWithPeel` on the attempt record | iso §10's peel questions |

`FrameCells` loses its `solidOnly` flag: there was one set of cells all along and the peel
was the only reason for two.

**A hole where a block died** was drawn only in the active section. It is now drawn wherever
a block died, which needs no rule: the back-to-front sort paints a hole behind a live wall
and then paints the wall over it, so an interior hole is hidden exactly as the block that
made it was.

---

## 4. What iso §10 measures now

The two peel questions — "peel-plane moves per attempt, in Design and in Run separately" and
"seconds in Run with a peel engaged" — are withdrawn with the control they were about. What
replaces them is one question this document should be judged on, and the existing counters
already answer it:

**Do testers dig?** An attempt whose erase count is close to its placement count is a tester
going through walls; one whose erases are rare is a tester building outward and never
looking inside. If nobody digs, either the designs have no interiors worth reaching — which
is §1.3's anti-blob claim answering itself in the good direction — or testers wanted in and
could not work out how, which is the failure this document risks and the interview question
that finds it: *"was there anything you wanted to change and could not get at?"*

---

## 5. Tests this document requires

- A placement's target cell is empty, over every screen point of a worked example, at every
  yaw: the theorem of 2.3, asserted rather than assumed.
- The pick still returns the frontmost live block and its entry face with nothing peeled,
  at every yaw — the cases face-placement §7 pinned, minus the peel.
- Erase a block, place one across a face the erase exposed, and erase it back: the round
  trip of 2.2, ending on the design it started from (2.2).
- Every joint of a design appears in the stress overlay's draw, not only those of one
  section (2.4).
- No `ViewState` field and no `ViewCommand` names a section or a projection (2.1, 3).
