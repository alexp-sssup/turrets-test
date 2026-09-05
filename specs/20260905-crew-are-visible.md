# Crew are visible — the twelve can be seen, counted and told apart

**Amends §3 of** [`20260902-ui-spec-p0-tester-build.md`](20260902-ui-spec-p0-tester-build.md),
which gave the Allocate screen a purpose and never said what the field shows while it is
open, and **§7.4 of** [`20260903-isometric-renderer.md`](20260903-isometric-renderer.md),
which said a crew member is a box in the world and left where a *standing* crew member's box
goes to the frame builder. Nothing either document states is withdrawn.

References written **§n** point at the P0 prototype spec, **UI §n** at the tester-build
spec, **iso §n** at the isometric renderer, and **crew-access §n**, **standable-ground §n**
and **station-terminus §n** at those documents.

Code and tests cite this document as `crew-visible spec n.n`.

---

## 1. Three ways the crew are invisible

§4.4 makes the twelve a fixed pool and the allocation of them a real decision. UI §3 gives
that decision its own screen. The screen exists, the pool exists, and a tester cannot see
either of them.

**Measured, on the tick-zero frame of every shipped design** — the four in
`SampleBlueprints` and the three worked examples:

| Design | Crew | Drawn inside a live block | Distinct cells |
|---|---|---|---|
| standard turret | 12 | **12** | 3 |
| severed depot | 12 | **12** | 2 |
| overreaching | 12 | **12** | 2 |
| buried station | 12 | **12** | 4 |
| reaching gun (`bad-joint`) | 12 | **12** | 1 |
| stone keep (`stone-box`) | 12 | **12** | 2 |
| wood frame | 12 | **12** | 2 |

Three separate faults produce that table, and each needs its own rule.

### 1.1 The Allocate screen draws a frame with no crew in it

`FrameBuilder.fromDesign` builds the editor's frame and, by construction, puts no crew and no
attackers on it: there is no run behind it to read them from. The Allocate screen falls back
to that frame whenever no attempt is open, which is every session after the first — the
guided first run opens one, a returning tester's does not. Pressing **allocate crew →**
switches the screen and opens nothing.

So the screen whose whole subject is the crew shows none of them, and the shell's crew tally
beside it reads `0g / 0r / 0h` while the panel behind it is dividing twelve.

### 1.2 Crew with no post are stacked in one cell

Everyone who is not a gunner and not on a trip — repair details, spare runners, the
unassigned — is placed at a single cell, the first hatch, with a fraction of a voxel of
jitter. Eleven boxes at one spot composite into one box. That is the `Distinct cells` column
above: twelve crew, two to four marks.

The jitter is the tell. It was an attempt to make a pile readable, and a pile is not made
readable by shaking it.

### 1.3 A box in a cell that holds a block is inside that block

A crew member is a 0.4-voxel box at the centre of their cell (iso §7.4). A gunner's cell holds
their station — station-terminus §2.2 is explicit that the gunner stands in the slit — and a
parked crew member's cell holds the hatch they are parked at. The box is drawn after its own
cell's voxel and so survives *that*, but it is inside the cell's silhouette, and the moment a
nearer block stands in front the whole crew member goes with it.

This is not a bug in the sort. It is the honest consequence of putting an actor at the centre
of an occupied cell, and the fix is to stop doing that where there is a choice.

## 2. The Allocate screen shows the crew it is allocating

### 2.1 It draws the run's own tick-zero frame

The frame the Allocate screen shows is the attempt's frame at tick zero — the design **as it
will be flown**, with the crew the current plan puts on it. Not the editor's frame: the
editor's frame has no crew and is not what this screen is about.

### 2.2 Entering Allocate opens the attempt when the one in hand cannot serve

The rule the Run screen already applies when a wave starts, moved one step earlier in the
loop, where the screen that needs it is:

- Mid-run, between waves, the attempt in hand **is** the attempt. Keep it.
- Otherwise, open a fresh attempt when there is none, when the one in hand has already been
  flown, or when it was opened on a different blueprint.

Allocate always precedes Run, so this opens no attempt that Run would not have opened
moments later.

**Telemetry follows, and this is not a cost.** An attempt opened at Allocate and never flown
records as `AttemptOutcome.NotFlown`, which UI §7.3 already wants counted — "designed but
never flown" is a number, and a tester who reached the allocation screen and went back to the
editor is exactly the event it names.

### 2.3 The picture follows the plan while the plan is being edited

Changing repair details or runners before the wave starts re-derives that tick-zero frame, so
the crew on the field move as the steppers move. A screen that shows a fixed default while
the tester edits away from it is worse than one that shows nothing, because it looks right.

The command still goes through the input queue and still lands on the first tick, so the
replay is unchanged: §4.5 keeps its log, and the pre-start application is a projection of the
same command rather than a second one. Once the wave is running, reassignment is inter-wave
only (§4.4) and arrives on a tick like every other command; there is nothing to preview.

## 3. Crew with no post muster on the ground

### 3.1 One crew member to a cell

No two crew members drawn at rest share a cell. Twelve crew read as twelve marks or the pool
is not a pool a tester can divide.

### 3.2 The muster ground is outside the footprint, at pad level

Crew with no post stand on the ground just outside the design's own footprint, at the pad's
level — the plane an attacker walks on, and the plane standable-ground §2.2 makes a floor.
Nothing is built there, so nothing can be standing in front of them.

They are not simulated as walkers, so **where** they stand is a convention and this document
picks one rather than pretending to derive it. What the convention has to buy is the count.

### 3.3 The muster fills from the back of the pad forward

Cells are taken in rows of descending *z* — the side away from the lane first, since
attackers advance along +z (`Arena.approach`) — and within a row by ascending *x*. The ring
one cell out is used first and the rings beyond it in turn, so there is always a cell for
every member of the pool however small the design is.

Crew off duty therefore fall in behind the turret, out of the field of fire, in a rank a
tester can count without moving the camera. A pool short enough never reaches the lane side
of any shipped design.

### 3.4 A gunner still stands in their station

Unchanged, and deliberately so: station-terminus §2.2 puts the gunner in the slit and that is
where a tester should look for them. §3.2 applies to crew who have nowhere in particular to
be, and a gunner is the opposite of that.

The slit is on the face the enemy is standing on, so a manned station facing the camera shows
its gunner and one facing away does not — which is iso §7.4's rule, not an exception to it.
The station's own unmanned mark (UI §3.2) is what carries "nobody is on this gun" from every
angle, and it already does.

## 4. The role colours are named, and shown

### 4.1 The four colours

Crew are coloured by role and always have been. Written down here so that code and key cite a
document rather than each other:

| Role | Colour | |
|---|---|---|
| Gunner | `#5fb2ff` | the station's own blue (`Palette.kindColour`): a gunner is what an unmanned station is missing |
| Repair | `#54d18c` | |
| Runner | `#ffd166` | |
| Idle / unassigned | `#8b98ab` | the neutral grey: no post, no colour of their own |

A runner's load keeps the warning amber mark above the box (iso §7.4), which is a second
channel and stays one: "a runner" and "a runner carrying" are different readings.

### 4.2 The key rides on the count

Every row that counts a role carries that role's swatch, in the panel, beside the number: the
Allocate screen's gunners, repair, runners and unassigned rows, and the crew panel's role
rows on Run and Replay. A key in one corner of the screen is a lookup; a swatch on the row is
the answer where the question is asked.

The swatch is the same encoding as the field, not an approximation of it — the same rule the
stress key already follows.

### 4.3 The limit, stated

On the field, role is carried by hue alone. UI §4 requires hue-independence of the *stress*
overlay, which is the hypothesis-critical one, and does not require it here; the counts in the
panel are labelled in words, so no number depends on telling blue from green. Distinguishing
one crew member from another **on the field** does. That is a known gap, it is written down
rather than designed around, and closing it would mean a second channel on the box — a shape
or a height per role — which this document does not add.

## 5. What does not change

- **§4.4's pool and its rules.** Twelve, fixed, no growth, reassignment inter-wave only, and
  crew in a collapsing section die. Nothing here touches who is alive or what they do.
- **The simulation.** Muster cells are a drawing convention: no crew member is placed in the
  walk graph by this document, no route starts or ends at a muster cell, and no dial moves.
- **Replay.** The command log is what it was; §4.5's replay re-drives from it unchanged.
- **Iso §4's sort and §7.3's shadows.** A crew member is still a box that sorts against the
  structure and still casts a contact shadow, wherever they are standing.
- **`FrameBuilder.fromDesign`.** It still carries no crew. The Allocate screen stops using it;
  the editor, which has no run behind it, still does.

## 6. Tests this document requires

- On the tick-zero frame of every shipped design: no crew member is drawn in a cell holding a
  live block except a gunner in their own station, and no two crew members share a cell (3.1,
  3.2, 3.4).
- Muster cells are outside the design's footprint, at pad level, and the first of them is on
  the largest *z* available (3.2, 3.3).
- A pool larger than the first ring still gets one cell each (3.3).
- An attempt that has not started re-derives its tick-zero frame when the allocation changes:
  the role counts on the frame follow the plan, and the timeline still holds exactly one frame
  (2.1, 2.3).
- The same call is refused once the run has started, where the input queue owns it (2.3).
- The crew and allocate panels emit a swatch of the documented colour on every role row
  (4.1, 4.2).
