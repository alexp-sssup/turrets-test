import { Dom } from "./Dom";

/**
 * The panel groups the sheet's tab bar selects between (mobile UI spec 4.3).
 *
 * They are the existing panels, not new ones. Each value's name below is the `data-group`
 * attribute the panel markup carries, which is how the stylesheet shows one group at a
 * time without any panel being rebuilt, cut or abridged (§5).
 */
export enum PanelGroup {
  Palette = 0,
  Bill = 1,
  Validation = 2,
  Inspector = 3,
  Wave = 4,
  Stations = 5,
  Depots = 6,
  Crew = 7,
  Lane = 8,
  Chain = 9,
}

export const PANEL_GROUP_COUNT: number = 10;

export function panelGroupName(group: PanelGroup): string {
  if (group === PanelGroup.Palette) {
    return "palette";
  }
  if (group === PanelGroup.Bill) {
    return "bill";
  }
  if (group === PanelGroup.Validation) {
    return "validation";
  }
  if (group === PanelGroup.Inspector) {
    return "inspector";
  }
  if (group === PanelGroup.Wave) {
    return "wave";
  }
  if (group === PanelGroup.Stations) {
    return "stations";
  }
  if (group === PanelGroup.Depots) {
    return "depots";
  }
  if (group === PanelGroup.Crew) {
    return "crew";
  }
  if (group === PanelGroup.Lane) {
    return "lane";
  }
  return "chain";
}

/**
 * The panel sheet of mobile UI spec 4.3, and the edge drawer of 4.4 -- the same object,
 * because they hold the same panels and differ only in where the stylesheet puts them.
 *
 * **Exactly two states**: collapsed (tab bar only) and open (fills the stage below the
 * field). No drag-to-resize, no snap points, no fling -- §11 keeps all three out, and a
 * physics problem is not something this prototype has any reason to own.
 *
 * The badges are the load-bearing part. §3.2 of the UI spec gives dry and no-path stations
 * "the loudest treatment in the whole build", and a panel behind a tab is the quietest
 * place in it, so a badge is that requirement re-stated for a layout where the panel is not
 * always visible -- not decoration.
 */
export class PanelSheet {
  private tabList: readonly PanelGroup[];
  private selectedValue: PanelGroup;
  private collapsedValue: boolean;
  private readonly badgeCounts: Int32Array;

  public constructor() {
    this.tabList = [];
    this.selectedValue = PanelGroup.Palette;
    this.collapsedValue = true;
    this.badgeCounts = new Int32Array(PANEL_GROUP_COUNT);
  }

  public get tabs(): readonly PanelGroup[] {
    return this.tabList;
  }

  public get selected(): PanelGroup {
    return this.selectedValue;
  }

  public get collapsed(): boolean {
    return this.collapsedValue;
  }

  /** The group whose panels the stylesheet should show, or "" when every panel shows. */
  public get selectedName(): string {
    if (this.tabList.length === 0) {
      return "";
    }
    return panelGroupName(this.selectedValue);
  }

  /**
   * Points the tab bar at a screen's groups.
   *
   * A tab the tester was already on survives the change of screen, because the loop moves
   * between screens constantly and losing the tab every time would make the sheet feel like
   * it was resetting itself.
   */
  public setTabs(tabs: readonly PanelGroup[]): void {
    this.tabList = tabs;
    if (tabs.length === 0) {
      return;
    }
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i] === this.selectedValue) {
        return;
      }
    }
    this.selectedValue = tabs[0];
  }

  /** Selecting a tab opens the sheet: a tab that selects a panel you cannot see is a no-op. */
  public select(group: PanelGroup): void {
    this.selectedValue = group;
    this.collapsedValue = false;
  }

  public setCollapsed(collapsed: boolean): void {
    this.collapsedValue = collapsed;
  }

  public toggle(): void {
    this.collapsedValue = !this.collapsedValue;
  }

  public setBadge(group: PanelGroup, count: number): void {
    this.badgeCounts[group as number] = count < 0 ? 0 : count;
  }

  public badge(group: PanelGroup): number {
    return this.badgeCounts[group as number];
  }

  public clearBadges(): void {
    this.badgeCounts.fill(0);
  }

  /** The tab bar: one row of 44 px targets, plus the collapse control (8.1). */
  public render(): string {
    if (this.tabList.length === 0) {
      return "";
    }
    let html = '<div class="sheet-tabs" role="tablist">';
    for (let i = 0; i < this.tabList.length; i++) {
      const group = this.tabList[i];
      const count = this.badgeCounts[group as number];
      const active = group === this.selectedValue && !this.collapsedValue;
      html +=
        '<button class="sheet-tab' +
        (active ? " active" : "") +
        '" role="tab" aria-selected="' +
        (active ? "true" : "false") +
        '" data-action="sheet-tab" data-value="' +
        panelGroupName(group) +
        '">' +
        Dom.escape(panelGroupName(group)) +
        (count > 0
          ? '<span class="sheet-badge">' + count.toString() + "</span>"
          : "") +
        "</button>";
    }
    html +=
      '<button class="sheet-toggle" data-action="sheet-toggle" aria-expanded="' +
      (this.collapsedValue ? "false" : "true") +
      '">' +
      (this.collapsedValue ? "▲" : "▼") +
      "</button></div>";
    return html;
  }

  /** Parses a `data-value` from the tab bar back into a group. */
  public static byName(name: string): PanelGroup {
    for (let i = 0; i < PANEL_GROUP_COUNT; i++) {
      const group = i as PanelGroup;
      if (panelGroupName(group) === name) {
        return group;
      }
    }
    return PanelGroup.Palette;
  }
}
