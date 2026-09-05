import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { CrewRole } from "../../src/crew/CrewMember";
import { AmmoTable } from "../../src/materials/AmmoTable";
import { MaterialTable } from "../../src/materials/MaterialTable";
import { FieldDesign } from "../../src/render/FieldDesign";
import { FrameBuilder } from "../../src/render/FrameBuilder";
import { Palette } from "../../src/render/Palette";
import { Arena } from "../../src/sim/Arena";
import { BlockStructure } from "../../src/structure/BlockStructure";
import { RunPanels } from "../../src/ui/RunPanels";

const dials = Dials.defaults();
const arena = Arena.p0();
const materials = MaterialTable.defaults();

/** Crew-visible spec 4.1's table, as the panels have to emit it. */
const ROLE_COLOURS: readonly string[] = ["#8b98ab", "#5fb2ff", "#54d18c", "#ffd166"];

function swatchFor(role: CrewRole): string {
  return '<span class="swatch role" style="background:' + ROLE_COLOURS[role as number] + '"></span>';
}

describe("the crew role key", () => {
  it("names the four documented colours (crew-visible spec 4.1)", () => {
    for (let role = 0; role < ROLE_COLOURS.length; role++) {
      assert.equal(
        Palette.crewHex(role),
        ROLE_COLOURS[role],
        "the field's colour is the document's colour"
      );
    }
  });

  it("rides on every role row of the allocate panel (crew-visible spec 4.2)", () => {
    const html = RunPanels.allocate(dials.crewPool, 2, 1, 2, 1, 3, false);
    assert.ok(html.includes(swatchFor(CrewRole.Gunner) + "gunners"));
    assert.ok(html.includes(swatchFor(CrewRole.Repair) + "repair details"));
    assert.ok(html.includes(swatchFor(CrewRole.Runner) + "runners"));
    assert.ok(html.includes(swatchFor(CrewRole.Idle) + "idle (unassigned)"));
  });

  it("rides on every role row of the crew panel (crew-visible spec 4.2)", () => {
    const blueprint = SampleBlueprints.standardTurret();
    const design = FieldDesign.withDefaults(blueprint, arena.pad, arena, dials);
    const frame = new FrameBuilder(design).fromDesign(new BlockStructure(blueprint), null, null);
    const html = RunPanels.run(
      frame,
      AmmoTable.defaults(materials),
      false,
      false,
      0,
      5,
      "wave one",
      [0, 2, 2, 8],
      -1
    );
    assert.ok(html.includes(swatchFor(CrewRole.Gunner) + "gunner"));
    assert.ok(html.includes(swatchFor(CrewRole.Repair) + "repair"));
    assert.ok(html.includes(swatchFor(CrewRole.Runner) + "runner"));
  });
});
