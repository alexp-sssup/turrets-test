# The structural solver

This is the design the rest of P0 rests on (spec §1.1). It is written down because the
claim being tested is not "does it compute a number" but "is the number *readable*".

## Model

* A **block** is one voxel. It is rigid and has mass `density x voxelVolume`.
* A **joint** is the shared face between two face-adjacent blocks. Joints are the unit of
  degradation (spec §6 -- this is what makes corrosive munitions a table row later).
* A **support** is the face between a block and the pad it rests on. Supports are joints
  to an implicit ground body which has no equilibrium equations.
* Blocks do not deform. Joints do. All failure is joint failure, which is what makes
  "the joint that sheared" a sentence the replay can say.

### Joint unknowns

Each joint gets a local orthonormal frame `(n, u, v)`, where `n` points from the lower to
the higher block index and `u`, `v` span the face. Six unknowns per joint:

| Symbol | Meaning | Sign convention |
|---|---|---|
| `N`  | normal force  | `> 0` compression (blocks pushed apart), `< 0` tension |
| `Su` | shear along `u` | -- |
| `Sv` | shear along `v` | -- |
| `Mu` | bending about `u` | -- |
| `Mv` | bending about `v` | -- |
| `T`  | torsion about `n` | -- |

The force and moment the joint applies **to the block on the `+n` side** are

```
F = N n + Su u + Sv v
M = Mu u + Mv v + T n
```

and the negatives of those apply to the block on the `-n` side.

### Equilibrium

For every block `b` (six scalar equations: three force, three moment about the block's own
centre):

```
sum over joints of b:  (+/-) F_k                     + lambda * W_b        = 0
sum over joints of b:  (+/-) ( M_k + r_bk x F_k )    + lambda * Q_b        = 0
```

`W_b` is the block's applied load (self weight plus any recoil impulse at that block, spec
§7), `Q_b` the applied moment, and `r_bk` is the vector from the block centre to the joint
centre. `lambda` is a single scalar multiplying **all** applied loads.

### Capacities

Per joint, from the weaker of the two materials it connects and the face area `A` with side
`s`:

```
-tensionCap * A  <=  N  <=  compressionCap * A          (variable bounds)
|Su| <= shearCap * A,  |Sv| <= shearCap * A             (variable bounds)
|T|  <= torsionCap * A * s                              (variable bounds)
|Mu| <= (N + tensionCap * A) * s/2                      (two rows)
|Mv| <= (N + tensionCap * A) * s/2                      (two rows)
```

The bending rule is the interesting one. It is the classical no-tension masonry rule: a
joint carries bending only insofar as the normal force can move off centre inside the
section, so **a stone joint's bending capacity is proportional to the compression already
on it**. A stone lintel with nothing on top of it carries no moment at all; the same lintel
under a heavy wall carries a real one. That is not a special case in the code -- it is one
linear constraint, and it is the reason "stone is compression only" (spec §4.1) is a
material row rather than a rule.

## What is solved

```
maximise   lambda
subject to equilibrium for every block
           joint capacities
```

This is the **static (lower bound) theorem of plastic limit analysis**: any force field
satisfying equilibrium and capacities proves the structure survives that load, and the
largest such multiplier equals the true collapse factor. So the optimum has a physical
meaning that a heuristic "support propagation" pass does not:

* `lambda* >= 1` -- the structure holds its current load, with `lambda*` as the margin.
* `lambda* < 1`  -- it collapses now, at `1/lambda*` times over capacity.
* infeasible      -- it cannot stand under any scaling (e.g. a floating block).
* unbounded       -- no load at all; margin is infinite.

### Utilization (the heatmap)

The optimum's forces balance `lambda*` times the real load, so utilization at the *real*
load divides them back down:

```
util(joint) = max over components of |value| / (lambda* * capacity)
```

The peak of the field is exactly `1 / lambda*`, so the heatmap and the headline number
cannot disagree -- which is the property that makes the heatmap trustworthy enough to
predict a failure from (spec §7 "solver readability").

Joints at or above `predictiveThreshold` (default 0.85) are reported as
`predictiveHighlight`: the joints that will go first if anything gets worse.

## Collapse resolution

When `lambda* < 1` the solver does not just report failure, it resolves it, because the
replay needs a first-failed joint and a cascade (spec §3):

1. Sever every joint whose utilization is `>= 1 - eps`; the first one in the ordering is
   the *first failed joint*.
2. Recompute connectivity to ground. Blocks in components with no support fall and are
   destroyed. Crew inside them die (spec §4.4).
3. Re-solve the remainder. Repeat until `lambda* >= 1` or nothing is left standing.

Each round emits a timestamped `CollapseEvent`, so a collapse is a short ordered story
rather than a boolean.

## Cost and the interactive-rate claim

Rows are `6 * blocks + 4 * joints`; columns are `6 * joints + 3 * supports + 1`. The LP is
solved by a dense bounded-variable simplex (`src/math/lp`), which is `O(rows * cols)` per
iteration. That is honest for P0-sized turrets (tens to low hundreds of blocks) and is the
measured quantity in `test/structure/StructuralSolver.perf.test.ts`.

Two seams are already in place for when it is not enough: `StructuralSolver` caches on a
structure version stamp so live damage only re-solves when the graph actually changed, and
the LP model is built through `LinearProgram`, so swapping the dense tableau for a sparse
revised simplex changes one class and no callers.

## Deliberate simplifications

Named, because the point of P0 is to know what it did not answer:

* No elastic deformation, so no stiffness-based load sharing. Limit analysis asks "can it
  stand", not "how much does it sag".
* Shear and bending components are bounded per axis rather than by a circular cone. Being
  box-constrained overestimates capacity for diagonal loading by at most `sqrt(2)`.
* Loads are applied at block centres, so recoil produces a moment about a *joint* through
  the lever arm, but never about the station block's own centre.
* Centre of mass and total mass are computed and exposed (`StructureMass`) even though P0
  has no tipping, because P1's platforms read them rather than introducing them (spec §6).
