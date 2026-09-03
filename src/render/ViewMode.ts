/**
 * Which projection the field is drawn with (depth view spec 2).
 *
 * `Flat` is the side-on cross-section UI spec 2 chose and is what a session opens in.
 * `Depth` is the additive 2.5D mode: the same scene, the same layers, the same shortcuts,
 * with the x axis given a place on screen. It is a view concern and nothing else -- the
 * simulation never sees it, and an attempt flown in one mode replays identically in the
 * other (depth view spec 4.5).
 */
export enum ViewMode {
  Flat = 0,
  Depth = 1,
}

export function viewModeName(mode: ViewMode): string {
  return mode === ViewMode.Depth ? "2.5D" : "flat";
}

export function otherViewMode(mode: ViewMode): ViewMode {
  return mode === ViewMode.Depth ? ViewMode.Flat : ViewMode.Depth;
}
