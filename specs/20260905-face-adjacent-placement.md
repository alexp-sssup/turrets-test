# Placement grows from a face — the cross-section stops being an editor

**Supersedes §5.3 of [`20260903-isometric-renderer.md`](20260903-isometric-renderer.md)** in
full, and **§2.3 of [`20260904-pointing-at-blocks.md`](20260904-pointing-at-blocks.md)**,
which restated it. Placement is no longer locked to the active cross-section: a click puts
the new block against the face of the block it was aimed at, the way every voxel builder a
tester has ever used does it.

**Amends iso §6.** The peel keeps its rule and keeps its proof; what changes is the job it
does, the control it hangs off, and its per-screen default — §3 below.

**Amends pointing §2.4**, whose sentence stands verbatim while the cell it names moves.

**Leaves standing, untouched:** pointing §2.1 (inspect picks), §2.2 (the eraser picks) and
§2.5 (nothing peeled is addressable); mouse-gestures §2 and touch-gestures §2 in full — not
one gesture, threshold or binding moves here; palette-material §2; iso §5.1 and §5.2, which
this document is built on rather than against.

References written **iso §n** point at the isometric renderer spec, **pointing §n** at
*Pointing at blocks*, **§n** at *UI spec — P0 tester build*, **mobile §n** at the mobile UI
spec, **mouse-gestures §n** / **touch-gestures §n** at those two documents, and **P0 §n** at
the prototype spec.

Code and tests cite this document as `face-placement spec n.n`.

---

## 1. Why the plane goes

iso §5.3 locked placement to the active cross-section, and gave one reason for it:

> a placement that resolved by picking would let a mis-click put a block a section away from
> the one the tester meant, and §1.3's anti-blob measurements are measurements of what
> testers *chose* to build.

The hazard is real. The rule chosen against it is the wrong one, for four reasons, and the
first is the one iso §1 already used to buy the projection.

**Transfer.** iso §1 threw away a cheaper renderer because "a perceptual claim measured in a
projection the game will never ship is not a weak answer to those questions; it is an answer
to different questions". Placement is the same argument one layer in. *Choose a section with
a stepper, then click inside it* is an engineering-drawing verb. No voxel game ships it, and
the tester arrives already knowing the one that every voxel game does ship. §1.3's
anti-blob pressure is a claim about how a **player** builds; measured through a section
stepper it is a claim about how a tester copes with a section stepper. iso §5.3 saw this
coming and wrote face-adjacent placement down as "the natural P1 successor". P1 is the wrong
release for it: the measurement that P1 would be planned from is taken here.

**The failure the plane rule actually produces is worse than the one it prevents.** iso
§5.3's mis-click is a block one section from the one the tester meant — visibly wrong,
adjacent to what they were looking at, one `z` away from gone. What the plane rule produces
instead is a click that lands in a plane the tester set some minutes ago and has stopped
thinking about. The block appears somewhere plausible, in a section they were not looking
at, and nothing on screen contradicts it, because the plane is a translucent sheet and a
solid turret is drawn on both sides of it. That is the same class of bug pointing §1
documented for the eraser — a verb answering about a cell the tester never pointed at — and
it is the class of bug pointing §3 called the worst available: cheap to make, hard to
notice, and it costs the tester their model of the tool.

Under the face rule a wrong placement is one cell from the pixel that was under the pointer,
against a face the tester could see. Wrong-cell errors become adjacent-cell errors, and
mouse-gestures §5's unlimited undo already makes an adjacent-cell error cost nothing.

**The pick already computes it.** iso §5.2's traversal is a three-axis DDA that crosses
exactly one lattice plane per step, so the face a ray entered a block through *is* the axis
it just crossed. Face-adjacent placement is one integer carried out of a loop that already
runs on every hover: no second traversal, no allocation, and nothing added to the frame.

**It leaves the stepper one job.** iso §6.1 rejected a second depth control because "two
controls that both mean 'how deep' is one control too many". The cross-section was worse
than that — it was two *different* meanings on one control: where my next block goes, and
how much of the turret I can see through. A tester who peels one more wall to look at a
joint has silently moved their build target, and nothing tells them. §3 splits the two by
deleting one of them.

**And every placement becomes attached.** A face-adjacent block has a neighbour, or the pad
directly under it. The solver still decides whether the design stands — nothing here
pre-empts P0 §6 — but a tester can no longer spend an edit on a block floating in mid-air,
which under the plane rule was the single easiest thing to do by accident.

---

## 2. The rule

### 2.1 A placement lands against the face it was aimed at **[in]**

**With a placing entry armed, a click puts one block in the empty cell across the face of
the block under the pointer.** The block under the pointer is the frontmost visible one —
the same pick, the same ray and the same rules as pointing §2.1 and §2.2, so inspect, the
eraser and placement all address one block and differ only in what they do about it.

The face is the one the view ray entered the block through, which is the lattice plane the
traversal of iso §5.2 crossed last before the hit. The new cell is the picked cell plus that
face's outward normal.

### 2.2 The ground is a face, and on an empty pad it is the only one **[in]**

A ray that meets no block meets the pad. **The pad's surface is a placeable face: a click on
it puts a block in the cell resting on it**, at `y = pad.level`, at the pad cell the ray
crosses that plane in — which is iso §5.1's horizontal inverse at `level`, exact and
already written.

Only the pad, not the apron. standable-ground §2.2 widened where crew may *stand* by one
cell; where a block may *rest* is unchanged and is `SupportSurface.supportsBlockAt`. A click
on the apron or on the lane places nothing, because a block there would be resting on
nothing, and the first thing this document is for is that a placement is attached.

A ray that meets neither a block nor the pad places nothing.

### 2.3 Three faces at a time, and the other two are a quarter turn away **[in]**

A fixed-elevation camera sees exactly three faces of a cube: the top, the `+p` face and the
`-r` face (iso §2.2). Those are the three a ray can enter through, so those are the three a
click can build on. **`q` and `e` are how a tester reaches the other two sides**, and that
is the first job the yaw has ever had in the editor rather than in the viewer.

The sixth face is the bottom, and it stays unreachable. Nothing is placed underneath what it
would hang from: growth is upward and outward from the pad, which is the direction a turret
grows in anyway.

### 2.4 A placement into an occupied cell does nothing **[in]**

The target cell can be occupied by a block that is not drawn solid, because pointing §2.5
makes a peeled block unpickable while it is still *there*: with the peel engaged, the
camera-facing face of the reach plane has wireframed neighbours behind — in front of — it.

**A placement whose target cell already holds a block changes nothing**: no block, no bill
change, and nothing pushed onto the undo stack. This is pointing §2.2's rule for the eraser
over empty scene, applied to the one case that is its mirror, and for the same reason — a
silent overwrite of a block the tester cannot see is exactly the uncommanded edit
mobile §6.2 and touch-gestures §2.4 spend two rules refusing.

The click falls through to an inspect, as a click that edits nothing already does
(pointing §2.1), so the tester is told what is under the pointer instead of nothing at all.

### 2.5 The eraser, inspect and the peel are unchanged **[in]**

pointing §2.1, §2.2 and §2.5 are the rules this document builds on, and none of them moves.
The eraser still removes the block it picked; inspect still names it; a peeled block is
still not addressable by any verb. What changes is that the third verb — placement — now
resolves through the same pick as the other two, which is what pointing §3's first argument
said it could not, and §1 above is the answer to that argument.

### 2.6 Hover previews the cell the armed tool will act on **[in]**

pointing §2.4, verbatim. Only the cell moves: under a placing entry the hover outlines the
**face-adjacent cell of 2.1**, not a build-plane cell, and under the eraser it outlines the
picked block exactly as before. Over a target 2.2 or 2.4 refuses, the hover outlines
nothing, which is the honest preview of a click that will do nothing.

A finger has no hover (mobile §6.3) and needs none here: the cell a tap fills is one step
from the pixel the finger is on, so the preview the plane rule needed — a sheet drawn
somewhere else on screen — is not what a touch placement is missing.

### 2.7 The flat dev view keeps the plane **[in]**

iso §9's side-on cross-section is a developer diagnostic and draws one section as flat
tiles. It has no faces to aim at, and inventing a screen-space face rule for a view no
tester sees would be a second placement model to keep in step. **In `ViewMode.Flat`,
placement fills the cell under the pointer in the active section**, which is what iso §5.3
did and what the flat view can express. Nothing else in this document applies there.

---

## 3. The cross-section becomes reach, not build

### 3.1 The reach plane **[in]**

The active cross-section keeps its keys (`[`, `]`), its stepper and its picker (mobile §6.2),
its readout and its index. It loses one of its two meanings and keeps the other, and it is
called the **reach plane**: *the nearest section a verb can still address*. Everything in
front of it is peeled, and pointing §2.5 already says a peeled block is not addressable — so
the section index now answers one question, "how far in can I reach", and no longer answers
"where does my next block go".

Every use of the term *build plane* in iso §5.3, iso §6, pointing §2.3 and the code that
cites them is replaced by *reach plane*. This is a rename of a thing whose definition
changed under it, not a tidy-up: a reader who finds "build plane" in the tree is reading
code written against a superseded rule.

### 3.2 The peel is derived from the reach plane, and its boolean goes **[in]**

iso §6's rule, its proof and its treatment table are all unchanged: everything between the
camera and the reach plane is a wireframe, everything behind it is solid, and which sections
count as "in front" comes from the yaw. What goes is the separate on/off flag beside it.

**A section is peeled exactly when it stands in front of the reach plane.** With the reach
plane at the frontmost section nothing stands in front of it, the peel count is zero and the
turret is solid — so "no peel" is not a mode, it is where the one control sits. That is iso
§6.1's own standard ("two controls that both mean 'how deep' is one control too many") held
against a flag iso §6 introduced two paragraphs after writing it.

The readout iso §6 requires is unchanged in shape and names the reach plane:
`x = 2 · 3 blocks · 2 peeled`.

### 3.3 Every screen opens solid, and two things reset the reach plane **[in]**

iso §6's per-screen table said Design opens on a full cutaway and Run opens solid. **The
Design row is withdrawn: every screen opens with the reach plane at the frontmost section,
and therefore solid.**

It has to be. Under 2.1 a placement needs a face that is drawn solid, and pointing §2.5
makes a peeled block unaddressable — so a Design screen that opened on a full cutaway would
open with the entire turret wireframed and nothing to build on but its far wall. The
cutaway was mandatory when placement was plane-locked, because a plane a tester cannot see
into is a plane they cannot aim at. Face-adjacent placement aims at what is drawn, so the
cutaway stops being the price of building and becomes what it should have been: the tool for
reaching an interior, engaged when a tester wants one.

Two things put the reach plane back at the frontmost section, and both are forced:

- **A quarter turn** (`q`, `e`). "Frontmost" is a fact about the yaw (iso §2.2), so a
  camera move that did not reset would flip a two-section peel into a peel of everything
  else — the turret would turn inside out under a key whose whole job is to show the tester
  the other side of it.
- **A screen change.** iso §6's Run and Replay rows are the ones that survive, and they say
  the game view is a solid turret. Resetting on entry is how they keep saying it now that
  the peel is derived.

Loading a blueprint is a screen change into Design and resets with it. The old
"open on the section a station is in" heuristic goes: it exists to point the *build* plane
somewhere useful, and there is no build plane to point.

### 3.4 The sheet stays, and says something else **[in]**

iso §5.3 required the active section to be drawn as a translucent grid of rhombi, so a
tester could see where a click would land. Clicks no longer land there, and a sheet that
says they do is a lie drawn 60 times a second.

**The sheet is kept and re-pointed: it is the face of the cutaway.** Drawn only while
something is peeled, which under 3.2 is exactly while the reach plane is not the frontmost
section, it says where the wireframe stops and the solid turret starts. iso §6 already
argued that cue is owed — "a cutaway a tester has not noticed reads as a missing wall" —
and gave the job to the readout alone. A drawn plane is the stronger half of it, and it is
already built.

---

## 4. What this costs

- **Replacing a block's material in place.** Under the plane rule, clicking a cell that
  already held a block overwrote it, so wood became stone in one click. Under 2.4 that click
  does nothing. The replacement is erase, then place: two clicks, both undoable, and the
  same two a voxel game asks for. Worth one section of regret and not a rule: a
  click-to-overwrite verb is indistinguishable at the pointer from a mis-aimed placement,
  and it is the mis-aimed placement that 2.4 exists to refuse.
- **Reaching an enclosed interior** now costs a stepper move it did not cost before. That is
  the peel doing the job §3 gives it, and it is the honest price of a builder that aims at
  what is drawn.
- **Placing below an existing block** is gone (2.3). Nothing in P0 needs it: the pad is the
  only floor and a design grows up from it.

---

## 5. What does not change

- **No `SimCommand` is added or removed.** Placement is still an edit to the blueprint the
  editor holds and a phone attempt still replays bit-identically in the desktop build and
  the headless runner (mobile §7.1).
- **The gesture set**, in full. One click or one tap is one voxel on every pointer
  (mouse-gestures §2.1); a drag pans; a modifier press never places; undo is unlimited.
- **The palette.** §3.1's rail keeps its six entries, its live bill and its materials
  (palette-material §2).
- **The pick.** iso §5.2's traversal is unchanged in cost, in order and in what it returns
  as the hit cell; it returns the entry face alongside it.
- **The peel's proof**, iso §6's central paragraph, which is what makes 2.4's occupied-cell
  case the only one there is.
- **Validation.** Face-adjacency is not a structural claim. `BlueprintValidator` and the
  solver decide whether a design stands, exactly as before.

---

## 6. Measurement, and the bias to watch

iso §10 asks "peel-plane moves per attempt, in Design and in Run separately" and wonders
whether the cutaway is a build tool, a diagnosis tool, or both. The question sharpens rather
than dies: on Design the reach plane is now *only* a reach tool, so its move count is a
direct count of how often testers went inside their own turret, uncontaminated by the moves
they used to make just to put a block down. No new counter is needed for that; the existing
one starts meaning something.

**The bias this document introduces, stated plainly.** The plane rule made filling an
interior cell exactly as cheap as filling a surface cell. The face rule does not: an
interior cell costs a stepper move first. That is a thumb on the scale of §1.3's anti-blob
measurement, in the direction §1.3 hopes to find. It is accepted because it is the *shipped*
thumb — a player of the real game will pay the same price for the same cell — and a
measurement of anti-blob pressure under the game's own controls is the measurement §1.3
asked for. What would falsify the choice is testers hollowing turrets they cannot explain
liking; the interview question is "why is it hollow", not "is it hollow".

---

## 7. Tests this document requires

- The pick returns the entry face, and it is the camera-facing one on the axis the ray last
  crossed — at every yaw, for a hit on the top, on the `+p` face and on the `-r` face (2.1).
- A click on the top face of a block places directly above it; on the `+p` face, one step
  along `+p`; on the `-r` face, one step along `-r` — at every yaw (2.1, 2.3).
- The same screen point, before and after a quarter turn, places on the two different faces
  it then shows (2.3).
- A click over the empty pad places at `y = pad.level` in the pad cell under the pointer
  (2.2); over the apron and over the lane it places nothing and pushes nothing onto the undo
  stack (2.2).
- A placement whose target cell is occupied by a peeled block changes no block and pushes
  nothing onto the undo stack (2.4).
- With the eraser armed the target is the picked block; with a placing entry armed it is the
  face-adjacent cell — over one screen point, so the two rules are pinned against each other
  (2.5, 2.6).
- The reach plane at the frontmost section peels nothing, at every yaw; one step inward
  peels exactly one section (3.2).
- A quarter turn puts the reach plane back at the frontmost section of the new yaw, and the
  peel count returns to zero (3.3).
- Entering Design leaves the turret solid (3.3).
- In `ViewMode.Flat` a click fills the cell under the pointer in the active section, and the
  face rule does not apply (2.7).
