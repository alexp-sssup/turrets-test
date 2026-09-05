# A station is a terminus — a slit is not a doorway

**Supersedes §2.1 and §2.6 of** [`20260904-gun-ports.md`](20260904-gun-ports.md), which made
a station passable and then accepted, as a consequence, that a gun port in the ground-floor
wall is a way in. It is not one. The rest of that document — the gunner stands in the slit,
the emplacement carries its own footing, a stack of ports is not a ladder, and the block
still stops a shot and still carries its load — stands unchanged.

References written **§n** point at the P0 prototype spec, **gun-ports §n**,
**crew-access §n**, **hatches §n** and **standable-ground §n** at those documents.

Code and tests cite this document as `station-terminus spec n.n`.

---

## 1. One property was doing two jobs

Gun-ports §2.1 needed crew to be able to *occupy* a station's cell, and the walk graph had
one predicate for that: `isPassable`, which had always meant "crew can be here" and "a route
can go through here" at the same time. Those two readings agree on every other kind — empty
air and a hatch are both — so nothing had ever forced them apart. A slit forces them apart.

The consequence was recorded honestly in gun-ports §2.6 and §3 and argued for, on the
grounds that a port big enough to sit in is big enough to climb through. That argument was
wrong, and the measurement in §3 of that document is what shows it: entry cells rose by
exactly one per ground-floor station, `wood frame` and `standardTurret` from 8 to 10 and
`stone keep` from 9 to 10. Crew-access §2.2 floods the ground floor inward from outside the
footprint through passable cells, so making a station passable put a hole in the outer wall
of every design that fires along it.

Two reasons that is the wrong answer, and neither is about the size of the hole:

- **It is not what a gun port is.** A firing slit is sized for a weapon's traverse and the
  gunner's eye, and it is on the side facing an enemy. §4.2 already says what passes through
  it: a shot, killing the gunner, while the block survives. A cell you can be shot through
  but not destroyed through is not a doorway.
- **It defeats the rule it was defending.** Crew-access exists so that "crew cannot get in"
  means something a player can see. A design whose only opening is its gun ports would be
  told it has a way in — through the one face the enemy is standing on.

## 2. The rule

### 2.1 A station is not passable

`isPassable` narrows to what it always meant in the crew-access flood: **a route may pass
through this cell.** Empty air, and a hatch. A hatch earns it by being a hole — a hole is a
way through for a person and for a round alike (hatches §5) — and a station does not.

Crew-access §2.2 is therefore back to what it said: a gap is a way in, a hatch in an outer
wall is a door, and nothing else is either.

### 2.2 A station is standable on its own account

`isStandable` gains a station outright, asking nothing of passability and nothing of the cell
below. Gun-ports §2.2 already made the emplacement carry its own footing; this says it also
carries its own occupancy. The gunner stands in the slit exactly as before.

The two predicates now disagree on exactly one kind, and that disagreement **is** the rule:
crew stand in a station, and no route goes through one.

### 2.3 A terminus is a destination and never a step

A **terminus** is a cell crew may stop in and no route may continue through. A station is the
only one there is.

`AStar` takes a terminus only as a destination: a successor that is a terminus is skipped
unless it is the goal. The start is pushed directly and is never a successor, so a gunner can
still walk out of their post to fetch their own rounds — which is the asymmetry a dead end
actually has.

The rule lives in the search because it is a statement about *routes*, not about cells; the
kind lives in the graph, which is asked `isTerminus` and answers without the pathfinder ever
learning what a station is.

### 2.4 What this does not restrict

A station is reached and left by every ordinary move: a step from the room behind it, a step
down from the parapet, a step up from the floor below. Crew-access §2.3's question — can the
gunner reach a way in — is asked from the station's own cell and answered by the same walk,
and a station that only a sealed room can reach fails it, which is the failure that should be
reported and now is.

## 3. What it moved, measured

Against the state gun-ports left, and quoting its §3 table where it overlaps:

- **Entry cells are back where crew-access left them**: `wood frame` and `standardTurret`
  10 → **8**, `stone keep` 10 → **9**, `reaching gun` 24 → **24** (its station is out over
  the lane and never was on the ground floor). A ring whose only opening is a gun port
  reports **no way in at all** — asserted directly, against the same ring with a hatch in
  that cell, which opens.
- **Nothing else moved.** Every shipped design keeps its cost, its load factor, its violation
  count, its gunner in the slit, and both round trips: `reaching gun` 9.0 s, `stone keep`
  4.0 s, `wood frame` and `standardTurret` 2.0 s and 4.0 s. The correction gun-ports §3 makes
  to the pair quoted in hatches §1 stands.

## 4. What does not change

- **Gun-ports §2.2, §2.3, §2.4 and §2.5**, in full: the footing, the not-a-ladder rule, the
  gunner's cell, and the block stopping a shot while carrying its load.
- **Hatches**, in full. A hatch is still passable, still a door in an outer wall, still the
  only way through a floor, and still the only ladder.
- **The gunner's post and every resupply route**, per §3.
- **The walk graph's shape.** No new edge, no new move, no dial. One predicate narrowed, one
  widened, and one question added for the pathfinder to ask.

## 5. Tests this document requires

- A station is standable and not passable, and a hatch is both — the disagreement asserted on
  the same cell of the same fixture (2.1, 2.2).
- A sealed corridor with a port between its two halves: the port is reachable as a
  destination from either side, a gunner can walk out of it, and there is no route from one
  side to the other. The same wall with a hatch in it opens, at two steps (2.3).
- A ring whose only opening is a gun port has no entry cell, while the same ring with a hatch
  there has some (2.1, §3).
- Every shipped design's cost, load factor, violation count, gunner cell and round trip is
  unchanged from gun-ports §3 (§3).
