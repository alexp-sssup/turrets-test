# Mobile UI spec — touch and small screens

Extends *UI spec — P0 tester build*. References written **§n** point at that document;
references to *Prototype spec — P0 "One Turret, One Lane"* are written **prototype §n**.

Code and tests cite this document as `mobile UI spec n.n`.

Tags: **[in]**, **[stub]**, **[out]**, as in §3.

---

## 1. What this document changes

§3 lists one row as out of scope:

> | Touch / mobile layout | **[out]** | Desktop, mouse + keyboard only |

That row becomes **[in]** and this document is the rule behind it. Nothing else in §3
changes: the screens, the loop, and the four overlays are the same screens, the same loop
and the same overlays on a phone.

The reason to spend the budget is the same reason §1 gives for spending it on the overlays.
Two of P0's three hypotheses live in the UI, and both are hypotheses about *people*:
prototype §1.1 asks whether the solver is readable, prototype §1.2 asks whether
replay-diagnose-fix is engaging. Testers who will answer those questions are recruited by
sending them a link (§7.1, one URL, no install), and a link sent to a person arrives on
whatever they are holding. A build that requires them to be at a desk does not get a
smaller sample; it gets a sample selected for having been at a desk when the link arrived.

So this is a reach problem, not a polish problem, and it is bounded: the deliverable is
that **the whole loop is completable with one thumb on a 390 CSS px viewport**, at the same
legibility the desktop build has.

---

## 2. Headline decision: one build, one layout, no mobile fork

**There is no mobile build.** There is one URL serving one bundle, and the layout,
the hit targets and the input hints respond to the viewport and the pointer that
arrived with it.

The alternatives were considered and rejected:

- *A second, cut-down mobile screen set.* Two code paths mean two answers per hypothesis
  and no way to tell a layout regression from a solver regression. It also doubles the
  surface that has to keep up with every later spec change.
- *A wrapper or native shell.* Breaks §7.1 the moment a tester has to install something.
- *Refuse small screens with a "please use a desktop" gate.* This is the status quo by
  omission, and it is the sampling bias described above, made explicit.

The seam this leans on already exists. §5.2 splits input into logged `SimCommand`s and
unlogged `ViewCommand`s, and every gesture in this document resolves to one of the commands
that split already defines (7.1). A phone therefore produces a command log that is
indistinguishable from a mouse's, which is what keeps a phone attempt replayable in the
desktop build and in the headless batch runner.

---

## 3. Device classes

Layout is chosen from the viewport, and hit-target size and input hints are chosen from the
pointer. These are two separate questions and conflating them is how a touchscreen laptop
ends up with no keyboard hints.

### 3.1 Layout modes **[in]**

| Mode | Condition (CSS px) | Layout |
|---|---|---|
| `Wide` | width ≥ 1024 | Today's layout, unchanged: panels docked right at 372 px |
| `Medium` | 640 ≤ width < 1024 | Panels docked right at 300 px, shell condensed (4.2) |
| `Compact` | width < 640 | Single column, field first, panels in a sheet (4.3) |

Orientation is not a fourth mode. It is a property read inside `Compact`, because a phone
in landscape is 360 px tall and cannot stack (4.4).

The classifier is a pure function of `(widthPx, heightPx, coarsePointer)` and lives in a
class with no DOM reference so it can be tested headlessly (7.2). Breakpoints are on the
*viewport*, not on the device: a desktop window dragged narrow gets the `Compact` layout,
and that is the intended behaviour and the way this gets tested during development.

### 3.2 Pointer kind **[in]**

`coarse` when `(pointer: coarse)` matches, `fine` otherwise. It selects:

- minimum hit-target size (8.1),
- which input hints the field caption shows (6.4),
- whether the predict overlay reads hover or the selected cell (6.3).

It never disables anything. **Both input modalities stay live in every mode.** A coarse
pointer does not remove the keyboard shortcuts, and a fine pointer does not remove the
on-screen controls — a tester on a tablet with a keyboard case is one person with two hands,
and a build that picks one for them is wrong twice.

**User-agent strings are not consulted, anywhere, for anything.**

---

## 4. Layout

### 4.1 The rule that ranks the rest

The field is the subject. Every layout below is derived from one priority order, and when
space runs out it is spent from the bottom of this list up:

1. the cross-section (the canvas),
2. the phase, budget and margin readout,
3. the overlay switcher,
4. the panel that answers the current screen's question,
5. the dev readout.

### 4.2 Shell, condensed **[in]**

`Medium` and `Compact` condense the shell from two rows to one scrollable row:

- `phase`, `material`, `crew` and `margin` keep their labels and values; the sub-lines
  (`n left`, `2g / 1r / 1h`, `load factor`) drop in `Compact`.
- The session id moves into the dev readout, since §7.1 needs it quotable, not prominent.
- The overlay switcher moves to a control bar pinned to the field's bottom edge (6.1),
  where a thumb is, rather than the top of the screen, where it is not.
- The dev readout collapses to a single chip showing the worst of solver p95 / render p95,
  which expands to the full §6 readout on tap. It stays on by default: §6's argument that a
  tester's "it stuttered" must arrive with numbers is *stronger* on a phone, not weaker.

### 4.3 Compact, portrait **[in]**

One column, in this order: condensed shell, banner, field, field control bar, panel sheet.

- The field is at least `240 px` tall and at most `55 dvh`, and it is never zero-height
  behind an open sheet.
- The **panel sheet** holds the panels that the docked rail holds in `Wide`. It has exactly
  two states — *collapsed* (tab bar only, 48 px) and *open* (fills the stage below the
  field) — and no drag-to-resize: three snap points and a fling gesture are a physics
  problem this prototype has no reason to own.
- One tab bar selects one panel group at a time. The groups are the existing panels, not
  new ones: Design → `palette` / `bill` / `validation` / `inspector`; Run and Replay →
  `wave` / `stations` / `depots` / `crew` / `lane`; Replay adds `chain`.
- The tab bar badges a group when it has something the tester needs to see: a violation
  count on `validation`, a dry or no-path station count on `stations`. §3.2 gives dry and
  no-path "the loudest treatment in the whole build", and a panel hidden behind a tab is
  the quietest place in it, so the badge is not decoration — it is that requirement,
  re-stated for a layout where the panel is not always visible.
- Viewport height uses `dvh`, so a phone browser's collapsing toolbar cannot leave the
  canvas cropped or the sheet under the address bar. Safe-area insets are respected on all
  four edges (`env(safe-area-inset-*)`); nothing interactive sits under a notch or a home
  indicator.

### 4.4 Compact, landscape **[in]**

At 360 px of height there is no room to stack, so the sheet becomes an edge drawer:

- The field owns the whole stage.
- The panel sheet is a right-edge drawer, 300 px wide, overlaid on the field, dismissed by
  tapping the field. The field does not reflow when it opens — a design that jumps under
  the tester's finger costs more than the 300 px does.
- The field control bar (6.1) stays pinned to the bottom edge, above the drawer.

### 4.5 Medium **[in]**

Panels stay docked at 300 px with the condensed shell. The slice stepper (6.2) replaces the
per-column strip whenever the strip would not fit on one row, which is a width question, not
a device question, and therefore applies in `Wide` too.

---

## 5. What is not allowed to change

Stated as prohibitions because each one is a thing a mobile layout is normally tempted to do:

- **No panel is cut.** The validation panel, the per-station logistics readout and the
  failure chain are the deliverable (§1, §3.1, §3.3). They may be behind a tab; they may not
  be absent, abridged, or "available on desktop".
- **No overlay is cut**, and the stress overlay keeps its hatch bands and its key. §4's
  greyscale-readable requirement is unchanged and unconditional.
- **The grid stays 48×48** (§6). A smaller grid on a phone would mean phone testers and
  desktop testers were not answering the same question.
- **The dev readout stays on** (4.2).
- **Numbers stay exact.** The mono readouts keep their precision; a phone gets fewer
  characters per line, not fewer digits.
- **Determinism is untouched.** No gesture writes to sim state except through an existing
  `SimCommand` (7.1).

---

## 6. Input

### 6.1 Every verb is reachable without a keyboard **[in]**

This is the one hard requirement of the document. Today's verbs and where they go:

| Today | Keyboard | On-screen, `Compact` |
|---|---|---|
| Overlay 1–5 | `1`–`5` | Overlay row in the field control bar, active one named |
| Cross-section | `[` `]` | Slice stepper (6.2) |
| Undo / redo | `z` / `y` | Buttons in the field control bar during Design |
| Pause | `space` | Pause button in the control bar, visible with the sheet collapsed |
| Frame step | `,` `.` | `◀◀` / `▶▶` beside the scrub bar |
| Deselect | `Escape` | Close control on the inspector |
| Inspect a cell | alt / ctrl-click | Long-press (6.2) |
| Focus fire | click an attacker | Tap an attacker |
| Note box | hotkey (§7.4) | Button in the dev chip's expanded readout |

The keyboard bindings all keep working. Nothing is *moved* off the keyboard; the on-screen
controls are added alongside.

### 6.2 Gestures **[in]**

The verb set does not grow. §3.2's argument — "every extra verb dilutes the attribution" —
is the reason this table is short:

| Gesture | Design | Run / Replay |
|---|---|---|
| One-finger tap | place a single cell | focus-fire the attacker under the tap, else inspect the cell |
| One-finger drag | place a rectangle | pan |
| Long-press | inspect, place nothing | inspect |
| Long-press then drag | sweep the inspected cell (6.3) | sweep the inspected cell |
| Two-finger drag | pan | pan |
| Pinch | zoom | zoom |
| Double-tap | fit the design to the viewport | fit |

Thresholds, fixed so they can be tested rather than felt:

| Name | Value |
|---|---|
| Tap slop | 8 CSS px |
| Tap timeout | 250 ms |
| Long-press hold | 400 ms within tap slop |
| Pinch entry | second pointer down |
| Double-tap window | 300 ms, within 24 CSS px |

Two rules that are correctness, not feel:

- **A one-finger drag that becomes a pinch places nothing.** When a second pointer arrives,
  any in-progress placement is *cancelled*, not committed. A tester zooming in to look at a
  joint must not find a rectangle of stone where they put their fingers.
- **`pointercancel` cancels.** When the browser takes a gesture over — a back-swipe, a
  notification, a call — the placement is discarded. Silent, uncommanded edits are worse
  than a lost gesture.

`touch-action: none` applies to the canvas only. The panel sheet keeps native `pan-y`
scrolling, and the page keeps the browser's own pinch-zoom (8.2).

The **slice stepper** replaces the per-column strip when the strip does not fit:
`◀` / `x = 3 · 12 blocks` / `▶`, where the readout opens a full picker listing every
cross-section with its block count, so the "empty section reads as empty" property of the
strip survives the shrink.

### 6.3 There is no hover **[in]**

The predict overlay reads `ViewState.hover` today, and §4 requires that "predict is live
during a run" — an overlay that only makes sense in hindsight has already failed prototype
§1.1. A finger has no hover, so on a coarse pointer:

- predict reads the focus cell (selection wins, as `focusCell()` already resolves it),
- **long-press-and-drag sweeps**: while the finger is down past the long-press hold, the
  inspected cell follows it continuously, which is hover, performed deliberately. This is
  what keeps prediction *anticipatory* on a phone rather than retrospective.
- The inspector panel's copy stops saying "alt-click a cell" on a coarse pointer and says
  what that pointer can do.

### 6.4 Hints follow the pointer **[in]**

The field caption today reads `drag to place · shift-drag or right-drag to pan · wheel to
zoom · 1–5 overlays · [ ] cross-section`. On a coarse pointer it reads the gesture set from
6.2 instead. Hints are generated from one table so a binding cannot drift from its caption.

---

## 7. Architecture

### 7.1 The command split is load-bearing here too

**No new `SimCommand`. Not one.** Every gesture resolves either to an existing
`SimCommand` — the same `placeBlueprint`, `assign`, `focus`, `startWave` a mouse produces —
or to a `ViewCommand`. Pinch is `zoom`. Two-finger drag is `pan`. Long-press is `inspect`.
The slice stepper is `slice`. A tap on a station's load button is the `selectLoad` a click
already is.

One `ViewCommand` is added: `{ k: 'fit' }`, which frames the design in the viewport. It is a
view command, it is not logged, and it exists because a pinch-zoomed tester needs a way back
that is not "reload the page".

The consequence worth naming: an attempt flown on a phone exports (§7.5) a command log that
replays bit-identically in the desktop build and in the headless runner. If a gesture could
reach sim state, phone attempts would become a second, unverifiable population of data, and
the cheapest way to find that out is never.

### 7.2 New classes **[in]**

One class per file, in `src/ui/`, per the repository's layout rules:

| File | Responsibility |
|---|---|
| `LayoutMode.ts` | The mode enum and the pure classifier of 3.1. No DOM. |
| `Viewport.ts` | The only file that touches `matchMedia`, resize and orientation. Emits mode and pointer-kind changes. |
| `GestureIntent.ts` | The intent value type: kind enum plus plain numbers. |
| `GestureRecognizer.ts` | Pointer sequence → intents. Takes `(pointerId, x, y, timeMs)`; no `PointerEvent`, no DOM. |
| `PanelSheet.ts` | The sheet and drawer of 4.3–4.4: tab set, selected tab, collapsed state, badges. |
| `FieldControls.ts` | The field control bar: overlay row, slice stepper, transport, undo/redo. |

`App` wires them and remains the composition root. `render/` changes in exactly one place
(8.3). No framework is added — §5.5's reasoning is unchanged, and a sheet with two states
does not need one.

`scripts/check-boundary.mjs` is unaffected: every file here is under `src/ui/` or
`src/render/`, which are browser-side already.

### 7.3 Testability is why the recognizer takes numbers

`GestureRecognizer` and the `LayoutMode` classifier take plain values and return plain
values precisely so that `node:test` can drive them with no browser and no DOM shim. The
tests this document requires, in the same commit as the code:

- `test/ui/LayoutMode.test.ts` — every row and every boundary of 3.1, both pointer kinds.
- `test/ui/GestureRecognizer.test.ts` — every row of the 6.2 gesture table, every threshold
  in the threshold table at and either side of its value, and the two cancellation rules
  (pinch-cancels-placement, `pointercancel`-cancels) asserted as *no placement emitted*.

Named after the rule, citing the section, asserting exact values — as `test/` does already.

---

## 8. Performance and accessibility

### 8.1 Hit targets and text **[in]**

- Every interactive control is at least **44 × 44 CSS px** on a coarse pointer, including
  overlay keys, palette entries, tab bar items, slice stepper arrows and the transport
  buttons. Where the visual affordance is smaller, the *target* is padded to 44 px.
- Body text is at least 12 px on `Compact`; mono readouts are at least 12 px. Labels may
  stay at 10 px, because they are labels on values, not the values.
- The stress overlay's encoding is unchanged: perceptually ordered ramp plus hatch bands,
  readable in greyscale (§4). Small screens do not get a hue-only shortcut.

### 8.2 Browser zoom is not disabled **[in]**

No `user-scalable=no`, no `maximum-scale`. A tester who needs to magnify a joint gets to.
The canvas owns its own gestures via `touch-action` on the canvas element; the page does
not.

### 8.3 Budgets **[in]**

A phone has a slower core and up to nine times the fill cost per CSS pixel, so §6's table
gets a mobile column rather than a promise:

| Target | Desktop (§6) | Mobile |
|---|---|---|
| Render | 60 fps, 48×48 | 60 fps, 48×48 |
| Solver re-solve p95, ~1500 cells | < 16 ms | < 32 ms |
| Full failure-chain resolve | < 100 ms | < 250 ms |
| Cold load to first interaction | < 3 s | < 5 s on 4G |

To hold the render budget, `FieldRenderer.resize` caps the backing store: effective device
pixel ratio is `min(devicePixelRatio, 2)`, further reduced (never below 1) so the backing
store does not exceed **2.2 M pixels**. This is the one change in `render/`, and it is
invisible to the layers, which already never see the ratio.

When the solver cannot keep ahead of playback, the existing behaviour is the correct one and
must not be replaced by a mobile shortcut: sim lead grows and the run panel says playback is
waiting on a structural solve. **Playback degrades; the timestep does not.** Dropping ticks
or varying the step to make a phone feel smooth would break prototype §4.5 and with it the
replay.

### 8.4 The guided first run, on a phone **[in]**

§7.2's opening is unchanged and its constraints get sharper. The first session opens
mid-loop on a flawed worked example, the first action is to start wave 1, the replay opens
itself and the way out is *Fix this blueprint* with the failed joint selected and the stress
overlay on. On `Compact` this means:

- **Start wave 1** is reachable with the panel sheet collapsed. A tester whose first action
  is behind a tab has been put in the editor, which is the thing §7.2 exists to prevent.
- The replay opens with the `chain` tab selected and the first-failed-joint callout above
  the fold. It is the answer the tester came for (§3.3); it does not get scrolled to.
- *Fix this blueprint* lands on Design with the sheet open on `inspector` and the stress
  overlay already selected in the control bar.

---

## 9. Telemetry: segment by device, or read the results wrong

### 9.1 Fields added to the attempt record **[in]**

Per attempt, no tester action required, alongside §7.3's metrics:

| Field | Values |
|---|---|
| `layoutMode` | `wide` / `medium` / `compact`, at the moment the wave started |
| `pointerKind` | `fine` / `coarse` |
| `viewportW`, `viewportH` | CSS px |
| `devicePixelRatio` | as reported, before the 8.3 cap |
| `orientationChanges` | count during the attempt |
| `gestureCounts` | taps, drags, long-presses, pinches, double-taps |
| `keyboardUsed` | whether any shortcut fired |

`AttemptExport.FORMAT_VERSION` goes to `2`. The export stays one JSON file per attempt and
stays the replay format and the batch input (§7.5) — three uses, one artifact, unchanged.

### 9.2 The reporting rule **[in]**

Every metric in §7.3 is reported **segmented by `layoutMode`**, and a compact-device attempt
is never pooled into a single overall readability number.

`gestureCounts` and `keyboardUsed` exist to answer one question that pooling destroys: when
a `compact` tester never opens the stress overlay, was the overlay unreadable, or was the
control not where their thumb was? The first is a finding about the solver. The second is a
finding about this document. They have opposite consequences for the project and they are
indistinguishable without the counts.

---

## 10. Risk, stated plainly

**A phone can return a false negative on prototype §1.1.** §1 already names the failure mode
this project most needs to avoid: "a correct solver with an illegible heatmap returns a
false negative on the most expensive system in the project." A 5-inch screen adds a second
path to that same false negative — a correct solver with a *legible* heatmap, read on a
screen too small to hold a 48×48 cross-section and its key at once, fails the hypothesis for
a reason that has nothing to do with the solver.

This document cannot remove that risk; 9.2 is what makes it visible. Read the compact
segment as a question about this document, and the wide segment as the question about the
solver. If they disagree, the small screen is the finding.

**Reach and depth are traded here, and the trade is accepted.** More testers, some of whom
are reading the hypothesis-critical overlay on the worst screen they own. The alternative —
fewer testers, all at desks — is not the safe option, it is the same bias with no field in
the export naming it.

---

## 11. Out of scope

| Item | Status | Note |
|---|---|---|
| Native or wrapped app | **[out]** | Breaks §7.1 at the install step |
| Offline / service worker | **[stub]** | Static files already cache; no offline story is promised |
| Orientation lock | **[out]** | Both orientations are laid out (4.3, 4.4) |
| Haptics, sound, animated transitions | **[out]** | §3: legibility over fidelity, everywhere |
| Drag-resizable sheet, snap points, fling | **[out]** | Two states (4.3) |
| New editing verbs — rotate, copy, paste, gesture macros | **[out]** | §3.1 keeps these out on every device |
| Multi-touch focus fire on several attackers | **[out]** | `focus` takes one target (§5.2) |
| Variable playback speed | **[out]** | §3.2: 1× only, on every device |
| A custom on-screen keyboard for the note box | **[out]** | The platform's keyboard is the platform's job |
| Tuning dial editing on a phone | **[out]** | `data/` hot-reload stays a dev-machine affordance |

---

## 12. Build order

Ordered so that each step is verifiable when it lands, and so that the loop is never
half-reachable on a phone:

1. `LayoutMode` and `Viewport`: modes classified, breakpoints live, `dvh` and safe-area
   insets applied. Desktop layout unchanged at `Wide`.
2. `Compact` and `Medium` layout: condensed shell, field-first column, `PanelSheet` with
   tabs and badges, landscape drawer. Still mouse-driven.
3. `GestureRecognizer` and its tests: taps, drags, long-press, pinch, double-tap, and both
   cancellation rules — driven by unit tests before it is wired to a canvas.
4. Gestures wired through the dispatcher, `ViewCommand.fit` added, `touch-action` scoped.
   **The loop closes here**: from this step a tester with no keyboard can design, fly,
   replay and fix.
5. `FieldControls`: overlay row, slice stepper, transport, undo/redo, dev chip — 6.1's table
   completed and the keyboard made optional rather than assumed.
6. Coarse-pointer predict: focus-cell reading and long-press sweep (6.3), so prototype §1.1's
   anticipation claim holds on a phone.
7. Backing-store cap (8.3) and the telemetry fields (9.1), export format 2.

Step 4 is the milestone worth defending, for the reason §9 gives about its own step 4:
before it, none of this has been tested by anyone holding a phone.
