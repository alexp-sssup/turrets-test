# Standable ground — the pad is a floor

**Supersedes §4 of** [`20260904-crew-access.md`](20260904-crew-access.md), which named this
and left it open, and amends its §5, which said the walk graph was untouched. It is touched
now, in one clause.

References written **§n** point at the P0 prototype spec, **crew-access §n** and
**hatches §n** at those documents.

Code and tests cite this document as `standable-ground spec n.n`.

---

## 1. Why

Standing needed a block underneath, so the arena had no floor at all. Crew could stand only
on the turret, which had two consequences:

- **A design with no floor had no ground floor.** Crew-access §4 wrote this down as a known
  edge: a ring of walls with nothing inside it has no standable cell on its lowest storey,
  so its way in ends up on top of its own walls.
- **"Outside" barely existed.** Crew could reach a doorway and not step out of it, because
  the cell beyond had nothing to stand on. That is why access had to be inferred from a
  block tag for as long as it was, and why crew-access §2 had to define entry as a flood
  rather than as a walk.

## 2. The rule

### 2.1 A cell on the ground is standable

One clause added to the walk graph. A cell is standable when it is passable **and** any of:

- the cell below holds a live block, or
- it is a hatch (hatches §2.2), or
- **it is on the ground.**

### 2.2 The ground is the pad and a one-cell apron

Not the world. Both bounds earn their place:

- **The apron is necessary.** Every shipped design fills its 5x5 pad exactly. Without a ring
  of standable ground outside it, crew would have nowhere to stand beyond their own wall and
  crew-access §2's entry check would still find no way in.
- **The bound is necessary too.** Beyond the apron is the lane. Measured while writing this:
  with the ground unbounded, the `reaching gun` example put its gunner on the battlefield
  directly beneath the gun on the end of its arm — the ground under an overhang is
  standable, and it sorted ahead of the cell at the gun — and its haul went from 7 steps to
  17. A gunner does not manage a gun from underneath it, standing on the lane.

**Structural support is unchanged and stays pad-exact.** Standing on ground is not the same
as being held up by it, so `supportsBlockAt` keeps answering the second question with the
pad's own extent and only the new `walkableAt` carries the apron.

## 3. Severing bites above the ground floor

The consequence worth stating rather than leaving to be discovered.

**A hole in a floor laid on the pad is a doorway, not a cut.** Crew step down into it and up
the other side, because the ground is right there. So §4.3's "severing a corridor silences a
gun without destroying it" applies to corridors **above** the ground floor; at ground level a
corridor is severed by walling it, not by holing its floor.

That is a real narrowing of §4.3's attack vector and it is the honest reading rather than a
loss. The `severed depot` fixture is severed by walls rather than by a hole and is unaffected
(§4), which is also the more interesting of the two mechanics: it is a design decision the
player made, not a lucky shot.

## 4. What it moved, measured

Station-to-nearest-depot route, before and after, over every shipped design:

| Design | Before | After |
|---|---|---|
| standard turret | 1, 2 steps | 1, 2 steps |
| severed depot | severed | severed |
| overreaching | severed | severed |
| reaching gun | 7 steps | 7 steps |
| stone keep | 1 step | 1 step |
| wood frame | 1, 2 steps | 1, 2 steps |

**Nothing moved.** Run outcomes over the five-wave script are unchanged too. The reason is
§2.2: the apron adds standable cells outside a design and none inside it, and no shipped
design has a shorter route around its own outside than through it.

What did change is the thing this document exists for. A ring of walls with no floor and a
gap in one side: before, the room inside was unreachable and the only "entry" was the top of
the walls; after, crew walk in at ground level and the room is reachable.

## 5. What does not change

Passability, the ladder rule, and the step-up-or-down move. Structural support, tipping and
the load path. The hatch's capacity factor and its transparency to shot. No `SimCommand`, and
no dial.
