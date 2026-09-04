import { IVec3 } from "../core/IVec3";
import { AMMO_LOAD_COUNT, AmmoLoadId, AmmoTable } from "../materials/AmmoTable";
import { BlockKind, blockKindName } from "../blueprint/BlockKind";
import { MaterialId } from "../materials/MaterialId";
import { MaterialTable } from "../materials/MaterialTable";
import { StationReadout } from "../editor/StationReadout";
import { violationKindName } from "../editor/Violation";
import { FieldFrame } from "../render/FieldFrame";
import { Palette } from "../render/Palette";
import { PredictOutcome } from "../render/PredictAnalysis";
import { OverlayMode } from "../render/ViewState";
import { structuralStatusName } from "../structure/StructuralReport";
import { WorkedExample } from "../data/WorkedExamples";
import { Dom } from "./Dom";
import { FieldControls } from "./FieldControls";
import { EditorModel } from "./EditorModel";

/**
 * The Design screen's panels (UI spec 3.1).
 *
 * The validation panel is always open, never a modal and never a blocking error, and every
 * row locates itself on the field when clicked. The point is that a design's problems are
 * ambient while the tester lays it out rather than a gate they hit at the end.
 *
 * Every section carries a `data-group`, which is the tab the panel sheet files it under on
 * a small screen (mobile UI spec 4.3). The groups are the existing panels, not new ones,
 * and no panel is cut: `always` marks the ones that show whichever tab is selected. `coarse`
 * is the pointer kind (3.2) and it changes the *copy* only -- an instruction to alt-click is
 * useless to a finger (6.3), and the words come from the one hint table so they cannot drift
 * from the caption (6.4).
 */
export class DesignPanels {
  public static render(
    editor: EditorModel,
    frame: FieldFrame,
    materials: MaterialTable,
    ammo: AmmoTable,
    selected: IVec3 | null,
    overlay: OverlayMode,
    predict: PredictOutcome | null,
    coarse: boolean
  ): string {
    return (
      DesignPanels.paletteSection(editor, materials, coarse) +
      DesignPanels.billSection(editor, materials) +
      DesignPanels.validationSection(editor) +
      DesignPanels.selectionSection(editor, frame, ammo, selected, overlay, predict, coarse) +
      DesignPanels.actionsSection(editor)
    );
  }

  private static paletteSection(
    editor: EditorModel,
    materials: MaterialTable,
    coarse: boolean
  ): string {
    const entries = EditorModel.palette();
    let html =
      '<section class="panel" data-group="palette"><h2>palette</h2><div class="palette">';
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const cost = entry.erases ? 0 : materials.get(entry.material).costPerVoxel;
      // Palette-material spec 2.2: the material's fill with the kind's badge over it, which
      // is the pair of marks `VoxelPainter` puts on the placed voxel. A tester who has seen
      // the chip can find the block in the design, and the other way round.
      const swatch = entry.erases ? "transparent" : Palette.materialFill(entry.material);
      const badge =
        entry.erases || entry.kind === BlockKind.Structural
          ? ""
          : ";box-shadow:inset 0 0 0 2px " +
            Palette.kindColour(entry.kind) +
            ";color:" +
            Palette.kindColour(entry.kind);
      html +=
        '<button class="palette-entry' +
        (entry.key === editor.palette.key ? " active" : "") +
        '" data-action="palette" data-value="' +
        entry.key +
        '"><span class="swatch" style="background:' +
        swatch +
        badge +
        '">' +
        (entry.erases ? "" : Dom.escape(Palette.kindGlyph(entry.kind))) +
        '</span><span class="palette-label">' +
        Dom.escape(entry.labelWith(materials)) +
        "</span>" +
        (entry.erases
          ? '<span class="palette-cost">—</span>'
          : '<span class="palette-cost">' + cost.toString() + "</span>") +
        "</button>";
    }
    html +=
      '</div><p class="hint">' +
      Dom.escape(FieldControls.hintFor("place", coarse)) +
      ". every placement updates the bill below as you make it. " +
      Dom.escape(FieldControls.hintFor("inspect", coarse)) +
      ", which places nothing. <kbd>z</kbd> undo, <kbd>y</kbd> redo.</p></section>";
    return html;
  }

  private static billSection(editor: EditorModel, materials: MaterialTable): string {
    const bill = editor.blueprint().billOfMaterials();
    const wood = bill.countOf(MaterialId.Wood);
    const stone = bill.countOf(MaterialId.Stone);
    const remaining = editor.remainingBudget;
    return (
      '<section class="panel" data-group="bill"><h2>bill of materials</h2><table class="kv">' +
      DesignPanels.row("wood", wood.toString() + " × " + materials.get(MaterialId.Wood).costPerVoxel.toString()) +
      DesignPanels.row("stone", stone.toString() + " × " + materials.get(MaterialId.Stone).costPerVoxel.toString()) +
      DesignPanels.row("blocks", editor.blockCount.toString()) +
      DesignPanels.row("cost", editor.cost.toString()) +
      DesignPanels.row(
        "remaining",
        '<span class="' + (remaining < 0 ? "bad" : "good") + '">' + remaining.toString() + "</span>"
      ) +
      "</table></section>"
    );
  }

  /**
   * The validation panel. Structural rows are marked as catching up rather than omitted:
   * a panel that silently drops the margin while the solver runs would teach a tester that
   * the margin is unreliable.
   */
  private static validationSection(editor: EditorModel): string {
    const geometry = editor.geometry;
    const structural = editor.structural;
    let html = '<section class="panel" data-group="validation"><h2>validation</h2>';

    if (structural === null) {
      html += '<p class="hint">' + (editor.awaitingSolve ? "analysing…" : "nothing placed yet") + "</p>";
    } else {
      const status = structuralStatusName(structural.status);
      const standing = structural.isStanding;
      html +=
        '<table class="kv">' +
        DesignPanels.row(
          "structure",
          '<span class="' + (standing ? "good" : "bad") + '">' + Dom.escape(status) + "</span>" +
            (editor.awaitingSolve ? ' <span class="stale">re-solving…</span>' : "")
        ) +
        DesignPanels.row("load factor", Dom.number(structural.loadFactor, 3)) +
        DesignPanels.row("peak utilization", Dom.number(structural.maxUtilization(), 3)) +
        DesignPanels.row("tipping margin", Dom.number(structural.tippingMargin, 2)) +
        DesignPanels.row(
          "joints",
          structural.joints.jointCount.toString() +
            " (" +
            structural.criticalJoints.length.toString() +
            " critical, " +
            structural.predictiveHighlight.length.toString() +
            " highlighted)"
        ) +
        DesignPanels.row("last solve", Dom.number(editor.solveMs, 0) + " ms") +
        "</table>";
      if (editor.solveMs > 16) {
        html +=
          '<p class="hint warn">a re-solve costs ' +
          Dom.number(editor.solveMs, 0) +
          " ms against a 16 ms budget at this cell count. that is the §1.1 performance answer, " +
          "and it is why the stress overlay updates a beat after an edit.</p>";
      }
    }

    if (geometry === null || geometry.violations.length === 0) {
      html += '<p class="ok">no violations.</p>';
    } else {
      html += '<ul class="violations">';
      for (let i = 0; i < geometry.violations.length; i++) {
        const violation = geometry.violations[i];
        html +=
          '<li data-action="locate" data-value="' +
          violation.block.toString() +
          '"><span class="violation-kind">' +
          Dom.escape(violationKindName(violation.kind)) +
          "</span>" +
          (violation.detail.length > 0
            ? '<span class="violation-detail">' + Dom.escape(violation.detail) + "</span>"
            : "") +
          (violation.block >= 0 ? '<span class="locate">locate</span>' : "") +
          "</li>";
      }
      html += "</ul>";
    }
    return html + "</section>";
  }

  private static selectionSection(
    editor: EditorModel,
    frame: FieldFrame,
    ammo: AmmoTable,
    selected: IVec3 | null,
    overlay: OverlayMode,
    predict: PredictOutcome | null,
    coarse: boolean
  ): string {
    if (selected === null) {
      // 6.3: the copy stops telling a finger to alt-click and says what that pointer can do.
      return (
        '<section class="panel" data-group="inspector"><h2>inspector</h2><p class="hint">' +
        Dom.escape(FieldControls.hintFor("inspect", coarse)) +
        ". select a station to see its arc, its route to a depot and what a resupply trip " +
        "costs.</p></section>"
      );
    }
    const blueprint = editor.blueprint();
    const block = blueprint.indexAt(selected);
    // 6.1: escape deselects, and a finger has no escape key, so the inspector carries the
    // close control the keyboard binding is the shortcut for.
    let html =
      '<section class="panel" data-group="inspector"><h2>inspector' +
      '<button class="panel-close" data-action="deselect" title="escape">close</button></h2>';
    html +=
      '<table class="kv">' +
      DesignPanels.row("cell", Dom.escape(selected.toString())) +
      (block < 0
        ? DesignPanels.row("contents", "empty")
        : DesignPanels.row(
            "contents",
            Dom.escape(
              editor.materialTable.get(blueprint.blockAt(block).material).name +
                " " +
                blockKindName(blueprint.blockAt(block).kind)
            ) +
              ' <span class="dim">#' +
              block.toString() +
              "</span>"
          ));
    if (block >= 0) {
      const utilization = frame.utilizationAtBlock(block);
      html += DesignPanels.row(
        "worst joint here",
        utilization < 0 ? "no joints" : Dom.number(utilization, 3)
      );
    }
    html += "</table>";

    if (block >= 0) {
      const readout = editor.geometry === null ? null : editor.geometry.readoutOf(block);
      if (readout !== null) {
        html += DesignPanels.stationReadout(readout, ammo, editor);
      }
    }

    if (overlay === OverlayMode.Predict) {
      html += DesignPanels.predictReadout(predict, selected);
    }
    return html + "</section>";
  }

  /** Spec 4.3's mandatory editor support, per selected station. */
  private static stationReadout(
    readout: StationReadout,
    ammo: AmmoTable,
    editor: EditorModel
  ): string {
    let rounds = "";
    for (let load = 0; load < AMMO_LOAD_COUNT; load++) {
      const id = load as AmmoLoadId;
      rounds +=
        (rounds.length > 0 ? ", " : "") +
        readout.roundsPerTrip(id).toString() +
        " " +
        Dom.escape(ammo.get(id).name);
    }
    return (
      '<h3>station</h3><table class="kv">' +
      DesignPanels.row(
        "arc clear",
        '<span class="' +
          (readout.arcClearFraction < 0.5 ? "bad" : "good") +
          '">' +
          (readout.arcClearFraction * 100).toFixed(0) +
          "%</span>" +
          (readout.arcCentreClear ? "" : ' <span class="bad">centre line blocked</span>')
      ) +
      DesignPanels.row(
        "nearest depot",
        readout.nearestDepot < 0
          ? '<span class="bad">no route</span>'
          : "#" + readout.nearestDepot.toString()
      ) +
      DesignPanels.row("round trip", Dom.seconds(readout.roundTripSeconds)) +
      DesignPanels.row("rounds per trip", rounds) +
      DesignPanels.row(
        "crew route in",
        readout.hasEntryRoute ? "yes" : '<span class="bad">none</span>'
      ) +
      DesignPanels.row("walk speed", editor.dialValues.crewWalkSpeed.toString() + " voxels/s") +
      "</table>"
    );
  }

  private static predictReadout(predict: PredictOutcome | null, selected: IVec3): string {
    if (predict === null || !predict.cell.equals(selected)) {
      return '<h3>predict</h3><p class="hint">solving…</p>';
    }
    if (!predict.collapses) {
      return (
        '<h3>predict</h3><p class="ok">nothing else falls if this cell dies. (' +
        Dom.number(predict.solveMs, 0) +
        " ms)</p>"
      );
    }
    return (
      '<h3>predict</h3><table class="kv">' +
      DesignPanels.row("blocks that follow", predict.lostBlocks.length.toString()) +
      DesignPanels.row("joints that shear", predict.severedJoints.length.toString()) +
      DesignPanels.row("margin after", Dom.number(predict.loadFactorAfter, 3)) +
      DesignPanels.row("cost of the answer", Dom.number(predict.solveMs, 0) + " ms") +
      "</table>"
    );
  }

  private static actionsSection(editor: EditorModel): string {
    return (
      '<section class="panel actions" data-group="always">' +
      '<div class="button-row">' +
      '<button data-action="undo"' +
      (editor.canUndo ? "" : " disabled") +
      ">undo</button>" +
      '<button data-action="redo"' +
      (editor.canRedo ? "" : " disabled") +
      ">redo</button>" +
      '<button data-action="library">library</button>' +
      "</div>" +
      '<label class="name-field">name<input data-input="name" value="' +
      Dom.escape(editor.blueprintName) +
      '" /></label>' +
      '<button class="primary" data-action="allocate">allocate crew →</button>' +
      "</section>"
    );
  }

  public static row(label: string, value: string): string {
    return "<tr><th>" + Dom.escape(label) + "</th><td>" + value + "</td></tr>";
  }

  /** The library stub (UI spec 3): local list, fork, rename, JSON import/export. */
  public static library(
    examples: readonly WorkedExample[],
    savedNames: readonly string[],
    currentName: string
  ): string {
    let html =
      '<section class="panel" data-group="always"><h2>library</h2>' +
      '<p class="hint">local to this browser. no sharing UI in P0 — the export format is the ' +
      "seam a server would sit behind.</p><h3>worked examples</h3><ul class=\"library-list\">";
    for (let i = 0; i < examples.length; i++) {
      html +=
        '<li><button data-action="fork-example" data-value="' +
        Dom.escape(examples[i].key) +
        '">' +
        Dom.escape(examples[i].title) +
        "</button>" +
        '<span class="library-lesson">' +
        Dom.escape(examples[i].lesson) +
        "</span></li>";
    }
    html += "</ul><h3>saved designs</h3>";
    if (savedNames.length === 0) {
      html += '<p class="hint">nothing saved yet.</p>';
    } else {
      html += '<ul class="library-list">';
      for (let i = 0; i < savedNames.length; i++) {
        const name = savedNames[i];
        html +=
          '<li><button data-action="load-saved" data-value="' +
          Dom.escape(name) +
          '">' +
          Dom.escape(name) +
          (name === currentName ? " (open)" : "") +
          "</button>" +
          '<button class="small" data-action="delete-saved" data-value="' +
          Dom.escape(name) +
          '">delete</button></li>';
      }
      html += "</ul>";
    }
    html +=
      '<div class="button-row"><button data-action="save">save</button>' +
      '<button data-action="export-blueprint">export JSON</button>' +
      '<button data-action="import-blueprint">import JSON</button></div>' +
      '<textarea data-input="import" placeholder="paste blueprint JSON here, then press import"></textarea>' +
      '<button class="primary" data-action="design">← back to the editor</button>' +
      "</section>";
    return html;
  }
}
