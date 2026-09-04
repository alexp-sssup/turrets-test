# Loss conditions — the Core block is removed

Amends [`20260902-prototype-spec-p0.md`](20260902-prototype-spec-p0.md): replaces the
"Win condition" row of its §5 dial table, adds the loss conditions it never wrote down, and
deletes the Core block from P0 entirely. It also adds one seam to that document's §6.

Where the earlier spec says "core block", this document governs.

---

## 1. Why the Core block goes

The Core block was never specified. It appears in the P0 spec exactly once, as a dial value
— `Win condition | Core block intact after wave 5` — with no §4 system describing it, no
placement rule, no cost, and no entry among the eleven extension seams in §6. Everything
else about it was invented in code.

That absence turned out to be the honest signal. Reviewed against the three claims P0 exists
to test (§1), the Core earns nothing:

- **Nothing aims at it.** The attack fires along the lane at first contact and lobs onto the
  tallest column in the pad. The Core is only ever lost incidentally — a penetration happens
  to reach it, a collapse drops it, fire arrives.
- **It is nearly redundant.** The only other loss is having no blocks left. A buried core
  dies just before the last block does, so it mostly makes an existing loss fire slightly
  earlier.
- **The decision it creates is answered once.** "Where does the one block that must survive
  go?" is answered *deep, low, back-centre, in stone* on the first design and never
  reconsidered. Every worked example in the build answers it identically.
- **It argues for the blob.** The cheapest way to keep a block alive is to pile blocks
  around it. That is a rule pushing against §1's third claim, which is the one claim P0 is
  least able to afford to lose.

The Core was doing the job of a scoreboard — giving a run one nameable ending — while
looking like a mechanic. §3 below gives P0 endings that are named just as clearly and are
caused by the systems P0 is actually testing.

## 2. The Core block is removed

**[in]** `Core` is no longer a block kind. P0 has four: structural, station, depot, hatch.

- The editor palette no longer offers one.
- "No core block" and "more than one core block" are no longer violations. Neither rule was
  ever specified; the second in particular banned redundancy for no stated reason.
- A blueprint saved with a core loads with that voxel turned into a **plain structural block
  of the same material**. Geometry, mass, bill of materials and cost are unchanged by the
  migration, which is what makes it safe to apply silently: §3 of the P0 spec calls the
  persisting library "the entire cross-run progression", so saved designs survive this
  change rather than being refused.

## 3. How a run ends

A run ends in exactly one of three outcomes. Two are losses.

### 3.1 Wrecked

**Nothing is left standing: no block is alive.** Checked every tick; the loss is immediate,
because there is no state left to check anything else against.

### 3.2 Unmanned

**No alive station block has a live gunner.** A turret in this state cannot shoot, and P0
has no other weapon (§4.2: "firepower equals manned stations"), so it can no longer affect
the run's outcome. It has two causes and both are the player's design showing:

- every station block has been destroyed, burned, or dropped by a collapse, or
- no crew are left alive to stand at the ones that remain.

**Checked once per inter-wave window, after repair and reassignment, and only when there is
another wave to fight.** The timing is the rule, not an implementation detail:

- **Mid-wave silence is a punishment, not a defeat.** Losing every gun at 40 seconds into a
  wave already costs the player that wave's defence. Ending the run on the same tick would
  also delete the repair window, which is the second half of §1.2's loop.
- **A turret whose guns are gone but whose crew live is recoverable, and should be.** Repair
  rebuilds against the stored blueprint (§4.4), so stations come back and crew re-man them.
  That comeback is a story worth having in a prototype whose whole subject is fix-and-rerun.
- **A turret with no crew left is not recoverable**, because the crew pool is fixed and does
  not grow (§4.4). The check catches that case at the same moment, with no separate rule.

So the question the check asks is precisely: *can this design still fight the next wave?*
Asked at the only moment where the answer is settled.

### 3.3 Won

**Survive all five waves without either loss.** The unmanned check does not run after
wave 5 — there is no wave 6, so a turret that limps over the line silent has still held the
lane for the run it was asked to hold.

## 4. Silenced is a state, not an outcome

Having no manned station **during** a wave is worth showing and is not a loss. It is
recorded as an event when it begins and when it ends, and the run report says how long a
run spent silenced. This is the same class of readout as a dry station (§4.3): a legible
consequence the player caused, surfaced at the moment it bites.

It is also the state that §5 turns into a mechanic later, so P0 should start measuring it
now.

## 5. Seam: an unmanned turret is a capture target

Added to the P0 spec's §6 list.

An unmanned turret that is still standing is a *different object* from a wrecked one, which
is why §3 keeps them as two outcomes rather than folding unmanned into wrecked. In later
phases a standing, silent turret is what an attacker **pillages or captures** rather than
destroys — the structure is intact and valuable, and it is the crew that were the defence.
P0 does not implement capture. It implements the distinction capture needs, and it produces
the fact capture consumes: the moment a turret stopped being able to shoot while still being
worth taking.

This also puts the Core's one genuine future job back where it belongs. If a later phase
wants an objective a turret carries, it re-enters as *cargo on a mobile platform* or as the
holdable thing on a map node — both already seams in §6 — and not as a voxel the P0 editor
demands.

## 6. Dial table amendment

The `Win condition` row of the P0 spec's §5 table is replaced by two rows:

| Dial | P0 value |
|---|---|
| Win condition | Survive five waves |
| Loss conditions | No block alive (immediate), or no manned station at the end of an inter-wave window |

No other dial changes.

## 7. What this does to the worked examples

The worked examples (P0 spec §1.2's fix-and-rerun loop is taught with them) each lose a core
voxel and lose nothing else. Their lessons survive, and two of the three get sharper:

- **reaching gun** — the five-voxel wood cantilever still shears at its root on the first
  solve. It used to be narrated as "the arm goes, and then the core is reachable through the
  front wall"; it is now narrated as "the arm goes, and the arm *was* the gun". The design's
  single station falls with it, which is §3.2 exactly. The lesson is the same failure and a
  shorter path to it.
- **wood frame** — fire eating the floor under the guns is now the loss itself rather than a
  route to one. The example was already about putting the flammable body under the stations;
  it no longer needs a core sunk in it to make the point.
- **stone keep** — unchanged in outcome. It survives five waves behind two rings of stone
  and hands the player a 171-material bill for one gun. Removing the core does not make it
  cheaper in the way that matters, and it now says something it could not say before: one
  gun is also one station block away from §3.2.

The third is the important one to keep. It is P0's honest answer about blobs (§1, claim 3),
and this change is only worth making if the blob still loses on cost and firepower after it.
