# What the removal actually reached: corrections to the cross-section document

**Amends [`20260905-no-cross-sections.md`](20260905-no-cross-sections.md)** — its opening
supersession list, one measurement in its §1, one figure in its §2.2, two cross-references,
and the fourth bullet of its §5. **Nothing in its §2 or §3 changes**: the rule it set is the
rule that shipped, and no code moves because of this document except one test's citation.

It exists because that document named sections it had not read closely enough. A removal that
cites the wrong paragraph is worse than one that cites none: a reader who follows
`iso §9` out of it finds a controls table it claimed to have deleted in full, and a reviewer
working iso §10's must-not-regress list finds three items that the removal silently made
false. The specs are a history that has to keep resolving (`specs/README.md`), and a
correction is cheaper than a citation that lies.

References written **iso §n** point at
[`20260903-isometric-renderer.md`](20260903-isometric-renderer.md), **no-sections §n** at the
document this one amends, **face-placement §n** at
[`20260905-face-adjacent-placement.md`](20260905-face-adjacent-placement.md), **§n** at
*UI spec — P0 tester build*, and **mobile §n** at the mobile UI spec.

Code and tests cite this document as `no-sections-corrections spec n.n`.

---

## 1. The supersession list, corrected

no-sections' opening says it "supersedes §6 of the isometric renderer (the peel plane) and
**§9 of the same document (the flat developer view) in full**". The first half is right. The
second is wrong twice over, and this section replaces it.

### 1.1 iso §9 is a controls section, and most of it stands

iso §9 is *"Controls, and what happens to the flat view"*. It carries the binding table for
the whole renderer, and superseding it "in full" would take away bindings that are still
live: `q` / `e`, pan, zoom, fit, overlays 1–5, inspect, scrub, and the 44 × 44 CSS px
coarse-pointer target rule of mobile §8.1.

**What no-sections actually supersedes in iso §9** is exactly three things:

- the table row `build plane, and therefore the peel | [ ] | the section stepper and picker,
  unchanged`, and
- the paragraph beginning *"The flat cross-section becomes a developer diagnostic"*, and
- with it the sentence *"it costs nothing to keep"*, which was true while the section
  machinery stood for other reasons and is the whole reason the flat view had to go once it
  did not.

**Everything else in iso §9 stands as written**, including its retirement of the depth-view
spec's `v` toggle, which was already right and is now right for a second reason.

### 1.2 The `[` and `]` rows live in mobile §6.1, mobile §6.2 and iso §9

no-sections says it "removes the cross-section rows from mobile §6.1's control bar, mobile
§6.2's gesture table, and the keyboard tables of **§3.1 and iso §12**".

The first two are correct. The third names two documents that have no such table: **§3.1 is
*Design***, the screen description, and it carries a palette and a placement sentence but no
bindings; **iso §12 is *Tests this spec requires***. The third table is **iso §9's**, per 1.1.

### 1.3 UI §2's scope row goes too, and was never named

§2's scope table carries the row `Side-on cross-section | **[in]** | Demoted to a developer
diagnostic by that document`. With the flat view deleted, that row is **[out]** and the
demotion it records is finished rather than pending. no-sections should have said so and did
not.

### 1.4 iso §10 loses one invariant and keeps two in amended form

This is the omission that matters most, because iso §10 is the list a reviewer is meant to
work through and try to break. Three of its seven items no longer say anything true:

| iso §10 item | What it said | Now |
|---|---|---|
| 1 | "Every overlay draws in both the tester's view and the dev flat view, from the same layer registry, with the same shortcuts. No overlay is projection-specific." | **Amended.** The registry half stands and is still worth breaking. The flat-view half is void: there is one projection, so "projection-specific" has nothing to range over. |
| 3 | "The stress overlay stays anchored to the build plane: the joints touching the active section and no others, in every yaw." | **Withdrawn**, and replaced by no-sections §2.4: every joint, in every yaw. |
| 5 | "Yaw, zoom, peel and build plane live in `ViewState`; the toggles are `ViewCommand`s… A phone attempt, a yaw-2 attempt and a dev-flat attempt replay to the same final state hash." | **Amended** to yaw and zoom, and to the first two attempts. The invariant it protects — no view value reaches sim state — is unchanged and is the one that matters. |

Items 2, 4, 6 and 7 stand untouched.

### 1.5 The peel metrics are iso §11, not iso §10

no-sections §4 opens *"iso §10 asks 'peel-plane moves per attempt, in Design and in Run
separately'"*. Those two rows are in **iso §11, *Metrics***. §4's substance — that both rows
are withdrawn with the control they measured, and that "do testers dig?" replaces them — is
unaffected; only the number is wrong.

---

## 2. The measurements, corrected

### 2.1 What the removal cost, measured rather than estimated

no-sections §1's third bullet claims **"roughly a fifth of `render/`"**. It is an
overstatement, and the list under it spans three directories rather than one. The measured
figures, from the commit that implemented it:

| | Before | After | Out |
|---|---|---|---|
| `src/render/*.ts` | 5986 | 5268 | 718 lines, **12%** |
| `src/ui/*.ts` | 6027 | 5701 | 326 lines |
| `src/ui/styles.css` | 1365 | 1262 | 103 lines |
| Whole commit, `src/` and `test/` | | | 1912 deleted against 400 added |

So: **an eighth of `render/`, and about twelve hundred lines of `src/` net.** That is still
the argument the bullet was making — it is just the size the thing actually was, and a
number a reader can check is worth more than one they cannot.

### 2.2 The worked examples run to 45 blocks, not 43

no-sections §2.2 says "the worked examples run to 43 blocks". They run **21 to 45**:
`overreachingTurret` 21, `standardTurret` and `buriedStationTurret` 43,
`severedDepotTurret` 45. The sentence's point — that a wall is two or three cells thick at
the point a tester wants through — is unchanged at either end of that range.

---

## 3. The test list, corrected

no-sections §5's fourth bullet asks for:

> Every joint of a design appears in the stress overlay's draw, not only those of one
> section (2.4).

**That test cannot be written under this project's own rules, and it is not needed.**

It cannot be written because `StressLayer` reaches its decision only through
`CanvasRenderingContext2D`. Driving it headlessly means a stub of a DOM type cast in through
`as unknown as`, and `CLAUDE.md` rules out both the cast and the stub — the suite injects
implementations of *our* interfaces, which is what the C++ tests will do, and a canvas is not
one of them.

It is not needed because **the compiler now enforces the claim outright**. A section filter
needs a section to filter on, and `ViewState` no longer has one: there is no `slice` field
for any layer to read. The old filter was `position.x === context.view.slice`, and that line
does not compile any more. A type error is a stronger guarantee than a test — it catches the
regression at the point someone writes it rather than at the point someone runs the suite —
so the requirement is met by construction and the bullet asked for a weaker thing.

**The fourth bullet is replaced by:** *the view carries no section and no projection, so no
overlay can filter its marks by one (2.4, and no-sections §2.1 and §3).* That is what
`test/ui/Commands.test.ts` asserts, and §4 below is the one code change this document asks
for.

The other four bullets of no-sections §5 stand and are all satisfied.

---

## 4. Tests this document requires

One change, and it is a citation rather than a behaviour:

- `test/ui/Commands.test.ts`'s case *"leaves the view carrying no section and no projection"*
  cites this document's §3 as the requirement it discharges, and says in a comment that it
  stands in for the stress-overlay test no-sections §5 asked for, and why. A reader who
  follows that bullet out of the older document has to land somewhere.

No other test moves. No source file moves.
