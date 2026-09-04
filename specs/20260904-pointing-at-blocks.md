# Pointing at blocks — inspect and erase address what is under the pointer

Restores §5.2 of [`20260903-isometric-renderer.md`](20260903-isometric-renderer.md) on the
Design screen, where the build never applied it, and carves the eraser out of that
document's §5.3. Placement itself is untouched: 5.3 still governs where a *new* block goes.

References written **iso §n** point at the isometric renderer spec, **§n** at *UI spec — P0
tester build*, **mobile §n** at the mobile UI spec, and **mouse-gestures §n** /
**touch-gestures §n** at those two documents.

Code and tests cite this document as `pointing spec n.n`.

---

## 1. Two symptoms, one cause

Both are reproducible in the shipped tester build on the `reaching gun` worked example,
opened on Design with the build plane at `x = 3`.

- **Long-press to inspect reports `empty` over a solid block.** Press the front face of the
  pad — a stone block, plainly drawn, nothing in front of it — and the inspector answers
  `cell (3,-1,1) · empty`. It has answered about a cell in the build plane that the finger
  never pointed at, one storey below the pad, instead of the block it was on. Alt-click on a
  mouse and the sweep of mobile §6.3 do the same thing, because all three are one code path.
- **The eraser silently does nothing, most of the time.** With `erase` armed, clicking a
  visible block removes it only when that block happens to lie in the active cross-section.
  Ten clicks across the turret in the state above erase three blocks and do nothing at all
  for the other seven — no block removed, no bill change, no message, and nothing to undo.

The cause is one line. Every verb on Design resolves its cell through the build-plane
inverse of iso §5.1, so a verb that is *about an existing block* is answered with the
coordinates of a hole in a plane the tester was not aiming at. Iso §5.2 already says what
should happen — "hover, click-to-inspect, focus-fire and the replay's joint locate address
the frontmost visible block under the pointer, wherever it is in the world" — and Run and
Replay do exactly that. Design is the screen that never got it, and it is the screen where
the eraser lives.

Why it went unnoticed: on Design the plane cell and the picked block coincide whenever the
tester is working *in* the section they are looking at, which is what the guided first run
(§7.2) opens on and what every worked example makes easy. The bug shows up the moment
someone turns the camera or reaches for a block one section over — which is the first thing
a tester does with a 2.5D view.

## 2. The rule

### 2.1 Inspect picks, on every screen

Iso §5.2 without the Design exception. Long-press (mobile §6.2), the long-press sweep
(mobile §6.3) and alt-, ctrl- or meta-click (mouse-gestures §2.6) all address **the
frontmost visible block under the pointer**, on Design exactly as in Run and Replay.

Over empty scene there is no block to name, and inspect falls back to the build-plane cell
the same click would have placed into. That is what Run already does, it keeps a sweep
continuous as the finger crosses a gap, and it is the honest answer to "what is here": the
cell that a placement would fill.

### 2.2 The eraser addresses the block under the pointer

**The eraser removes the block it picked.** Same pick as 2.1, same ray, same rules. Over
empty scene it removes nothing and changes nothing — including the undo stack, which never
receives an entry for an edit that did not happen.

### 2.3 Placement stays locked to the build plane

Iso §5.3 is unchanged for every palette entry that puts a block down: wood, stone, station,
depot, hatch. One click, one voxel, in the active cross-section and nowhere else.

### 2.4 Hover previews the cell the armed tool will act on

A mouse hover (mobile §6.3 — only a mouse has one) outlines the cell the *current* palette
entry would change: the build-plane cell under a placing tool, the picked block under the
eraser. The outline is the answer to "what will this click do", so it has to follow the
tool, or arming the eraser would leave the preview pointing at the wrong cell.

The translucent build plane of iso §5.3 keeps being drawn under both, because the section
is still where a placement lands and the tester still has to see which one it is.

### 2.5 Nothing peeled is addressable

The pick already skips cells the peel has taken out of the way (iso §6), so a wireframed
block between the camera and the build plane can be neither inspected nor erased. That is
the peel doing its job and not a gap in this rule: a block drawn as an outline is a block the
tester has asked to see *through*. Reaching it means moving the section with `[` and `]` or
the slice stepper, which is what those controls are for.

## 3. Why the eraser is not placement

Iso §5.3 gives one reason for locking placement to the plane, and it is a good one: "a
placement that resolved by picking would let a mis-click put a block a section away from the
one the tester meant, and §1.3's anti-blob measurements are measurements of what testers
*chose* to build."

That argument does not reach the eraser, on either half.

- **There is no ambiguity to protect against.** A new block has no position of its own until
  the click gives it one, so the projection being many-to-one is a real hazard: several
  cells sit under the pointer and only the plane rule says which. A block being erased
  already has a position, is already drawn, and is already the frontmost thing under the
  pointer. Picking it is not a guess resolved by convention; it is reading the answer off
  the screen.
- **The dataset argument runs the other way.** §1.3's measurements are of the design a
  tester chose. Today the eraser mostly refuses to fire, so the recorded design is the one
  the tester could reach through a cross-section stepper, not the one they wanted. A verb
  that silently no-ops seven times in ten does not protect that dataset, it distorts it.

And a no-op is the worst of the available failures. Mobile §6.2 and touch-gestures §2.4
spend two rules on the principle that "silent, uncommanded edits are worse than a lost
gesture"; the inverse holds just as hard on a verb the tester *did* command. A wrong erase
costs one `z` — undo is unlimited (§3.1) and mouse-gestures §5 keeps it that way precisely
so a single-cell mistake costs nothing. Doing nothing at all costs the tester their model of
what the tool is.

## 4. What does not change

- **No `SimCommand` is added or removed**, so mobile §7.1 holds and a phone attempt still
  replays bit-identically in the desktop build and the headless runner. Inspect is still the
  `ViewCommand` it was; an erase is still an edit to the blueprint the editor holds.
- **The gesture set.** Nothing in mobile §6.2's table, mouse-gestures §2 or touch-gestures §2
  moves. This document changes which cell a verb resolves to, not which gesture means what,
  and not one threshold.
- **Focus-fire and the replay's joint locate**, which already picked (iso §5.2).
- **Placement**, per 2.3, and the peel, per 2.5.
- **The palette.** §3.1's rail keeps its six entries and its live bill; the eraser still
  costs nothing and still refunds by removing a block from the bill.

## 5. Tests this document requires

- A pick and a build-plane inverse over the same screen point, on a design whose frontmost
  block is *not* in the active section, disagree — and inspect takes the pick (2.1).
- Inspect over empty scene falls back to the build-plane cell (2.1).
- With the eraser armed, the edit target is the picked block; with any placing entry armed,
  it is the build-plane cell, over that same screen point (2.2, 2.3).
- The eraser over empty scene erases nothing and pushes nothing onto the undo stack (2.2).
- Erasing a block that is not in the active cross-section removes that block and only that
  block, and one `z` puts it back (2.2).
