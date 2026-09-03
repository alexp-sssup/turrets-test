import {
  LayoutMode,
  Orientation,
  PointerKind,
  classifyLayout,
  layoutModeName,
  orientationName,
  orientationOf,
  pointerKindName,
} from "./LayoutMode";

/**
 * The one file that reads the viewport (mobile UI spec 7.2).
 *
 * `matchMedia`, resize and orientation live here and nowhere else, so the rest of the build
 * asks a plain object what mode it is in rather than asking the browser. That is what lets
 * `classifyLayout` be tested headlessly, and it is what keeps the breakpoints in one place:
 * the mode is written onto the document element as `data-layout`, and the stylesheet keys
 * off that attribute rather than repeating the numbers in a media query where they could
 * drift from 3.1.
 *
 * **User-agent strings are not consulted, anywhere, for anything** (3.2).
 */
export class Viewport {
  private readonly root: HTMLElement;
  private readonly onChanged: () => void;
  private widthCss: number;
  private heightCss: number;
  private modeValue: LayoutMode;
  private pointerValue: PointerKind;
  private orientationValue: Orientation;
  private orientationChangeCount: number;

  public constructor(root: HTMLElement, onChanged: () => void) {
    this.root = root;
    this.onChanged = onChanged;
    this.widthCss = 0;
    this.heightCss = 0;
    this.modeValue = LayoutMode.Wide;
    this.pointerValue = PointerKind.Fine;
    this.orientationValue = Orientation.Portrait;
    this.orientationChangeCount = 0;
    this.readNow();
    this.apply();
  }

  public get mode(): LayoutMode {
    return this.modeValue;
  }

  public get pointer(): PointerKind {
    return this.pointerValue;
  }

  public get orientation(): Orientation {
    return this.orientationValue;
  }

  public get coarse(): boolean {
    return this.pointerValue === PointerKind.Coarse;
  }

  /** True in the one case 4.4 exists for: a phone with no room to stack. */
  public get compactLandscape(): boolean {
    return this.modeValue === LayoutMode.Compact && this.orientationValue === Orientation.Landscape;
  }

  public get widthPx(): number {
    return this.widthCss;
  }

  public get heightPx(): number {
    return this.heightCss;
  }

  /** Reported as the browser gives it, before the 8.3 backing-store cap (9.1). */
  public get devicePixelRatio(): number {
    return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  }

  /** One of the 9.1 export fields: how often the tester turned the phone over. */
  public get orientationChanges(): number {
    return this.orientationChangeCount;
  }

  /**
   * Starts listening. Resize covers orientation on every browser that matters -- turning a
   * phone always resizes the viewport -- and the pointer query is watched too, because a
   * tablet's keyboard case can arrive and leave mid-session.
   */
  public start(): void {
    window.addEventListener("resize", (): void => {
      this.refresh();
    });
    window.addEventListener("orientationchange", (): void => {
      this.refresh();
    });
    if (typeof window.matchMedia === "function") {
      const coarse = window.matchMedia("(pointer: coarse)");
      coarse.addEventListener("change", (): void => {
        this.refresh();
      });
    }
  }

  /** Re-reads the viewport and, when something moved, restamps the document and notifies. */
  public refresh(): void {
    const beforeMode = this.modeValue;
    const beforePointer = this.pointerValue;
    const beforeOrientation = this.orientationValue;
    this.readNow();
    if (this.orientationValue !== beforeOrientation) {
      this.orientationChangeCount++;
    }
    if (
      this.modeValue === beforeMode &&
      this.pointerValue === beforePointer &&
      this.orientationValue === beforeOrientation
    ) {
      return;
    }
    this.apply();
    this.onChanged();
  }

  private readNow(): void {
    this.widthCss = window.innerWidth;
    this.heightCss = window.innerHeight;
    this.pointerValue = Viewport.readPointer();
    this.modeValue = classifyLayout(this.widthCss, this.heightCss, this.coarse);
    this.orientationValue = orientationOf(this.widthCss, this.heightCss);
  }

  /**
   * 3.2: `coarse` when `(pointer: coarse)` matches, `fine` otherwise.
   *
   * It selects hit-target size, which hints the field caption shows, and whether predict
   * reads hover or the selected cell. It never disables anything: both input modalities
   * stay live in every mode.
   */
  private static readPointer(): PointerKind {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return PointerKind.Fine;
    }
    return window.matchMedia("(pointer: coarse)").matches ? PointerKind.Coarse : PointerKind.Fine;
  }

  private apply(): void {
    this.root.setAttribute("data-layout", layoutModeName(this.modeValue));
    this.root.setAttribute("data-pointer", pointerKindName(this.pointerValue));
    this.root.setAttribute("data-orientation", orientationName(this.orientationValue));
  }
}
