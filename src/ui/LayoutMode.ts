/**
 * The device classes (mobile UI spec 3), as pure values.
 *
 * Two separate questions, deliberately not conflated (3): *layout* is chosen from the
 * viewport, and *hit-target size and input hints* are chosen from the pointer. Conflating
 * them is how a touchscreen laptop ends up with no keyboard hints.
 *
 * Nothing here touches the DOM. `Viewport` is the only file that reads `matchMedia`, and it
 * calls into these functions with plain numbers, which is what lets `node:test` drive every
 * row and every boundary of 3.1 with no browser (7.3).
 */

/** The three layouts of mobile UI spec 3.1. There is no fourth mode for orientation. */
export enum LayoutMode {
  /** width >= 1024: today's layout, unchanged, panels docked right at 372 px. */
  Wide = 0,
  /** 640 <= width < 1024: panels docked right at 300 px, shell condensed (4.2). */
  Medium = 1,
  /** width < 640: single column, field first, panels in a sheet (4.3). */
  Compact = 2,
}

/** The pointer that arrived with the viewport (mobile UI spec 3.2). */
export enum PointerKind {
  Fine = 0,
  Coarse = 1,
}

/** Portrait or landscape. A property read *inside* `Compact`, not a mode of its own (3.1). */
export enum Orientation {
  Portrait = 0,
  Landscape = 1,
}

/** The 3.1 breakpoints, in CSS pixels, on the viewport rather than on the device. */
export const MEDIUM_MIN_WIDTH_PX: number = 640;
export const WIDE_MIN_WIDTH_PX: number = 1024;

/** The docked panel rail's width per mode. `Compact` docks nothing: it uses the sheet. */
export const WIDE_PANEL_WIDTH_PX: number = 372;
export const MEDIUM_PANEL_WIDTH_PX: number = 300;

/**
 * The classifier of mobile UI spec 3.1: viewport in, layout out.
 *
 * `heightPx` and `coarsePointer` are taken and deliberately not consulted. The 3.1 table is
 * written on width alone, and that is the point of it: a desktop window dragged narrow gets
 * the `Compact` layout, and a tablet with a keyboard case does not get a different layout
 * from a tablet without one. Height answers a different question -- `orientationOf` -- and
 * the pointer answers 3.2's. Taking all three keeps the seam honest: a caller cannot
 * accidentally classify on the device, because the device is not an argument.
 */
export function classifyLayout(
  widthPx: number,
  heightPx: number,
  coarsePointer: boolean
): LayoutMode {
  void heightPx;
  void coarsePointer;
  if (widthPx >= WIDE_MIN_WIDTH_PX) {
    return LayoutMode.Wide;
  }
  if (widthPx >= MEDIUM_MIN_WIDTH_PX) {
    return LayoutMode.Medium;
  }
  return LayoutMode.Compact;
}

/**
 * Orientation, read inside `Compact` to choose between the stacked sheet (4.3) and the
 * edge drawer (4.4). A square viewport counts as portrait: it can stack.
 */
export function orientationOf(widthPx: number, heightPx: number): Orientation {
  return widthPx > heightPx ? Orientation.Landscape : Orientation.Portrait;
}

/** The docked rail's width, or 0 in `Compact` where there is no rail. */
export function panelWidthPx(mode: LayoutMode): number {
  if (mode === LayoutMode.Wide) {
    return WIDE_PANEL_WIDTH_PX;
  }
  if (mode === LayoutMode.Medium) {
    return MEDIUM_PANEL_WIDTH_PX;
  }
  return 0;
}

/** The name the CSS attribute selectors and the attempt export (9.1) both use. */
export function layoutModeName(mode: LayoutMode): string {
  if (mode === LayoutMode.Wide) {
    return "wide";
  }
  if (mode === LayoutMode.Medium) {
    return "medium";
  }
  return "compact";
}

export function pointerKindName(kind: PointerKind): string {
  return kind === PointerKind.Coarse ? "coarse" : "fine";
}

export function orientationName(orientation: Orientation): string {
  return orientation === Orientation.Landscape ? "landscape" : "portrait";
}
