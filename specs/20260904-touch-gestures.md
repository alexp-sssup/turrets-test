# Touch gestures — one finger pans

Amends [`20260903-mobile-ui.md`](20260903-mobile-ui.md): replaces the one-finger-drag row of
its §6.2 gesture table, and the `place` and `pan` phrases its §6.4 caption is generated from.
References written **mobile §n** point at that document, **§n** at *UI spec — P0 tester
build*, and **prototype §n** at the P0 prototype spec.

Code and tests cite this document as `touch-gestures spec n.n`.

---

## 1. Why the row changes

Mobile §6.2 gives one-finger drag two opposite meanings on the same canvas: *pan* in Run and
Replay, *place a rectangle* in Design. Nothing about the gesture says which one is armed —
the tester has to remember which screen they are on — and the two outcomes are not
symmetrical:

- **A wrong pan costs a pan back. A wrong drag costs an edit.** It writes blocks into the
  blueprint and spends material budget. Mobile §6.2 already carries two rules whose whole
  purpose is to stop uncommanded edits: a drag that becomes a pinch places nothing, and
  `pointercancel` discards the placement. Both protect rare cases. The common case — a
  tester who wanted to look at the other side of the turret — was shipped as a feature.
- **It is a plane, not a patch.** The rectangle fills the whole cross-section between its
  two corners, so one thumb-swipe across a 390 px field can lay down an entire slice of the
  design.
- **It fires on the first thing a tester does.** §7.2 opens the guided first run mid-loop on
  a deliberately flawed worked example, stress overlay on, meant to be *read* before it is
  touched. The first instinct on a canvas you have been told to study is to move it.

How it got specified this way: the row was lifted across from the fine-pointer column, where
it is correct. A mouse drag has a hover preview of what it is about to do, pixel precision,
and a pan already bound to shift-drag and right-drag. A finger has none of the three. Mobile
§6.3 conceded the first of them — "there is no hover" — without noticing that it undercut the
row above it.

## 2. The rule

**A one-finger drag pans, on every screen, Design included.**

### 2.1 The rectangle is a mouse verb

On touch the only gesture that writes to the blueprint is the **tap**, and it writes exactly
one cell. There is no touch gesture that edits more than one cell at a time.

### 2.2 Nothing else in the table moves

Tap, long-press, long-press-then-drag (mobile §6.3's sweep), two-finger drag, pinch and
double-tap keep the meanings mobile §6.2 gives them, on both screens. The thresholds table is
untouched.

### 2.3 Two-finger drag still pans

That is a redundancy on purpose, not one to tidy away. A tester who learned two-finger pan in
Run must not find it dead in Design, and the recognizer already emits it.

### 2.4 The cancel rules survive, with less to cancel

Mobile §6.2's "a drag that becomes a pinch places nothing" has no placement left to discard
on touch; it remains as *a drag that becomes a pinch stops panning and starts zooming*, which
is what the recognizer already does. `pointercancel` still discards the gesture in flight,
including the selection a long-press made. Neither rule is removed.

## 3. What touch gives up, and why that is affordable

Bulk placement, on touch only. That is a real loss and it is the right one to take:

- Mobile §1's deliverable is that **the whole loop is completable with one thumb**. The
  loop's edit step is prototype §1.2's *fix the blueprint* — move a station, sink a depot,
  brace a joint. Those are cells, and tap places cells.
- §7.2 starts every tester on a worked example rather than an empty pad, so authoring a
  43-block turret by thumb was never the phone's job.

If mobile §8's `gestureCounts` shows testers running long tap sequences — trying to author
anyway — the answer is an explicitly armed rectangle tool, a chip in the field control bar
that the tester turns on. This document deliberately does not spend that now: a mode the
tester chooses is a different and safer thing from a mode they discover by accident, and it
is not worth building until the telemetry says someone wants it.

## 4. The split is by pointer type, not by device class

This rule attaches to the split mobile §3.2 already makes — `pointerType === "mouse"` goes to
the mouse handlers, everything else goes to the recognizer — and **not** to mobile §3.1's
`coarse` / `fine` viewport probe.

The consequences are the intended ones. A mouse plugged into a tablet keeps drag-to-place
even though the viewport probes `coarse`. A stylus does not get it: a pen has precision but
no hover-while-down and no modifier key, so it belongs with the finger. And the tablet with a
keyboard case that mobile §3.2 is written for keeps both, each behaving as itself.

## 5. Caption table (mobile §6.4)

Two rows of the hint table change. The `fine` column is untouched.

| Verb | `coarse` phrase |
|---|---|
| `place` | tap to place |
| `pan` | drag to pan, or two fingers |

## 6. What does not change

The desktop build, in full. A mouse drag still places a rectangle, shift-drag and right-drag
still pan, alt-click still inspects, and the fine-pointer caption still reads as it did. No
`SimCommand` is added or removed, so mobile §7.1 holds and a phone attempt still replays in
the desktop build.
