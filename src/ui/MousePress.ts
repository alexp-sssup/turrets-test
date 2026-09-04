import { GestureRecognizer } from "./GestureRecognizer";

/**
 * One mouse press in progress, and the one question worth asking about it: was it a click,
 * or did it become a drag?
 *
 * Mouse-gestures spec 2.3 makes a press that does not move a click and 2.4 makes a press
 * that moves a pan and nothing else, so this is the whole of the mouse's gesture
 * recognition. It takes numbers rather than a `PointerEvent`, for the reason mobile UI spec
 * 7.2 gives for `GestureRecognizer`: the rule is then testable headlessly, and the DOM types
 * will not port.
 */
export class MousePress {
  /**
   * Mouse-gestures spec 2.3: mobile UI spec 6.2's tap slop, deliberately the same number, so
   * a click and a tap draw the line between press and drag in the same place.
   */
  public static readonly SLOP_PX: number = GestureRecognizer.TAP_SLOP_PX;

  private activeValue: boolean;
  private draggingValue: boolean;
  private startXValue: number;
  private startYValue: number;
  private lastX: number;
  private lastY: number;
  private deltaXValue: number;
  private deltaYValue: number;

  public constructor() {
    this.activeValue = false;
    this.draggingValue = false;
    this.startXValue = 0;
    this.startYValue = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.deltaXValue = 0;
    this.deltaYValue = 0;
  }

  /**
   * A button went down at `(x, y)`.
   *
   * `dragImmediately` is 2.5's modifier press -- shift, middle or right -- which is a drag
   * from the moment it begins and never places, whether or not it goes on to move.
   */
  public begin(x: number, y: number, dragImmediately: boolean): void {
    this.activeValue = true;
    this.draggingValue = dragImmediately;
    this.startXValue = x;
    this.startYValue = y;
    this.lastX = x;
    this.lastY = y;
    this.deltaXValue = 0;
    this.deltaYValue = 0;
  }

  /**
   * The pointer moved. After this, `dragging` says whether the press has crossed the slop,
   * and `deltaX` / `deltaY` carry the movement since the previous move.
   *
   * The slop is measured from where the press began, not from the last move: a slow circle
   * back to the origin is still a drag, because the view has already been dragged.
   */
  public move(x: number, y: number): void {
    if (!this.activeValue) {
      return;
    }
    this.deltaXValue = x - this.lastX;
    this.deltaYValue = y - this.lastY;
    this.lastX = x;
    this.lastY = y;
    if (this.draggingValue) {
      return;
    }
    const dx = x - this.startXValue;
    const dy = y - this.startYValue;
    if (Math.sqrt(dx * dx + dy * dy) > MousePress.SLOP_PX) {
      this.draggingValue = true;
    }
  }

  /**
   * The button came up. Returns true when the press was a click and its action should run
   * (2.3), false when it was a drag and no click action happens at all (2.4).
   *
   * Clears either way, so a stray `pointerup` cannot fire a second click.
   */
  public end(): boolean {
    const wasClick = this.activeValue && !this.draggingValue;
    this.activeValue = false;
    this.draggingValue = false;
    return wasClick;
  }

  /** The browser took the gesture over. Nothing happened. */
  public cancel(): void {
    this.activeValue = false;
    this.draggingValue = false;
  }

  public get active(): boolean {
    return this.activeValue;
  }

  public get dragging(): boolean {
    return this.draggingValue;
  }

  public get startX(): number {
    return this.startXValue;
  }

  public get startY(): number {
    return this.startYValue;
  }

  public get deltaX(): number {
    return this.deltaXValue;
  }

  public get deltaY(): number {
    return this.deltaYValue;
  }
}
