import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PANEL_GROUP_COUNT, PanelGroup, PanelSheet, panelGroupName } from "../../src/ui/PanelSheet";

/** Mobile UI spec 4.3: two states, the existing panel groups, and badges that are not decoration. */
describe("PanelSheet", () => {
  it("has exactly two states, with no drag-to-resize in between (mobile UI spec 4.3)", () => {
    const sheet = new PanelSheet();
    assert.equal(sheet.collapsed, true);
    sheet.toggle();
    assert.equal(sheet.collapsed, false);
    sheet.toggle();
    assert.equal(sheet.collapsed, true);
  });

  it("opens the sheet when a tab is selected, since a hidden panel is not a selection", () => {
    const sheet = new PanelSheet();
    sheet.setTabs([PanelGroup.Palette, PanelGroup.Validation]);
    sheet.setCollapsed(true);
    sheet.select(PanelGroup.Validation);

    assert.equal(sheet.selected, PanelGroup.Validation);
    assert.equal(sheet.collapsed, false);
  });

  it("keeps the tester's tab across a change of screen when the group is still there", () => {
    const sheet = new PanelSheet();
    sheet.setTabs([PanelGroup.Wave, PanelGroup.Stations, PanelGroup.Depots]);
    sheet.select(PanelGroup.Stations);
    // Run to Replay: the same groups plus `chain` (4.3).
    sheet.setTabs([PanelGroup.Wave, PanelGroup.Stations, PanelGroup.Depots, PanelGroup.Chain]);

    assert.equal(sheet.selected, PanelGroup.Stations);
  });

  it("falls back to the first tab when the selected group leaves the screen", () => {
    const sheet = new PanelSheet();
    sheet.setTabs([PanelGroup.Wave, PanelGroup.Chain]);
    sheet.select(PanelGroup.Chain);
    sheet.setTabs([PanelGroup.Palette, PanelGroup.Bill]);

    assert.equal(sheet.selected, PanelGroup.Palette);
  });

  /** Allocate, Summary and Library are one panel each: nothing to tab between (4.3). */
  it("names no group when there are no tabs, which is how every panel stays visible", () => {
    const sheet = new PanelSheet();
    sheet.setTabs([]);
    assert.equal(sheet.selectedName, "");
    assert.equal(sheet.render(), "");
  });

  /**
   * UI spec §3.2 gives dry and no-path stations the loudest treatment in the whole build,
   * and a panel behind a tab is the quietest place in it (mobile UI spec 4.3).
   */
  it("badges a group that has something the tester needs to see", () => {
    const sheet = new PanelSheet();
    sheet.setTabs([PanelGroup.Wave, PanelGroup.Stations]);
    sheet.setBadge(PanelGroup.Stations, 2);

    assert.equal(sheet.badge(PanelGroup.Stations), 2);
    assert.ok(sheet.render().indexOf('<span class="sheet-badge">2</span>') > 0);

    sheet.clearBadges();
    assert.equal(sheet.badge(PanelGroup.Stations), 0);
    assert.equal(sheet.render().indexOf("sheet-badge"), -1);
  });

  it("never badges a negative count", () => {
    const sheet = new PanelSheet();
    sheet.setBadge(PanelGroup.Validation, -3);
    assert.equal(sheet.badge(PanelGroup.Validation), 0);
  });

  /** The names are the `data-group` attributes the panels carry and the stylesheet matches. */
  it("round-trips every group name, so a tab cannot select a group that does not exist", () => {
    for (let i = 0; i < PANEL_GROUP_COUNT; i++) {
      const group = i as PanelGroup;
      assert.equal(PanelSheet.byName(panelGroupName(group)), group);
    }
    assert.equal(panelGroupName(PanelGroup.Chain), "chain");
    assert.equal(panelGroupName(PanelGroup.Inspector), "inspector");
  });

  it("marks the selected tab active only while the sheet is open", () => {
    const sheet = new PanelSheet();
    sheet.setTabs([PanelGroup.Palette, PanelGroup.Bill]);
    sheet.select(PanelGroup.Bill);
    assert.ok(sheet.render().indexOf('aria-selected="true"') > 0);

    sheet.setCollapsed(true);
    assert.equal(sheet.render().indexOf('aria-selected="true"'), -1);
  });
});
