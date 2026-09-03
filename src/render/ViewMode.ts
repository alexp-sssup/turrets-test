/**
 * Which projection the field is drawn with (isometric renderer spec 2, spec 9).
 *
 * `Iso` is the fixed isometric 2.5D view and is the **only tester-facing projection**: a
 * session opens in it and there is nothing to toggle. `Flat` is the side-on cross-section
 * the tester build started with, kept because it is the clearest possible picture of one
 * slice and costs nothing to keep, and reachable only where the dev readout lives. It is not
 * a mode a tester can find, choose, or spend attention learning, because the build no longer
 * validates it.
 *
 * Either way this is a view concern and nothing else -- the simulation never sees it, and an
 * attempt flown in one replays identically in the other (spec 10.5).
 */
export enum ViewMode {
  Iso = 0,
  Flat = 1,
}

export function viewModeName(mode: ViewMode): string {
  return mode === ViewMode.Flat ? "flat (dev)" : "isometric";
}
