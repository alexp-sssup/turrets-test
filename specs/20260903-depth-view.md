# 2.5D depth view — seeing inside a multilayer turret

> **Superseded by [20260903-isometric-renderer.md](20260903-isometric-renderer.md). Do not
> implement against this document.** It is kept because it is where the peel rule of §3 and
> the rejected alternatives of §3.1 were first argued, and the isometric spec inherits both.
> What it got wrong is the projection: a cabinet oblique with a 0.42-cell offset gives the x
> axis a place on screen without making the scene a scene, so five sections still read as
> five stacked cards and §1.3's anti-blob question stays unanswerable. Its optional-additive
> framing is withdrawn with it — there is one tester-facing projection, and it is isometric.

Layers on top of *UI spec — P0 tester build*, and amends its §2. Section references written
`UI §n` point at that document; `§n` alone points at this one.

Tags: **[in]**, **[stub]**, **[out]** as before.

---

## 1. Why this document exists

UI §2 chose a side-on 2D cross-section for the tester build, and the reason it gave still
holds: *interiors are visible for free, there is no camera to teach, and the renderer fits
in a prototype*. Nothing here withdraws that.

What it did not answer is the question a five-wide turret asks the moment a tester builds
one: **which section am I looking at, and where is it relative to the rest of the thing?**
The flat view answers "what is in cross-section x" perfectly and answers "what shape is my
turret" not at all. Today the other sections are ghosted flat behind the drawn one, all at
the same place on screen, so four sections of wall and one section of corridor are the same
grey smear. A tester who cannot tell a corridor from a wall cannot read the resupply model
that UI §2 says the cross-section exists to serve.

This document adds a **second, additive view mode**: a fixed oblique projection that gives
the x axis a place on screen. It is 2.5D in the strict sense — one projection, no camera,
no rotation, no depth buffer, the same layer registry — and it is **not** the default. The
flat cross-section stays the view a session opens in, because UI §7.2 puts the tester in the
loop rather than in a viewer, and a tester who has learned nothing yet should not have to
learn a projection first.

**Amendment to UI §2.** The headline decision now reads: the tester build renders a side-on
2D cross-section **by default**, with an optional fixed-camera 2.5D depth view over the same
scene. The seam argument in UI §2 and UI §8 is unchanged — going to real 3D still replaces
`render/` and editor placement and still does not touch `sim/` or `structure/`. This
document is a renderer change and an input binding. It adds no `SimCommand` (UI §5.2).

---

## 2. The projection

**[in]** One fixed oblique (cabinet) projection. Screen x is still the lane axis z, screen y
is still world y, and the third axis x is drawn as a constant screen offset per section:

```
screenX(x, z) = base(z) + RUN  * (x - active)
screenY(x, y) = base(y) - RISE * (x - active)
```

with `RUN = RISE = 0.42` voxels per section, so a section step is a 45° move up and to the
right of about four tenths of a cell. Larger x is **farther from the viewer**; the section
with the smallest x is nearest.

Four properties this form is chosen for, each load-bearing:

1. **It is linear and has no camera state.** Two constants and the active section index.
   There is nothing for a tester to orbit, nothing to reset, and nothing to persist.
2. **The offset is measured from the active cross-section**, not from the world origin, so
   `screenX(active, z)` is exactly the flat view's `screenX(z)`. **Toggling the mode does
   not move the cross-section the tester is working in**, and neither does stepping to
   another section: the section under the cursor stays put and the rest of the turret slides
   around it.
3. **The inverse is still exact.** Screen-to-world resolves in the active section's plane
   and nowhere else, so a click still addresses one unambiguous cell. Placement, inspection
   and the predict hover keep working with no picking, no ray, and no ambiguity about which
   of five stacked cells was meant. See §5.
4. **`RUN = RISE`** means the depth axis is visibly neither the lane axis nor the vertical
   axis. A shallower angle would read as a lane offset, and that is the one confusion a
   projection like this can create.

A cell is drawn as a cabinet cube: the front face is the square the flat view already draws,
the top face is drawn when the cell above is empty, and the right face is drawn when the
cell at z+1 is empty. Faces are shaded by **luminance off the material colour**, not by hue
(§4).

---

## 3. Seeing inside: the peel rule

This is the question the mode exists to answer, and it gets a rule rather than a slider.

> **The active cross-section is never occluded. Everything nearer the viewer than the active
> section is peeled to an outline; everything behind it is drawn solid and dimmed with
> distance.**

Sections are composited back to front — farthest first, nearest last — with one of three
treatments, decided only by a section's signed distance from the active one:

| Section | Treatment | Why |
|---|---|---|
| Behind the active one (x > active) | Solid, material-coloured, faces shaded, alpha falling with distance, kind rings kept, glyphs and pips dropped | This is the interior. It has to be legible *through* the holes in the active section — that is the whole read — but it must never compete with the section being edited. |
| The active one | Full treatment, exactly as the flat view draws it | The tester's working plane. Identical pixels in both modes, so nothing learned in one mode has to be relearned in the other. |
| In front of the active one (x < active) | Outline only, no fill, alpha falling with distance | The cutaway. These are the sections that would hide the working plane, so they are the ones that get removed — but they are *shown as removed*, not deleted, because "there are two more walls in front of this" is information. |

The peel plane is **not a separate control**. It is the active cross-section, which the
tester already moves with `[` and `]` and with the section stepper. Stepping toward the
viewer peels one more wall off; stepping away puts one back. There is one depth control in
the build and it is the one that was already there.

### 3.1 Alternatives considered, and why not

- **Uniform transparency (x-ray).** Every section at 50% alpha. Rejected: alpha composites
  multiply, so a cell's final colour depends on how many sections happen to sit behind it.
  That breaks the one non-negotiable in UI §4 — utilization must be readable, and readable
  in greyscale — by making luminance a function of scene depth rather than of the value.
- **An orbit camera.** Rejected by UI §2's own argument, which this document does not get to
  spend: testers spend attention on the structure or on the controls, not both. A camera also
  makes "which cell did I click" a picking problem, and picking ambiguity in the editor would
  contaminate §1.3's anti-blob measurements with mis-clicks.
- **An exploded view**, sections fanned apart by a gap. Rejected: it reads well as a
  diagram and badly as a workspace, because the corridor a runner walks is exactly the
  continuity that exploding destroys.
- **A depth slider independent of the active section.** Rejected: two controls that both
  mean "how deep" is one control too many, and the second one is only ever set to the value
  the first one already has.

---

## 4. What must not regress

The depth view is additive, and these are the invariants that make "additive" true rather
than aspirational.

1. **Overlays compose unchanged.** Every overlay in UI §4 draws in both modes, from the same
   layer registry, with the same shortcuts. No overlay is depth-only and none is flat-only.
2. **Overlay marks draw at their own section's depth**, so a stress bar sits on the joint it
   describes rather than on a projection of it. Marks are drawn after the base composition
   and are therefore never occluded by the peel or by a cube face.
3. **The stress overlay stays anchored to the active cross-section.** It draws the joints
   touching the active section and no others, in both modes. The hypothesis-critical overlay
   answers the same question with the same marks whichever mode it is read in.
4. **Nothing encodes on hue.** Depth is encoded as alpha and as outline-versus-fill; the
   cube faces are shaded by luminance off the material's own colour. The utilization bands of
   UI §4 keep their ramp *and* their hatch patterns untouched, and remain readable in
   greyscale in both modes.
5. **The simulation does not know this exists.** The mode is `ViewState`, the toggle is a
   `ViewCommand`, and neither is logged. A phone attempt, a flat attempt and a depth attempt
   replay to the same final state (UI §5.1).

---

## 5. Controls

**[in]** One new binding and no new verbs.

| Verb | Key | Coarse pointer |
|---|---|---|
| flat / 2.5D | `v` | a toggle in the field control bar |
| cross-section, and therefore the peel plane | `[` `]` | the section stepper and picker, unchanged |

Everything else is unchanged, including pan, zoom and fit. Specifically:

- **The pointer always addresses the active cross-section**, in both modes. A click lands in
  the plane the tester is working in even when four other sections are drawn over it.
- **`fit` frames the depth spread**, so a turret that grew a section does not fall off the
  edge. The ground line keeps the anchor of UI §2's framing rule.
- **The section readout names the peel** when the depth view is on: `x = 2 · 3 blocks · 2 in
  front`. A cutaway that a tester has not noticed is a cutaway that reads as a missing wall.

---

## 6. What the depth view can show that the flat view cannot

Stated so the mode can be judged rather than admired.

1. **A corridor as a corridor.** The resupply model of the prototype spec §4.3 is the thing
   UI §2 justified the cross-section with. A runner's route that steps sideways in x is a
   dashed off-slice leg in the flat view; in the depth view it is a route that visibly goes
   round the back of a wall.
2. **Joints normal to the cross-section.** The flat view draws a joint between (x, y, z) and
   (x+1, y, z) as a small square at the cell centre, because in that projection it has no
   extent — and says so in as many words. In the depth view the same joint is drawn at the
   midpoint between the two sections it joins, which is a place on screen. The lateral
   bracing of a wide turret becomes visible for the first time.
3. **Shape, and therefore blob-ness.** §1.3's anti-blob question is partly about wasted
   interior volume, which is a three-dimensional property that a single section cannot show.
   UI §2 flags this as the risk it accepts; the depth view narrows it without claiming to
   close it, because a fixed camera still cannot show what is behind the turret.

---

## 7. Performance

The budget of UI §6 is unchanged and applies to both modes: 60 fps sustained, and the
solver, not the renderer, is what §1.1 is measuring.

- Fill cost is bounded by construction. Sections in front of the active one are stroked, not
  filled; sections behind draw at most three quads per cell and no text.
- The composition is a single back-to-front pass with no depth buffer, no sorting beyond the
  section index, and no per-cell allocation.
- The dev readout already reports render p95 (UI §6) and it is the number that decides this.
  If the depth view cannot hold the budget on the mobile profile of the mobile UI spec §8.3,
  the mode is capped there — **the timestep is never touched**, per that document's rule.

---

## 8. Metrics

Two fields join the readability block of UI §7.3, for the same reason every field there
exists: testers cannot tell you why a view failed them.

| Metric | Question |
|---|---|
| Seconds spent in the depth view, per attempt | Was the mode used at all, or was the flat view enough? |
| Whether the depth view was opened before a run | Is it a diagnosis tool or a sightseeing one? |

Read them against `sameJointFailedAgain` (UI §7.3). The mode earns its place if attempts
that used it fix the joint more often than attempts that did not, and does not if it is only
ever opened after the turret has already fallen over.

---

## 9. Seams

- **Real 3D** replaces the projection and the picking, and nothing else. The peel rule of §3
  survives it as a cutaway mode; the section index becomes a clipping plane.
- **A new overlay** is still one `Layer` registration, and it gets the depth view for free as
  long as it draws through the projection's depth-aware pair rather than assuming the active
  section.
- **A second structure on the field** (UI §8) needs no change here: it is more cells in the
  same sections.

---

## 10. Risks

- **A second mode is a second thing to explain.** Mitigated by making it strictly additive,
  by pinning the active cross-section across the toggle, and by leaving flat as the default —
  but if tester sessions show the toggle being found and then abandoned, the honest reading is
  that the flat view was sufficient and this is scope that P1 should spend on real 3D instead.
- **Oblique projection has no perspective**, so a tall turret and a deep one can project to
  similar silhouettes. The section readout and the peel count are the ground truth; the
  picture is not.
- **The depth cue is alpha**, and alpha is the one channel a projector or a bright room eats
  first. The outline-versus-fill split is carried alongside it precisely so the mode does not
  rest on alpha alone.
