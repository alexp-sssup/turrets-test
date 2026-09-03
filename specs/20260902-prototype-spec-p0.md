# Prototype spec — P0 "One Turret, One Lane"

Derived from gameplay spec v0.2. This is not a reduced version of the game; it is the smallest build that answers the questions the rest of the design depends on. Everything cut here is cut with a named seam it re-enters through.

Tags: **[in]** shipped in P0, **[stub]** present but trivial, **[out]** deferred with a seam.

---

## 1. Purpose

P0 exists to test three claims. If any fails, large parts of v0.2 need rework, so nothing else should be built first.

1. **The solver is fast and readable enough.** Structural soundness re-evaluates under live damage at interactive rates, and a player can look at a heatmap and predict a failure before it happens.
2. **The core loop is fun.** Lose a turret → watch the replay → see the joint that sheared → fix the blueprint → survive next time. This is the progression system; if it doesn't hold a player for six attempts, the game has no engine.
3. **Anti-blob pressure works without a rule.** Firing arcs, crew paths, haul distance, fire propagation, and cost should make a solid block lose on their own.

Nothing in P0 needs to be fun in the way the shipped game is fun. It needs to make these three claims true or false.

---

## 2. What P0 is

A single fixed arena. The player designs one static turret in the editor against a fixed material budget, places it on a marked pad, and a scripted attacker advances down one lane in five waves. The turret fights back automatically. Between waves, assigned crew repair against the stored blueprint. Survive five waves and the run is won; the blueprint persists either way.

No opponent player, no map, no extraction, no mobility, no tech tree.

---

## 3. Scope

| System | P0 | Note |
|---|---|---|
| Voxel editor + LP structural solver | **[in]** | The whole point |
| Heatmap, per-joint utilization, predictive highlight | **[in]** | Not polish. First-class. |
| Collapse replay with timestamps + first-failed-joint | **[in]** | Second half of the loop |
| Material-locked blueprints | **[in]** | Two materials, so cheap to honour now |
| Crew stations with firing arc + hatch access | **[in]** | Supplies the anti-blob pressure |
| Crew as hard pool; die in collapses | **[in]** | Fixed pool, no growth |
| Automatic crew repair against blueprint | **[in]** | Cheap, and [decided] |
| Munition depots + crew resupply trips | **[in]** | Simulated, not abstracted. Cost increase — see §4.3. |
| Recoil impulse at station block | **[in]** | Resolves the open [proposed]. See §7. |
| Blueprint library persists between runs | **[in]** | Free; it is the entire cross-run progression |
| Test range with damage simulation | **[stub]** | The arena *is* the test range in P0 |
| Materials | **2** | Wood, stone. No processing buildings. |
| Damage verbs | **2** | Kinetic, fire |
| Weapon classes | **1** | One station type, two ammo loads |
| Economy | **[stub]** | One fixed budget number |
| Targeting | **[stub]** | Auto-fire, click-to-focus override |
| Wheeled platforms, tipping, centre of mass | **[out]** | §8 |
| Second player / 1v1 | **[out]** | §8 |
| Three roads, capture, node holding | **[out]** | §8 |
| Food, housing, population growth | **[out]** | §8 |
| Metallurgy and chemistry branches | **[out]** | §8 |
| Explosive, shrapnel, corrosive | **[out]** | §8 |
| Pillaging, late central node, boarding | **[out]** | §8 |

---

## 4. Systems as built

### 4.1 Materials

Two raw materials, no processing, no buildings. They are chosen because they differ in *kind* along the two axes P0 tests — structural behaviour and fire — which is the claim material-locked blueprints rest on.

| Material | Cost/voxel | Behaviour | Weakness |
|---|---|---|---|
| Wood | 1 | Light; tolerates tension | Burns; propagates fire to contiguous wood |
| Stone | 3 | Heavy; compression only | Brittle; fractures under concentrated impact |

Blueprints are material-locked. A wood frame and a stone frame are two authored designs. Mixed-material designs are allowed and are expected to be where the interesting play is.

### 4.2 Crew stations

One station block. It requires a clear firing arc and a traversable crew path to a hatch; both are validated in the editor and shown as violations, not silently ignored. One crew per station. Crew at a station can be killed through the port without destroying the block, silencing that gun.

Firepower equals manned stations. There is no other weapon.

### 4.3 Ammunition and depots

Two loads, differentiated by verb, not power. Each is made of a P0 material, which is what gives it weight:

| Load | Body | Weight | Verb |
|---|---|---|---|
| Solid shot | Stone | 3 | Kinetic — deep, narrow penetration |
| Firepot | Wood | 1 | Incendiary — ignites wood, propagates along contiguous flammables, flows downward before igniting |

Munition depots are placeable blocks. They store ammunition and they detonate when penetrated.

**Resupply is simulated, not abstracted.** Ammunition does not teleport. It is carried, by a crew member, along a path, and the path can be cut.

**Carry limit is a weight budget, not a round count.** Rounds per trip is derived: `floor(carry capacity / shot weight)`. At a 12-unit capacity that is 4 solid shot or 12 firepots. Weight is the right unit because it survives the material tree — a steel shot in P3 is heavier than a wood shot automatically, from the density the solver already computes for structural reasons, with no per-ammo capacity tuning. A round count would need re-modelling the moment a second shot material exists.

The cycle:

1. Each station block has a small **ready rack** holding a few units of weight. The gunner fires from the rack.
2. When the rack runs low, it is refilled from a depot by a crew member walking the crew path — the same traversable path the editor already validates for hatch access.
3. **Default: the gunner goes.** No new role, and the gun is silent for the round trip. This is the legible baseline penalty.
4. **Optional: assign runners.** Spare crew can be assigned to a runner pool. A runner tops up racks so the gunner never leaves the station. This is one new assignment category (§4.4) and it turns the fixed crew pool into a real allocation puzzle: gunners vs. repair vs. runners.

Three consequences worth protecting:

- **Rate of fire becomes burst-and-lull, not a flat multiplier.** A rhythm the player can hear, design around, and exploit on the attacking side.
- **Severing a corridor silences a gun without destroying it.** If no traversable path from a station to any depot exists, the station fires its rack dry and falls silent. This is a new attack vector that pairs with deep kinetic penetration, and it makes the structural sim bite the weapon system directly rather than through a coefficient.
- **Depot dispersal has two-sided pressure.** Several small depots mean shorter trips and less catastrophic loss when one cooks off; they also cost more and create more liabilities. One central depot is cheap and one penetration away from ending the run.

**Editor support is mandatory, not optional.** Per station, the editor shows the path to its nearest depot, the round-trip time, and rounds-per-trip for each load. Discovering haul cost only at runtime would violate the readable-solver principle that the rest of the prototype rests on. Stations with no depot path are flagged as violations alongside hatch-access failures.

**Cost note, honestly.** This replaces one multiplication with runtime pathfinding plus path invalidation as blocks die, and it lands on the critical path for P0's performance claim (§1.1). That is a real increase in prototype scope. It is worth it because the abstraction was hiding the exact coupling the game is about. Pathfinding must use fixed tie-breaks so runs stay deterministic (§4.5) — a runner who picks a different route on the second attempt breaks the fix-and-rerun loop.

Depots refill for free during the inter-wave window. Ammunition production is an economy concern and stays out of P0.

### 4.4 Crew as a resource

Fixed pool of 12 crew for the whole run. No growth, no food, no housing. Crew are assigned to three categories — stations, repair details, and the runner pool (§4.3) — and reassignment is allowed during the inter-wave window. Crew inside a collapsing section die and do not come back. A five-wave run therefore has an attrition arc without any economy code, and the coupling being tested — *structural failure costs you the thing that makes you dangerous* — is present in full.

### 4.5 The attack

Five scripted waves down one lane. The script is fixed and identical on every run.

**Determinism is a requirement, not a nice-to-have.** The loop in §1.2 only works if a blueprint change is the only variable between two attempts. This also lets the replay be an input log rather than a state capture, which is much cheaper.

Waves escalate along the two verbs so both materials get tested:

1. Light kinetic, single approach — teaches arcs
2. Light kinetic, two approaches — teaches coverage
3. Incendiary — punishes contiguous wood
4. Heavy kinetic, concentrated on one face — punishes brittle stone and unbraced frames
5. Mixed, sustained — punishes depot placement and crew redundancy

### 4.6 Targeting

Stations auto-fire at the nearest valid target in arc. The player may click a target to focus fire. This is a deliberate deviation from the v0.2 [decided] of fully user-driven targeting — not a reversal. The APM risk in that decision only appears at three lanes and multiple turrets, which P0 cannot reproduce, so P0 defaults to the cheaper option and leaves the question open.

---

## 5. Dials

Placeholders, all data-driven, all expected to move.

| Dial | P0 value |
|---|---|
| Material budget per run | 500 |
| Crew pool | 12 |
| Crew per station | 1 |
| Crew per repair detail | 2 |
| Waves | 5 |
| Inter-wave repair window | 30 s |
| Crew carry capacity | 12 weight units |
| Station ready rack | 9 weight units |
| Rack refill threshold | 3 weight units |
| Crew walk speed | 2 voxels/s |
| Depot capacity | 240 weight units |
| Win condition | Core block intact after wave 5 |

Rack size relative to carry capacity is the sensitive one. A rack much larger than a carry load means constant trips; much smaller means the trip was pointless. Start at 9 against 12 and tune from there.

---

## 6. Extension seams

The point of building P0 this way. Each deferred system re-enters at exactly one place.

- **Materials are a table row, not code.** A material is `{cost, density, tension capacity, compression capacity, flammability, fracture behaviour}`. Coal, ceramic, iron, and steel are four rows. Adding them requires no solver change.
- **Damage verbs implement one interface** against the block/joint API: `apply(impact, blockSet) → {destroyed blocks, degraded joints, ignitions}`. Shrapnel, explosive, and corrosive are three implementations. Corrosive is already accounted for by making joints, not blocks, the unit of degradation in P0.
- **Cost comes from a budget provider.** P0's provider returns a constant. The extraction economy replaces that one object; blueprint cost is already a bill of materials, so nothing downstream changes.
- **Crew is a pool with an assignment layer.** P0 supplies it with a constant. Growth rate, housing cap, and food consumption replace the supply side only; assignment, death, and repair are untouched.
- **Processing is a graph the budget provider consults.** P0's graph is empty. Kilns, smelters, and the powder mill are nodes with throughput limits added to it — the pacing dial arrives fully formed and is never load-bearing on anything else.
- **Weapon classes are station data.** `{gating material, damage verb, recoil impulse, arc, range, rack size, accepted loads}`. Crossbow, musket, heavy gun, mortar, and pitch sprayer are five rows against the existing station block. Rack size per class is where a mortar and a crossbow differentiate logistically without new code.
- **Shot weight falls out of the material table.** Because carry limit is a weight budget (§4.3), adding steel shot or explosive shell adds a row and the rounds-per-trip consequence is automatic. Nothing about resupply needs retuning per ammunition type.
- **Resupply is frame-local.** Trips happen along paths inside the structure, so the system works unchanged once turrets are on wheeled platforms — the depot moves with the frame. No special case for mobility.
- **The arena is one node.** Give it a material-availability set and a connection list and it becomes a map node. Three fanning roads are seven or so instances plus a capture rule.
- **The attacker is a controller behind an interface.** P0 hands it a script. A second player, or an AI fielding mobile turrets, implements the same interface.
- **Mobility is a platform component under a turret.** Mass and centre of mass are already computed by the solver for structural reasons; the wheeled platform reads them rather than introducing them.

---

## 7. What P0 decides

- **Recoil.** Ships as a per-shot impulse at the station block, scaled by weapon class. It is a few lines against the existing solver and it is the only thing coupling weapons to structure. P0 either shows that a heavy weapon on an unbraced frame damages its own structure in a way players find legible and fair, or it doesn't and the [proposed] tag comes off as a rejection.
- **Solver readability.** Whether the heatmap and predictive highlight actually let a player anticipate a collapse, or whether they only make sense in hindsight during the replay.
- **Anti-blob.** Five of the six pressures are present (arcs, crew paths, haul, fire propagation, cost — mass excepted), and haul now has teeth rather than being a coefficient. If the blob still wins, the answer is not to add a rule but to find which pressure is underweighted.
- **Whether simulated resupply is legible or just annoying.** The risk is that a player perceives a dry station as the game cheating rather than as a design flaw they caused. Editor round-trip display and the replay showing the runner's severed path are the mitigations; if they don't work, fall back to the coefficient.
- **Crew numbers, partially.** Crew per station, repair detail sizing, and the gunner-vs-runner allocation get real data. Growth rate, housing, and food rate do not.

## 8. What P0 cannot decide

State these up front so results aren't over-read:

- Whether user-driven targeting becomes an APM contest. Needs three lanes and multiple turrets.
- Road geometry and whether fanning approaches make defence cheap near home.
- Whether material availability per node actually prevents mirror matches. Needs a map and a library.
- Whether capture-costs-crew self-limits snowballing.
- Whether the food floor prevents a death spiral.
- Anything about 1v1 pacing, tempo, or comeback potential.

---

## 9. Build order after P0

1. **P1 — Two-sided.** Mobile platforms, mass and tipping, a second player, one lane. Tests the tower-defence shape.
2. **P2 — Map and economy.** Extraction nodes, capture, three roads, throughput-limited processing. Tests income under contest.
3. **P3 — Full material tree.** Metallurgy and chemistry branches, remaining weapon classes, remaining damage verbs. Tests library breadth.
4. **P4 — Population.** Growth, housing, food floor and contested ceiling.

Acid and corrosive munitions stay last in P3, per the v0.2 scope note — longest branch, least legible failure mode, and the four verbs before them already cover the space.
