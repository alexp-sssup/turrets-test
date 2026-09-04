# Crew access — a way in, not a block

Amends **prototype §4.2**, whose station rule reads "a traversable crew path to a hatch", and
**supersedes §7 of** [`20260904-hatches.md`](20260904-hatches.md), which named the problem and
left it open. §2 of that document — what a hatch *is* — stands unchanged.

References written **§n** point at the P0 prototype spec, **hatches §n** at the document
above.

Code and tests cite this document as `crew-access spec n.n`.

---

## 1. A hatch is a means, not an end

The editor asked the wrong question. `NoHatch` and `StationNoHatchPath` test whether a block
**tagged** `Hatch` is reachable — so a design is told "crew cannot get in" for want of a
particular voxel, rather than for want of a way in. Two consequences, both measured:

- An **open doorway** — the hatch deleted, the cell left empty — still raised both
  violations, although the walk graph makes that cell passable and standable and crew can
  walk straight through it.
- The message was false anyway. With `standardTurret`'s hatch replaced by a wall there is
  still a six-cell route from on top of the back wall to each gunner's post.

A hatch is how crew move *between storeys*. It was never supposed to be the thing that lets
them in.

## 2. Getting in: an open space on the ground floor

**Crew walk in at the ground floor, through any opening in it.** Not through a kind of block
— through a gap.

### 2.1 The ground floor

The **lowest storey of the design that crew can stand on**: the lowest `y` at which any cell
within the design's footprint is standable.

For a turret with a floor slab — which is every shipped design — that is the storey resting
on the slab, not the slab itself. Crew stand on a floor; a solid slab is a floor rather than
a storey.

### 2.2 An entry cell

A standable cell on the ground floor that is **connected, horizontally and at that storey, to
the outside of the footprint through passable cells**.

Passable, not empty: a hatch is passable (hatches §2.1), so a hatch set into an outer wall is
a door and works as one. That is a convenience, not its purpose — a plain gap in the wall
does the same job for one voxel less.

### 2.3 A station has crew access when it can reach an entry cell

`ViolationKind.StationNoHatchPath` becomes **`StationNoEntryPath`**, and it asks whether the
gunner's cell has a traversable route to any entry cell. That is the rule §4.2 always meant.

### 2.4 `NoHatch` is deleted

There is no rule requiring a hatch. A single-storey turret needs none, and that is correct:
it has a ground floor and a door, and nothing to climb to.

A multi-storey turret still needs them, and needs no rule to say so — a station upstairs with
no hatch between it and the ground floor simply cannot reach an entry cell, and §2.3 reports
it. This is the shape the rest of P0 uses: the pressure comes from the geometry, not from a
declaration.

## 3. Going up: what hatches are for

Unchanged from hatches §2.2, and now the *whole* of what a hatch is for: it is the only way
to move vertically, and a hatch column is a ladder. Everything else about a hatch — that it
carries almost no load (hatches §3), that it stops no shot (hatches §5) — is the price of
that one capability.

So the two verbs are separate and neither substitutes for the other. **A gap gets crew in. A
hatch gets them up.** A design with no opening cannot be manned; a design with no hatch
cannot be manned above its ground floor.

## 4. A design has to have a floor

A consequence worth stating rather than discovering: standing requires a floor, so a ring of
walls with no floor inside it has no standable cell on its lowest storey, and its ground
floor is the top of its walls.

That is a real edge and it is left as it is. The proper fix is for the **pad surface itself
to support standing**, so that a floorless design is entered across the pad. That change
reaches the walk graph, which the depot hauls of §4.3 are measured against, so it belongs in
its own document with its own before-and-after numbers rather than riding along here. Every
shipped design has a floor slab and is unaffected.

## 5. What does not change

**The walk graph.** Not one rule of it: passability, standability, the ladder rule and the
step-up-or-down move are all exactly as they were. §2 is a question asked *of* that graph by
the editor, which is why depot round-trip times, runner routes and the severed-depot fixture
that §4.3's corridor-severing claim rests on are all provably untouched.
