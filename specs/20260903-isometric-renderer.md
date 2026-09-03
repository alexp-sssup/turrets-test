# Isometric 2.5D renderer

Layers on top of *Prototype spec — P0 "One Turret, One Lane"* and the *UI spec — P0 tester
build*. Section references written `UI §n` point at the UI spec, `P0 §n` at the prototype
spec, and `§n` alone at this document.

**Supersedes [`20260903-depth-view.md`](20260903-depth-view.md)** in full, and **amends UI §2
and the screen table in UI §3.** Tags: **[in]**, **[stub]**, **[out]** as before.

---

## 1. Why this document exists

The tester build renders a side-on 2D cross-section, and the depth view added a fixed
oblique mode over it. Both were argued from cost, and both arguments were sound about cost.
Neither was argued from **transfer**, and that is the argument that decides the renderer.

P0 exists to answer three hypotheses (UI §1): whether the solver is *readable*, whether the
replay-diagnose-fix loop is *engaging*, and whether arcs and occlusion produce *anti-blob*
pressure. Every one of them is a claim about what a player perceives. A perceptual claim
measured in a projection the game will never ship is not a weak answer to those questions;
it is an answer to different questions:

- The **flat cross-section** measures whether a tester can read an engineering drawing of
  one slice. Nobody will ever play that. A turret in the flat view has no silhouette, no
  mass, no visible thickness, and no relationship between what a gun can see and what the
  tester can see.
- The **oblique depth view** measured the same drawing with the x axis nudged 0.42 of a cell
  up and to the right. It fixed "which section am I in" and nothing else. Sections read as
  stacked cards because a cabinet projection with a four-tenths offset *is* stacked cards.
- **§1.3 cannot be answered at all** in either. Anti-blob pressure is the claim that wasted
  interior volume costs you. Interior volume is what a projection with no real occlusion
  cannot show, and UI §2 admitted as much when it flagged §1.3 as the risk it accepted.

So the renderer is not chrome around the hypotheses; it is the instrument that measures
them, and an instrument calibrated in the wrong units returns numbers that cannot be read.
The honest conclusion is the expensive one: **the prototype must be rendered the way the
game will be rendered, and the tester must see a turret rather than a diagram of one.**

**This document makes a true isometric 2.5D view the only tester-facing projection.** One
fixed-elevation camera, four quarter-turn yaws, real depth sorting, real occlusion, cube
voxels with shaded faces, ground-contact shadows, and actors standing in the world rather
than beside a plan of it. The flat cross-section survives as a **developer diagnostic**
(§9), not as a mode a tester chooses.

**Amendment to UI §2.** The headline decision now reads: *the tester build renders a fixed
isometric 2.5D view of the voxel world.* The seam argument in UI §2 and UI §8 is unchanged
and is the reason this is affordable at all — going to real 3D still replaces `render/` and
editor placement, and still does not touch `sim/`, `structure/` or `path/`. Nothing here
adds a `SimCommand` (UI §5.2), and every value this document introduces lives in
`ViewState`.

What UI §2 got right and this document must therefore repay: **interiors were free in 2D and
are not free here.** That debt is paid in §6, and §6 is the load-bearing section of this
spec, not a courtesy.

---

## 2. The projection

**[in]** One fixed 2:1 dimetric projection — what every isometric game means by
"isometric" — at four discrete yaws and one fixed elevation. No free camera, no
interpolation, no perspective, no depth buffer.

### 2.1 The screen basis

The world is right-handed with **y up**, **z the lane axis** (attackers advance toward
increasing z, the pad is at high z) and **x the section axis** (P0 §4, UI §5.3 widened).

Yaw resolves the two ground axes into a **view pair**: `p`, the axis that runs *down and to
the right* on screen, and `r`, the axis that runs *up and to the right*. Then, with `s` the
zoom in pixels per voxel edge:

```
sx(p, r)    = (p + r) * s        + originX
sy(p, r, y) = (p - r) * (s / 2)  - y * s + originY
```

That is the whole projection. A voxel is therefore **2s wide and 2s tall** on screen: a top
face that is a `2s × s` rhombus, and a vertical edge of exactly `s`. Those are the classic
proportions, chosen because they are the ones the eventual game will use and because they
land on whole pixels (§2.3).

### 2.2 The four yaws

| Yaw | `p` (down-right) | `r` (up-right) | Camera sits toward | Peel side (§6) |
|---|---|---|---|---|
| 0 (default) | `+z` | `+x` | `-x, +y, +z` | `x <` active |
| 1 | `-x` | `+z` | `-x, +y, -z` | `x <` active |
| 2 | `-z` | `-x` | `+x, +y, -z` | `x >` active |
| 3 | `+x` | `-z` | `+x, +y, +z` | `x >` active |

Yaw 0 is what a session opens in: the lane recedes down-and-right into the pad, so an
attacker walks toward the turret across the screen, and the sections recede up-and-right, so
a five-wide turret is five voxels deep rather than one voxel with four ghosts.

**Four states, one key each way, and a compass cue in the field control bar.** This is not
an orbit camera and must not become one. UI §2 rejected free orbit because testers spend
attention on the structure or on the controls and not both, and that argument still holds
against a continuous camera. It does not hold against a discrete one: four yaws are four
pictures, they are reached by pressing a key, there is no state to reset, no angle to
persist, and nothing to un-learn. What they buy is the answer to the one question a fixed
camera cannot answer — *what is behind my turret* — which is exactly the blind spot the
depth view's §6.3 conceded and §1.3 needs closed.

Elevation is **not** adjustable. One elevation is what makes the pixel grid in §2.3 exact.

### 2.3 Whole pixels are a rule, not an optimisation

**[in]** `s` is an even integer drawn from a fixed ladder, and `originX`, `originY` are
integers:

```
s ∈ { 8, 10, 12, 16, 20, 24, 32, 40, 48 }        default 16, floor 8
```

Every term above is then integral: `s/2` is a whole number of pixels, so **every voxel
vertex in the scene lands on an exact pixel** at every zoom. Three things follow, and all
three are visible to a tester:

1. Adjacent top faces share an exact edge, so a floor is a floor and not a floor with
   hairline seams through it.
2. Panning does not shimmer, because a pan is an integer translation of an integer lattice.
3. The C++ port computes screen positions in integers, which is the arithmetic it wants.

A continuous zoom would break all three for the sake of a gesture, so pinch-zoom (mobile UI
spec §6.2) **snaps to the ladder** and the intermediate frames of the gesture snap with it.

### 2.4 Framing and fit

`fit` frames the world box of `FieldDesign.viewBounds` under the current yaw: project the
box's eight corners, take the screen extent, choose the largest ladder `s` that fits both
axes, and place the origin so the **pad's ground plane sits at 0.88 of the viewport height**
(the anchor from UI §2's framing rule, unchanged in purpose: everything that grows — a taller
design, a lobbed firepot's arc — grows upward). Yaw changes re-fit at the same `s` if the
extent still fits and re-fit down a rung if it does not, so a quarter turn never throws the
turret off the edge and never zooms the tester out for no reason.

---

## 3. What a voxel looks like

**[in]** Three faces, flat-shaded, no texture, no gradient, no bevel.

| Face | Drawn when | Shade |
|---|---|---|
| Top (`+y`) | the cell above is empty | material colour lightened by **0.22** |
| Screen-left face | the cell in the screen-left direction is empty | darkened by **0.10** |
| Screen-right face | the cell in the screen-right direction is empty | darkened by **0.32** |

Which world faces those are follows from the yaw table: the camera-facing set is always the
top plus the two faces whose outward normals point toward the camera.

**The light is fixed to the screen, not to the world.** A quarter turn must not change which
side of a turret is bright, because the shade is a depth cue and a cue that changes meaning
when the tester presses a key is not a cue. A world-fixed light would also make one yaw the
dark yaw and bias where testers build — an artefact contaminating §1.3's measurements for
the sake of physical correctness the prototype is not testing.

**Shading is luminance-only**, off the material's own colour, exactly as the depth view
required and for the same reason (UI §4): hue stays free for the things that encode on it.
A wood cube and a stone cube stay distinguishable in greyscale, and the utilization ramp and
its hatch bands are untouched.

### 3.1 Outline the shape, not the cells

A 1 px darker edge is stroked **only along exposed silhouette and crease edges** — an edge
between a drawn face and empty space, or between two drawn faces of different cells. An edge
shared by two coplanar faces of neighbouring cells is never stroked.

The alternative, stroking every cell, is what the current renderer does, and at `s = 16` a
solid wall becomes a grid of boxes: the tester reads texture where there is form. Outlining
the shape is what makes a turret read as one object with parts rather than as a pile of
cubes, and it is what a shipped frame will look like.

### 3.2 Damage, fire and kind, at three levels of zoom

Unchanged in meaning from UI §4 and re-stated here in the projection's terms:

- **Damage darkens** all three faces by the same factor rather than recolouring them, so
  material stays readable right up to the point the block dies.
- **Fire** replaces the fill with the two-stop ignition ramp on all three faces, and the top
  face carries the flame mark. Fire is the one thing allowed to break the shading rule,
  because a burning block is a hue statement.
- **Kind** (station, depot, core, hatch) draws its ring on the **top face** and its glyph
  centred on the tallest camera-facing face. Below `s = 12` the glyph is dropped and the
  ring stays; below `s = 10` the silhouette edges are dropped first (§8).
- **A hole** where a block used to be draws as a dashed outline of the cell's hexagon, in
  the build plane only — "what did I lose" is a question about the plane being worked in,
  and holes everywhere would be a picture of the whole run's damage.

### 3.3 A cell that cannot be seen is not drawn

**[in]** A cell whose three camera-facing neighbours are all present is **fully occluded and
is skipped**, faces, edges and all.

This is exact rather than heuristic: the projections of those three neighbours tile the
cell's hexagon precisely, each covering one of its three rhombi. So the rule discards no
pixel that would have been visible, and the consequence is the performance claim of §8 —
**fill cost is proportional to a design's surface, not its volume.** A solid five-wide blob
costs what a five-wide shell costs.

---

## 4. Depth sorting

**[in]** One back-to-front painter's pass over one draw list. No depth buffer, no
per-fragment work, no sorting library.

Every item — a voxel, an attacker, a crew member, a projectile, a shadow — carries a
**depth key**:

```
key = p + y - r
```

with `p` and `r` from the yaw table (§2.2), so at yaw 0 the key is `z + y - x`. Larger is
nearer the camera; the list draws in ascending key. Two facts make this sound and both are
testable headlessly:

1. **It is the exact view-ray order.** The key is the world position dotted with the
   direction toward the camera, up to a positive constant.
2. **Ties never overlap.** Items with equal keys lie in one plane perpendicular to the view
   direction; unit cubes there meet edge-to-edge and never overlap, so any tie order is
   correct. Ties are nevertheless broken deterministically — by `x`, then `y`, then `z`,
   then item kind — because two runs of the same replay must produce the same pixels.

Actors sit at fractional positions and sort by the same key with no special case, which is
what puts a runner *behind* the wall they walk behind, and it is the first time in this
prototype that a corridor will look like a corridor.

### 4.1 Overlay marks draw after, and are never occluded

The depth view's rule survives intact and is now doing much harder work: **the base
composition is depth-sorted; overlay marks are not.** Stress bars, predict rings, arc
sweeps, logistics routes and the first-failed-joint callout draw in a pass after the sorted
list, positioned at their own world location and clipped by nothing.

This is a deliberate refusal to be physically correct. UI §4 says overlays compose with the
base layer rather than replacing it, and the hypothesis-critical overlay must not be
readable only when the geometry happens to permit it. A stress bar hidden behind the wall it
describes is a measurement lost, and §1.1 is the measurement.

---

## 5. Picking and placement

The projection is many-to-one, so this replaces the exact screen-to-cell inverse the flat
view enjoyed. Both halves below are closed-form and integral; neither is a colour-buffer
read-back, and neither allocates.

### 5.1 The plane inverse **[in]**

For a chosen horizontal plane `y = k`, screen-to-world is exact:

```
U = (sx - originX) / s              // = p + r
V = (sy - originY + k * s) / (s/2)  // = p - r
p = (U + V) / 2      r = (U - V) / 2
```

Two divisions and no search. Everything below is built on it.

### 5.2 Inspection picks the voxel a tester is looking at **[in]**

Hover, click-to-inspect, focus-fire and the replay's joint locate address **the frontmost
visible block under the pointer**, wherever it is in the world.

The pick walks the view ray with a three-axis DDA. The ray direction toward the camera is a
unit step on each axis — `(-1, +1, +1)` at yaw 0, signs per the yaw table — so the traversal
is integer-driven, visits at most `spanX + spanY + spanZ` cells, and returns the first live
block it meets. Nearest-first, so the first hit is the visible one. Exact, deterministic and
free of floating-point search.

### 5.3 Placement is locked to the build plane **[in]**

**The editor places into the active cross-section and nowhere else.** A drag rectangle is a
rectangle in that plane; a click is one cell in that plane; the plane is moved with `[` and
`]` and with the section stepper, exactly as today.

This keeps the property the depth view spent a section defending, and it keeps it for a
sharper reason now that occlusion is real: a placement that resolved by picking would let a
mis-click put a block a section away from the one the tester meant, and §1.3's anti-blob
measurements are measurements of what testers *chose* to build. Contaminating them with
depth mis-clicks would corrupt the one dataset this renderer exists to make trustworthy.
Face-adjacent placement — the voxel-editor convention of building outward from the block you
clicked — is the natural P1 successor and is **[out]** here.

Two affordances make plane-locked placement legible rather than surprising, and neither is
optional:

- **The build plane is drawn.** A translucent grid of rhombi fills the active section across
  the pad footprint and up to the design's headroom, so a tester can see where a click will
  land before making it. Without it, plane-locked placement in a projection with depth is a
  guess.
- **Nothing in front of the build plane is solid** — see §6, which is what makes the guess
  unnecessary.

---

## 6. Seeing inside: the peel plane

UI §2 bought interiors for free and this projection spends that money. This section is how
it is paid back, and it is a rule rather than a slider.

> **The build plane is never occluded. Everything between it and the camera is peeled to a
> wireframe; everything behind it is drawn solid.**

The peel is the same one control the build already has — the active cross-section, moved
with `[` and `]`. Which sections count as "in front" follows from the yaw (§2.2) rather than
from the sign of x, because a quarter turn moves the camera to the other side of the turret.

**Why peeling the sections in front is exactly enough.** Any cell that occludes a cell of
the build plane lies on the view ray between it and the camera, and one step along that ray
changes the section index by exactly one — the ray direction has unit magnitude on the x
axis at every yaw (§2.2). So every occluder of the build plane is a cell in a section nearer
the camera than the build plane, and peeling those sections removes **all** of them and
nothing else. Plane-locked placement (§5.3) is therefore honest: with the peel engaged, what
a tester clicks on is what a tester gets.

| Section | Treatment |
|---|---|
| Between the camera and the build plane | Wireframe: exposed edges only, no faces, alpha falling with distance to a floor |
| The build plane | Full treatment — faces, shading, kind, damage, fire, glyphs |
| Behind the build plane | Solid, shaded, dimmed with distance, kind rings kept, glyphs dropped |

**Peel depth is per-screen, and that is the point of this whole document:**

| Screen | Default peel |
|---|---|
| Design | Every section in front of the build plane. The tester works on an open cutaway. |
| Run, Replay, Run summary | **None.** The turret is solid, and it is the turret the game would show. |

So the loop alternates between a workshop and a game. The tester builds in a cutaway they
can reach into, then watches a solid object get hit — and the second half is the half that
was worthless before, because a run rendered as a cross-section is a run nobody is playing.
`[` and `]` still move the plane in Run and Replay for a tester who wants to look inside a
failure, and the section readout names the peel when one is engaged (`x = 2 · 3 blocks ·
2 peeled`), because a cutaway a tester has not noticed reads as a missing wall.

### 6.1 Alternatives considered

- **Uniform transparency (x-ray).** Rejected, as in the depth view: alpha composites
  multiply, so a cell's luminance would become a function of how many cells sit behind it,
  and UI §4's non-negotiable is that luminance encodes value.
- **A free orbit camera.** Rejected per §2.2: the question "what is behind my turret" is
  answered by four keys, and a continuous camera costs attention the hypotheses need.
- **Hiding the roof above a build level.** Rejected as redundant: §6's proof shows the
  section peel already removes every occluder of the build plane, so a second peel axis
  would be a second control with nothing left to remove.
- **A depth slider independent of the build plane.** Rejected: two controls that both mean
  "how deep" is one control too many, and the second is only ever set to the value the first
  already has.

---

## 7. The scene, not the structure

A solid turret standing on nothing still reads as a diagram. These are **[in]** because
each one is load-bearing for depth perception, and a 2:1 projection has no perspective to
fall back on.

1. **A ground plane of iso tiles.** The lane and the pad surround, tiled, with a faint
   accent every four voxels so distance along the lane is countable without measuring
   pixels. This replaces the flat view's screen-space grid, which was a grid over the
   picture rather than on the ground.
2. **The pad as a marked rhombus**, outlined, at its true footprint — the thing P0 §4 says
   the turret is allowed to stand on, drawn as an area rather than as a band.
3. **Ground-contact shadows are mandatory** for every actor and every projectile. Without
   perspective, screen position alone cannot distinguish "two voxels up" from "two voxels
   nearer", and a contact shadow is the cue that resolves it. An actor without a shadow in
   an isometric scene is an actor at an unknown position.
4. **Actors stand in the world.** An attacker is a box of its own footprint and height, an
   attacker's health pip rides above it, a crew member is a smaller box carrying a load mark
   when carrying, and all of them sort by §4's key against the structure. A runner is behind
   a wall when they are behind a wall.
5. **Projectiles fly through the projection.** A shot is drawn along its actual path with its
   shadow tracking the ground beneath it, so a lobbed firepot's arc is an arc over the
   turret rather than a curve on a plan of it.
6. **The gun-range marker lies on the ground**, across the lane at the range limit, rather
   than as a vertical line drawn over the picture. "Nothing is in range yet" and "my gun is
   silent" must stay distinguishable at a glance (`FieldDesign` framing note), and on the
   ground is where a range limit lives.
7. **Off-frame attackers keep their edge marker** (UI §3.2's requirement, unchanged): the
   view box does not stretch to forty voxels of lane just to show a walking dot.

Nothing here is art. It is the minimum a 2.5D scene needs in order to be read as a scene,
and UI §3's `Art, audio, VFX polish` row stays **[out]**: legibility over fidelity,
everywhere, still.

---

## 8. Performance

The budgets are unchanged and both columns still apply — UI §6 for desktop, mobile UI spec
§8.3 for phones. This projection draws more per cell than a flat one, so the budget is held
by construction rather than by hope:

- **Surface, not volume** (§3.3). Fully occluded cells are skipped, so a ~1500-cell design
  costs roughly its silhouette: a few hundred cells, at most three quads each.
- **Viewport culling.** A cell whose hexagon lies outside the canvas is skipped before any
  path is built.
- **The static pass is cached.** The ground, the pad and the peeled and solid structure are
  composited to an offscreen canvas, keyed by `(blueprint revision, alive stamp, damage
  stamp, fire stamp, s, yaw, peel, origin)`. A run frame is then one blit plus the actors,
  the projectiles and the overlay — which is what makes 60 fps on a phone a claim rather
  than a wish, since none of those keys change while a wave plays out except by damage.
- **No per-cell allocation.** The draw list is pre-sized to the cell count and reused; sorts
  are in place over an integer key array.
- **Integer vertices** (§2.3), so no sub-pixel path snapping and no anti-aliasing cost on
  the dominant fill.

The backing-store cap from mobile UI spec §8.3 is unchanged: effective pixel ratio
`min(devicePixelRatio, 2)`, reduced so the store stays under 2.2 M pixels, invisible to the
layers.

**Degradation order, if render p95 misses the budget on the mobile profile**, applied in
this order and announced in the dev readout: silhouette edges, then ground tile accents,
then the build-plane grid, then a rung down the zoom ladder. **The timestep is never
touched** — playback degrades, the timestep does not (mobile UI spec §8.3). The dev readout
keeps reporting render p95 (UI §6) and it is the number that decides all of this.

---

## 9. Controls, and what happens to the flat view

**[in]** One new verb. Everything else keeps its binding.

| Verb | Key | Coarse pointer |
|---|---|---|
| yaw a quarter turn, either way | `q` / `e` | two buttons plus a compass cue in the field control bar |
| build plane, and therefore the peel | `[` / `]` | the section stepper and picker, unchanged |
| pan, zoom, fit | unchanged | drag, pinch (snapping to the ladder, §2.3), fit button |
| overlays 1–5, inspect, scrub | unchanged | unchanged |

Coarse-pointer targets stay at 44 × 44 CSS px (mobile UI spec §8.1), the compass included.

**The flat cross-section becomes a developer diagnostic. [in]** It is the clearest possible
picture of one slice and it costs nothing to keep, so `ViewMode.Flat` and its painter stay,
reachable only where the dev readout lives, and out of the tester's control bar. It is not a
mode a tester can find, choose, or spend attention learning, because the build no longer
validates it.

The `v` toggle of the depth-view spec is **retired**: there is one tester-facing projection,
so there is nothing to toggle.

---

## 10. What must not regress

The additive-mode framing is gone — this replaces the projection rather than sitting beside
it — so these are stated as the invariants a reviewer should try to break.

1. **Every overlay draws in both the tester's view and the dev flat view**, from the same
   layer registry (UI §5.4), with the same shortcuts. No overlay is projection-specific.
2. **Overlay marks are never occluded** (§4.1), and each draws at its own world position.
3. **The stress overlay stays anchored to the build plane**: the joints touching the active
   section and no others, in every yaw. The hypothesis-critical overlay answers the same
   question with the same marks whichever way the camera faces.
4. **Nothing encodes on hue** that did not already. Depth is alpha, wireframe-versus-solid,
   and shade; face shade is luminance off the material's own colour. The four utilization
   bands keep their ramp *and* their hatch patterns, and the overlay stays readable in
   greyscale.
5. **The simulation does not know any of this exists.** Yaw, zoom, peel and build plane live
   in `ViewState`; the toggles are `ViewCommand`s; none is logged. A phone attempt, a
   yaw-2 attempt and a dev-flat attempt replay to the same final state hash (UI §5.1).
6. **`scripts/check-boundary.mjs` still passes.** Every file this spec adds is under
   `src/render/`, and every one of them that computes rather than draws takes numbers and
   returns numbers.
7. **Determinism of pixels, not just of state.** Same frame, same view values, same draw
   order — hence the tie-break in §4.

---

## 11. Metrics

The two depth-view fields are withdrawn along with the mode they measured. In their place,
joining the readability block of UI §7.3 and reported segmented by `layoutMode` (mobile UI
spec §9.2):

| Metric | Question |
|---|---|
| Yaw changes per attempt, and whether any happened before the first run | Is the fourth wall being looked behind, or is the default view all anyone sees? |
| Peel-plane moves per attempt, in Design and in Run separately | Is the cutaway a build tool, a diagnosis tool, or both? |
| Seconds in Run with a peel engaged | If this is high, testers are choosing the diagram over the game, and §1 is wrong. |
| Zoom rungs used, and time at the floor rung | Is a phone tester reading the turret at a size where §3.2's detail is dropped? |
| Render p95 per yaw | §8, per projection state, since fill cost differs by silhouette. |

The anti-blob fields already in UI §7.3 — stations-per-cell, enclosed-volume ratio over
successive attempts — are **the fields this document exists to make meaningful**. They were
measurements of a property no tester could see. Read them against `sameJointFailedAgain`, as
before, and read the first row against §2.2: if nobody ever turns the camera, the four yaws
were scope that should have gone elsewhere.

---

## 12. Tests this spec requires

In the same commit as the code, per the repository's rule, named after the rule they pin and
citing the section. Everything below is pure computation and runs headlessly under
`node:test`.

- `test/render/IsoProjection.test.ts` — §2.1's two formulae at exact pixel values; the
  `2s × s` top face and `s` vertical edge; all four rows of §2.2's yaw table; §2.3's ladder
  and the integrality of every projected vertex at every rung; §2.4's fit anchoring the pad
  at 0.88 and never exceeding the viewport in any yaw.
- `test/render/CellPick.test.ts` — §5.1's inverse as the exact left inverse of §2.1 on a
  plane, at every rung; §5.2's DDA returning the nearest live block for a ray crossing three
  candidates, in all four yaws; the visit-count bound.
- `test/render/PeelPlane.test.ts` — §6's treatment table; the peel side flipping between
  yaw 1 and yaw 2; and the property the section is argued from, asserted directly: **for
  every cell of the build plane, no unpeeled cell projects over it.**
- `test/render/DepthKey.test.ts` — §4's key as the view-ray order for a hand-checked set;
  ties never overlapping; the tie-break total and stable.
- `test/render/VoxelFaces.test.ts` — §3's face-visibility rules per yaw; §3.1 stroking a
  crease and not a shared coplanar edge; §3.3's occlusion rule, including the claim that the
  three camera-facing neighbours tile the hexagon exactly.
- `test/render/DepthView.test.ts` — kept, narrowed to the dev flat view of §9.

---

## 13. Build order

Each step leaves the build running, because a renderer replaced in one commit is a renderer
nobody can review.

1. `IsoProjection` and `ViewYaw` beside the existing `Projection`, with §12's first suite.
   Nothing drawn yet.
2. `DepthKey`, `DrawList`, `VoxelPainter`: the structure drawn solid, one yaw, no peel, no
   actors. The first frame that looks like the game.
3. `CellPick` and the build-plane grid; inspection and placement move over. The editor works
   in isometric.
4. `PeelPlane`: the cutaway, the per-screen defaults of §6, the section readout.
5. Actors, shadows and projectiles into the sorted list (§7). **The loop is validated from
   here** — everything before this is a picture of a turret rather than a run of one.
6. The four yaws and the compass; ground tiles and the ground-borne range marker.
7. `StructureCache`, the culling of §8, the degradation order, the dev readout's per-yaw p95.
8. Flat view demoted to the dev readout (§9); the `v` toggle removed; §11's metrics landed.

---

## 14. Seams

- **Real 3D** replaces `IsoProjection` and `CellPick` and nothing else. The draw list, the
  layer registry, the peel rule and the build plane all survive it — the peel becomes a
  clipping plane and the yaw becomes an initial camera pose.
- **Art** replaces `VoxelPainter`: a face painter becomes a sprite or mesh lookup behind the
  same interface, at the same positions, in the same draw order.
- **A new overlay** is still one `Layer` registration (UI §5.4), and it gets the projection
  for free as long as it positions marks by world coordinate rather than by build-plane
  assumption.
- **A second structure on the field** (UI §8) is more cells in the same draw list, sorted by
  the same key, with no change here.
- **New materials** are a palette row; §3's shading derives the three faces from one colour.

---

## 15. Risks

- **Occlusion can hide the thing being measured.** This is the debt UI §2 avoided and this
  document takes on. §4.1 protects the overlays and §6 protects the build plane, and those
  two rules are the whole defence. If tester sessions show people losing track of interior
  blocks *with* the peel engaged, the failure is here and not in the tester.
- **A 2:1 projection is ambiguous about position along the view diagonal.** Mandatory
  contact shadows (§7.3) and the ground tile accents are the mitigation, and they are
  mitigations rather than fixes: the section readout and the build-plane grid remain the
  ground truth, the picture does not.
- **Fill cost.** §3.3 and §8 make the cost proportional to surface and cache the static
  pass, but a phone at the floor rung with a wide design is the case to measure first. The
  degradation order exists so that the answer is never "drop a tick".
- **Four yaws are four things to look at and one more to explain.** §11's first metric is
  there to catch the honest outcome where nobody turns the camera, in which case the yaw
  work was scope P1 should have spent on real 3D.
- **This is a bigger renderer than a prototype wants.** Stated plainly, and accepted for one
  reason only: the prototype's output is *tester perception*, and perception measured in a
  projection the game will never ship does not transfer. A cheaper renderer that returns
  unusable numbers is not the cheaper option.
