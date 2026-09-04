# Mouse gestures — the rectangle goes

Amends *UI spec — P0 tester build* §3.1, whose placement sentence reads "Placement is
click-drag rectangles plus single-cell", and **supersedes §6 of**
[`20260904-touch-gestures.md`](20260904-touch-gestures.md), which said the desktop build was
unchanged in full. It is unchanged no longer. That document still governs the finger; this
one governs the mouse, and §2 below is the rule they now share.

References written **§n** point at the UI spec, **mobile §n** at the mobile UI spec,
**touch-gestures §n** at the document above, and **prototype §n** at the P0 prototype spec.

Code and tests cite this document as `mouse-gestures spec n.n`.

---

## 1. Why the mouse follows

Touch-gestures §1 kept drag-to-place on the mouse on the strength of three things a mouse
has and a finger does not: a hover preview of what the drag is about to do, pixel precision,
and a pan already bound elsewhere.

**The first of the three does not exist.** The build never draws the pending rectangle. Its
two corners are held in the app and handed to no renderer, so a mouse drag shows nothing at
all until the button comes up and a plane of blocks appears. The argument that spared the
mouse was resting on a feature that was never built, and the surprise the drag delivers is
the same surprise on both pointers — a tester finds out what the gesture meant by seeing what
it did.

Two more reasons to finish the job rather than to build the missing preview:

- **Two gesture models cost what two builds cost.** Mobile §2 refuses a mobile fork because
  "two code paths mean two answers per hypothesis and no way to tell a layout regression from
  a solver regression". Input is the same argument. A tester handed the link on a phone
  (§7.1) who later opens it on a laptop should not have to relearn the canvas.
- **The verb count falls.** §3.3 says "every extra verb dilutes the attribution", and the
  rectangle is the one verb in the editor that can change a design by more than the tester
  meant.

## 2. The rule: one gesture model, every pointer

### 2.1 Placement is single-cell

§3.1's placement sentence becomes: **Placement is single-cell.** One click, one voxel, on
every pointer. Undo and redo stay unlimited, and the live bill of materials §3.1 requires is
unaffected — it was already per-voxel.

### 2.2 A drag pans

On every pointer and every screen, as touch-gestures §2 already has it for the finger.

### 2.3 A press that does not move is a click

The threshold is mobile §6.2's **tap slop, 8 CSS px**, so one number governs both pointers.

There is no timeout on the mouse. Mobile §6.2's 250 ms tap timeout exists to separate a tap
from a long-press, and the mouse has no long-press verb to separate it from: a slow, still
click places, however long the button is held.

### 2.4 A press that moves performs no click action at all

No placement, no focus-fire, no inspect — the press became a pan and a pan is not a click.

This is correctness, not tidiness. Focus-fire is a logged `SimCommand` (§5.2), so a pan that
also focus-fired would write itself into the replay log and make an attempt disagree with its
own recording. Determinism is a requirement (prototype §4.5), and a view gesture that leaks
into the command log breaks it.

### 2.5 The modifier pans stay

Shift-drag and right-drag still pan. They are redundant under 2.2 and they are kept for the
reason touch-gestures 2.3 keeps two-finger drag: a tester who learned one must not find it
dead. A modifier press is a drag from the moment it begins — it never places, whether or not
it moves.

### 2.6 Alt-click still inspects, and it is a click

It obeys 2.3, so alt-drag pans and inspects nothing.

## 3. What is given up

Bulk placement, now on every pointer. The trade is the one touch-gestures §3 already made,
and it applies here for the same reason: prototype §1.2's loop is *fix the blueprint*, and a
fix is cells.

If mobile §8's telemetry shows testers running long click sequences, the answer is the same
armed rectangle tool touch-gestures §3 names — and it is a better tool for arriving now
rather than then, because it will serve one gesture model instead of grafting a second one
back onto half the pointers.

## 4. Caption table

Both columns of two rows change. The generated caption keeps mobile §6.4's one-table rule.

| Verb | `fine` | `coarse` |
|---|---|---|
| `place` | click to place | tap to place |
| `pan` | drag to pan, or shift-drag | drag to pan, or two fingers |

## 5. What does not change

Undo and redo, unlimited, which is what makes a wrong single-cell click cost nothing. The
palette, the live bill, the validation panel and every overlay. No `SimCommand` is added or
removed, so mobile §7.1 holds: a phone attempt and a desktop attempt still produce the same
kind of log, and now they produce it from the same gestures.
