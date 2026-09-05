import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Dials } from "../../src/config/Dials";
import { IVec3 } from "../../src/core/IVec3";
import { SampleBlueprints } from "../../src/blueprint/SampleBlueprints";
import { FieldDesign } from "../../src/render/FieldDesign";
import { FieldFrame } from "../../src/render/FieldFrame";
import { FrameBuilder } from "../../src/render/FrameBuilder";
import { PeelPlane } from "../../src/render/PeelPlane";
import { StructureCache } from "../../src/render/StructureCache";
import { ViewMode } from "../../src/render/ViewMode";
import { ViewState } from "../../src/render/ViewState";
import { ViewYaw } from "../../src/render/ViewYaw";
import { BlockStructure } from "../../src/structure/BlockStructure";
import { Arena } from "../../src/sim/Arena";

const dials = Dials.defaults();
const arena = Arena.p0();

function scene(): FieldDesign {
  return FieldDesign.withDefaults(SampleBlueprints.standardTurret(), arena.pad, arena, dials);
}

function frameOf(design: FieldDesign, structure: BlockStructure): FieldFrame {
  return new FrameBuilder(design).fromDesign(structure, null, null);
}

function peelOf(design: FieldDesign, view: ViewState): PeelPlane {
  return new PeelPlane(design.sliceMin, design.sliceMax, view.slice, view.yaw, view.mode);
}

function signature(design: FieldDesign, frame: FieldFrame, view: ViewState): number {
  return StructureCache.signature(view, frame, peelOf(design, view), 900, 600, 0);
}

describe("StructureCache (isometric renderer spec 8)", () => {
  it("is stable for an unchanged frame and view", () => {
    const design = scene();
    const structure = new BlockStructure(design.blueprint);
    const frame = frameOf(design, structure);
    const view = new ViewState(2);
    assert.equal(signature(design, frame, view), signature(design, frame, view));
  });

  it("changes for anything that changes a cached pixel", () => {
    const design = scene();
    const structure = new BlockStructure(design.blueprint);
    const frame = frameOf(design, structure);
    const view = new ViewState(2);
    const base = signature(design, frame, view);

    const zoomed = new ViewState(2);
    zoomed.scale = 24;
    assert.notEqual(signature(design, frame, zoomed), base);

    const panned = new ViewState(2);
    panned.panX = 40;
    assert.notEqual(signature(design, frame, panned), base);

    const turned = new ViewState(2);
    turned.yaw = ViewYaw.of(1);
    assert.notEqual(signature(design, frame, turned), base);

    const stepped = new ViewState(3);
    assert.notEqual(signature(design, frame, stepped), base);

    const flat = new ViewState(2);
    flat.mode = ViewMode.Flat;
    assert.notEqual(signature(design, frame, flat), base);

    assert.notEqual(StructureCache.signature(view, frame, peelOf(design, view), 800, 600, 0), base);
    // Spec 8's degradation order changes what is drawn, so it changes what is cached.
    assert.notEqual(StructureCache.signature(view, frame, peelOf(design, view), 900, 600, 1), base);
  });

  it("changes when a block takes damage or dies", () => {
    const design = scene();
    const view = new ViewState(2);
    const intact = new BlockStructure(design.blueprint);
    const base = signature(design, frameOf(design, intact), view);

    const hurt = new BlockStructure(design.blueprint);
    hurt.applyDamage(0, 3, design.materials);
    const damaged = signature(design, frameOf(design, hurt), view);
    assert.notEqual(damaged, base);

    const broken = new BlockStructure(design.blueprint);
    broken.destroy(0);
    assert.notEqual(signature(design, frameOf(design, broken), view), base);
    assert.notEqual(signature(design, frameOf(design, broken), view), damaged);
  });

  /**
   * The property the whole cache rests on: hover, selection and the joint callout are marks,
   * drawn live after the blit (spec 4.1), so they must not invalidate the pass. If they did,
   * every pointer move would rebuild the structure and the cache would be worse than nothing.
   */
  it("does not change when a mark moves", () => {
    const design = scene();
    const structure = new BlockStructure(design.blueprint);
    const frame = frameOf(design, structure);
    const view = new ViewState(2);
    const base = signature(design, frame, view);
    view.hover = new IVec3(2, 1, 4);
    view.selected = new IVec3(2, 2, 5);
    view.highlightJointLow = 3;
    view.highlightJointHigh = 4;
    assert.equal(signature(design, frame, view), base);
  });
});
