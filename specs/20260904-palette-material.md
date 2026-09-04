# The palette names its material — P0 authors wood stations

Amends the palette sentence of *UI spec — P0 tester build* §3.1, which reads "Left rail is
the palette: wood, stone, station, depot, erase", and writes down the P0 restriction that
sentence has been silently enforcing since the first tester build.

References written **§n** point at the UI spec and **prototype §n** at the P0 prototype spec.

Code and tests cite this document as `palette-material spec n.n`.

---

## 1. A rail that cannot say what it authors

§3.1's list is five names, of which two are materials and three are kinds. That is a category
error, and the build resolved it the only way a flat list can: `EditorModel.palette()` hands
`MaterialId.Wood` to the station, depot and hatch entries and says so nowhere. No comment, no
spec sentence, no swatch — the station chip is drawn in the kind's blue, so nothing on screen
mentions wood at all.

Three documents describe the opposite model, and all three are right:

- `BlockKind.ts`, in its own header: "Kind is orthogonal to material: **a stone station and a
  wood station are both stations** (prototype §4.2)."
- Prototype §4.1: "Mixed-material designs are allowed and are expected to be where the
  interesting play is."
- Hatches §5 and §8: "A hatch is made of a material and burns exactly like it"; "A hatch
  still costs its material and nothing more."

The core implements that model in full. `BlueprintBlock` carries material and kind
independently, `BlockStructure` stores them in two arrays, and every subsystem reads the
material off the block. The palette is the only place that cannot express it.

### 1.1 The default is not neutral, measured

A station is a physical block in every subsystem — the joint graph builds full joints on it,
the kinetic verb spends damage on it, the walk graph treats it as solid. So its material is
load-bearing in the literal sense. Measured on a stone column with the middle block replaced:

| middle block | integrity | flammable | joints to the stone above and below |
|---|---|---|---|
| stone structural | 30 | no | compression 800, shear 200 |
| **wood station — what the palette authors** | **10** | **yes** | **compression 160, shear 80** |
| stone station — what the core supports | 30 | no | compression 800, shear 200 |

A joint takes the weaker side's capacity, so a wood station set into a stone wall is a **five
times** compression notch and a **two and a half times** shear notch at both its faces, at a
third of the wall's integrity, and it is the one flammable block in an otherwise inert
turret — with prototype §4.5's third wave being the incendiary one. None of that is wrong.
All of it is invisible.

## 2. The rule

### 2.1 P0's palette authors wood stations, wood depots and wood hatches

One material per kind entry, fixed, and it is wood. This is a **restriction of the editor,
not of the model**: a blueprint that arrives from anywhere else with a stone station stays
valid, loads, renders and behaves as a stone station, because nothing below the editor knows
the restriction exists.

### 2.2 Every entry says which material it is

The chip reads **`wood station`**, `wood depot`, `wood hatch`, and its swatch is the
**material's fill with the kind's badge over it** — the same two marks, in the same two
colours, that `VoxelPainter` puts on the placed voxel. A tester who has seen the chip can
find the block in the design, and the other way round.

The cost the chip shows is the material's cost per voxel, which is what it always was; it now
has a name attached to it, so `1` reads as wood's price rather than as the station's.

The label is **derived from the entry's material and kind**, never written out beside them. A
label that repeats a fact can contradict it, and this document exists because one did.

### 2.3 Choosing the material of a kind is P1 **[out]**

The successor is the obvious one — arm a material and a kind independently, two short rows
instead of one flat rail — and it is out of scope here. It is worth naming what makes it a
change rather than a fix: it is a second arming control, and §3.3's "every extra verb dilutes
the attribution" applies to state a tester has to remember as much as to gestures. It should
land when there is a design a tester wants to build that P0's rail cannot express, and the
telemetry of mobile §8 is where that shows up.

Until then, saying "wood station" out loud is the honest version of the restriction, and it
costs one word.

## 3. What does not change

- **Nothing below the editor.** No material row, no block, no joint, no verb, no dial. This
  document changes what the rail *says* and what it *authors*, and the second only by writing
  down what it already did.
- **The bill of materials**, which has always counted a station in the wood row, because it
  counts `block.material` like everything else. It was right; the palette was quiet.
- **The placed voxel.** It has always been drawn in the material's fill with the kind's badge
  over it. The chip is being brought into line with the block, not the other way round.
- **Erase**, which has no material and shows none (pointing spec 2.2).

## 4. Tests this document requires

- The label of every palette entry is derived: the two structural entries read as their
  material, the three kind entries read as material-then-kind, and the eraser reads as
  itself (2.2).
- Every kind entry authors a wood block, asserted through a placement rather than by reading
  the table back (2.1).
- A blueprint holding a stone station survives a load-and-build round trip with its material
  intact, which is the property 2.1 promises about the model (2.1).
