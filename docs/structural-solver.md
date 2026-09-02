# The structural solver

This is the design the rest of P0 rests on (spec §1.1). It is written down because the
claim being tested is not "does it compute a number" but "is the number *readable*".

## Model

* A **block** is one voxel. It is rigid and has mass `density x voxelVolume`.
* A **joint** is the shared face between two face-adjacent blocks. Joints are the unit of
  degradation (spec §6 -- this is what makes corrosive munitions a table row later).
* A **support** is the face between a block and the pad it rests on. Supports are joints
  to an implicit ground body which has no equilibrium equations, and they have **zero
  tension capacity**, because a turret is not bolted down.
* Blocks do not deform. Joints do. All failure is joint failure, which is what makes
  "the joint that sheared" a sentence the replay can say.

### Joint unknowns: corner forces, split into halves

Each joint gets a local orthonormal frame `(n, u, v)`, where `n` points from the lower to
the higher block index and `u`, `v` span the face.

Bending is **not** an unknown. Instead the normal force is resolved into **four corner
forces**, one at each corner of the face, at `(+/-lever * u, +/-lever * v)` where
`lever = voxelSize / 2`. Together with two shear components and one torsion, that is seven
generalised forces per joint, and the face's total normal force and its two bending
moments fall out of the corner distribution:

```
N  = sum of corner forces                     (positive = compression)
Mu =  lever * sum over corners of (v-sign * f)
Mv = -lever * sum over corners of (u-sign * f)
```

This is not a simplification. It is exactly the plastic interaction between axial force and
bending for a rectangular section, and it is what makes the model both correct and cheap:

* **Every capacity becomes a variable bound instead of a constraint row.** Rows are
  `6 * blocks` and nothing else. An explicit-moment formulation with an interaction
  constraint needs `6 * blocks + 4 * joints`, which for a 100-block turret is 1620 rows
  against 600 -- the difference between the solver being usable and not.
* **"Stone is compression only" needs no rule.** Corner forces whose tension bound is zero
  cannot pull, so the thrust line is confined inside the section. A stone joint therefore
  carries bending in proportion to the compression already sitting on it: a stone lintel
  with nothing above it carries none, the same lintel under a wall carries a real moment,
  and a free-ended stone arm -- whose axial force is pinned to zero by its own free tip --
  carries none at any length. That behaviour is a material table row, not a special case.

Each of those seven unknowns is then **split into two non-negative halves** (a corner's push
and pull, shear's forward and backward, torsion's two directions). That doubles the columns
and buys two things worth more than the columns cost:

1. Every variable has zero as a bound and every row is homogeneous, so the all-zero point
   is feasible and phase one of the simplex has nothing to do.
2. A nonbasic variable then rests at *zero* rather than at a capacity limit. With a signed
   formulation the simplex parks most unknowns on a capacity bound for reasons that have
   nothing to do with failure, and the utilization field -- the entire readability claim --
   degenerates into "every joint is at 100%". Measured on a five-voxel wood cantilever: 21
   of 21 joints critical with signed unknowns, 6 of 25 with split ones.

### Equilibrium

For every block `b`, six scalar equations (three force, three moment about the block's own
centre):

```
sum over joints of b:  (+/-) F_k                     + lambda * W_b        = 0
sum over joints of b:  (+/-) ( M_k + r_bk x F_k )    + lambda * Q_b        = 0
```

`W_b` is the block's applied load (self weight plus any recoil impulse at that block, spec
§7), `Q_b` the applied moment. Each corner force contributes at its own corner's lever, so
the bending moment is a consequence of geometry rather than a separate unknown. `lambda` is
a single scalar multiplying **all** applied loads.

## What is solved

```
maximise   lambda
subject to equilibrium for every block
           joint capacities (all variable bounds)
```

This is the **static (lower bound) theorem of plastic limit analysis**: any force field
satisfying equilibrium and capacities proves the structure survives that load, and the
largest such multiplier equals the true collapse factor. So the optimum has a physical
meaning that a heuristic "support propagation" pass does not:

* `lambda* >= 1` -- the structure holds its current load, with `lambda*` as the margin.
* `lambda* < 1`  -- it collapses now, at `1/lambda*` times over capacity.
* `lambda* = 0`  -- no admissible force field exists at any positive load.
* unbounded      -- no load at all; margin is infinite.

Note the program is never *infeasible*: `lambda = 0` with a zero force field always
satisfies it. So an infeasible verdict from the LP means a numerical failure, and the solver
reports it as unknown rather than as safe.

### Two per-joint fields, deliberately distinct

* `capacityShare(j)` -- the fraction of joint `j`'s capacity used at the **collapse** load.
  Because every capacity is a bound and the program is homogeneous, some bound must bind at
  the optimum, so the peak of this field is exactly 1 and the joints that reach it are the
  failure mechanism. This is what the replay names as the joint that sheared.
* `utilization(j) = capacityShare(j) / lambda*` -- how far the joint is along the way to
  failure at the **actual** load. Its peak is exactly `1 / lambda*`, so the heatmap and the
  headline margin cannot disagree, and a joint reaching 1 is a joint failing now. This is
  what gets coloured.

Joints at or above `predictiveThreshold` (default 0.85) are reported as
`predictiveHighlight`: empty while there is margin, filling up as the margin thins. On the
wood cantilever that means nothing highlighted at a 1.5x margin and the root joint
highlighted at 1.04x.

A symmetric structure legitimately has a large critical set -- every support under a
uniform column reaches capacity at the same instant -- so a big `criticalJoints` is not a
defect. `predictiveHighlight` is the player-facing signal.

### Tipping is reported separately

Overturning is invariant under the load factor: scale weight and recoil together and a block
tips at exactly the same ratio. So the program cannot express it, and it collapses to a hard
boundary -- inside the limit the joints govern, outside it there is no admissible force field
at all. `OverturningCheck` therefore computes the rigid-body ratio of restoring to
overturning moment about the footprint edges, and `StructuralReport.tippingMargin` reports
it alongside the load factor. That number moves continuously (2.0, 1.1, 0.9) as recoil grows
and is what explains an otherwise abrupt `Unsupportable`.

Spec §3 defers tipping and centre of mass to P1. This is the cheap version that falls out of
what the solver already computes, and nothing else depends on it.

## Collapse resolution

When `lambda* < 1` the solver does not just report failure, it resolves it, because the
replay needs a first-failed joint and a cascade (spec §3):

1. Sever the joints at capacity share 1 -- the failure mechanism.
2. Recompute connectivity to ground. Blocks in components with no support fall and are
   destroyed. Crew inside them die (spec §4.4).
3. Re-solve the remainder. Repeat until `lambda* >= 1` or nothing is left standing.

Each round emits a timestamped `CollapseEvent`, so a collapse is a short ordered story
rather than a boolean. Two cheap pre-checks in `SupportAnalysis` handle what the load factor
cannot see: blocks with no path to ground at all, and blocks whose joints cannot together
hold their own weight (a stone block hung from stone, where the program's optimum is a zero
force field and there is no force to point at).

## Numerical care

The linear program is solved by the bounded-variable simplex in `src/math/lp`, whose basis
inverse is dense and updated in product form. Three guards matter, and each was added
because its absence produced a confidently wrong answer:

* **A relative pivot floor.** Splitting each unknown into halves makes `A[x-] = -A[x+]`, so
  an entering half offers a numerically-tiny pivot against its partner's basis position.
  Taking it leaves the basis singular, which surfaced as a load factor of 0.50 instead of
  5.33 on a 210-block structure, thousands of iterations later.
* **Refactorisation on demand.** An "optimal" verdict is confirmed against a freshly
  factorised basis: a drifted inverse produces drifted duals, and drifted duals make a
  suboptimal vertex look optimal -- a wrong answer that passes a primal feasibility check.
  One `O(m^3)` factorisation per solve is far cheaper than refactorising on a schedule.
* **Bland's rule late, not early.** It guarantees termination but prices badly. Switching
  after 60 stalled iterations tripled iteration counts, because a degenerate program makes
  long runs of zero-improvement pivots that are real progress. It is a safety net.

## Cost, measured

Rows are `6 * blocks`; columns are `14 * joints + 1`. On the development machine, for
hollow turret shells:

| Blocks | Joints | Rows | Iterations | Time |
|---|---|---|---|---|
| 52  | 112 | 312  | 1 477  | 0.3 s |
| 89  | 193 | 534  | 2 744  | 1.2 s |
| 136 | 296 | 816  | 7 622  | 8 s |
| 193 | 421 | 1158 | 12 058 | 23 s |

So the P0 answer to spec §1.1 is split: **readable yes, fast only at small scale.**
Comfortable for editor-time analysis of a few dozen blocks; too slow for live re-analysis of
a turret near the 500-unit budget. Both seams for that are in place --
`StructuralAnalysisCache` keys on a structure version stamp so the many ticks that change
nothing cost nothing, and everything goes through `LinearProgram`, behind which a sparse LU
factorisation with Forrest-Tomlin updates and a warm-started dual simplex would replace the
dense basis inverse without touching a caller.

## Deliberate simplifications

Named, because the point of P0 is to know what it did not answer:

* No elastic deformation, so no stiffness-based load sharing. Limit analysis asks "can it
  stand", not "how much does it sag". Among the force fields that can carry the load, the
  one reported is a vertex of the admissible set rather than the stiffness-weighted one.
* Shear components are bounded per axis rather than by a circular cone. Being box-constrained
  overestimates shear capacity for diagonal loading by at most `sqrt(2)`.
* Loads are applied at block centres, so recoil produces a moment about a *joint* through
  the lever arm, but never about the station block's own centre.
* A mixed-material joint takes the weaker of the two capacities on every axis, which is why
  a wood arm bolted to a stone wall inherits stone's zero tension. A consequence worth
  knowing about: **a wood column standing on a stone floor is a hinge.** Its interface has
  no tension, so its bending capacity is proportional to the compression already on it,
  which scales with the load -- so like tipping it becomes a hard boundary rather than a
  graded margin, and the diagnosis is `Unsupportable` with no joint to point at. That is
  arguably the right physics for stacked masonry, but it means mixed-material load paths
  need a wider section where a single-material one would not.
* Centre of mass and total mass are computed and exposed even though P0 has no mobility,
  because P1's platforms read them rather than introducing them (spec §6).
