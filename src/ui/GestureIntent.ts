/**
 * What a pointer sequence meant (mobile UI spec 6.2), as a plain value type.
 *
 * The verb set does not grow: §3.2's argument that "every extra verb dilutes the
 * attribution" is why this enum is short and why every member below maps to a command the
 * dispatcher already routes (7.1). Nothing here refers to a `PointerEvent`, a canvas or a
 * screen; the recognizer that produces these takes numbers and the app that consumes them
 * turns them into `SimCommand`s and `ViewCommand`s.
 */
export enum GestureKind {
  /** One-finger tap: place a single cell in Design, focus-fire or inspect in Run/Replay. */
  Tap = 0,
  /** Double-tap: fit the design to the viewport. */
  DoubleTap = 1,
  /** Long-press: inspect, place nothing. */
  LongPress = 2,
  /** Long-press then drag: the inspected cell follows the finger (6.3). */
  Sweep = 3,
  /** One-finger drag: a rectangle in Design, a pan in Run/Replay. */
  DragStart = 4,
  DragMove = 5,
  DragEnd = 6,
  /** Two-finger drag. */
  Pan = 7,
  /** Pinch. `scale` is the factor since the previous intent. */
  Zoom = 8,
  /**
   * Discard whatever was in progress without committing it.
   *
   * Emitted when a second pointer arrives mid-placement and when the browser takes the
   * gesture over. Both cases are correctness rather than feel (6.2): a tester zooming in to
   * look at a joint must not find a rectangle of stone where they put their fingers, and a
   * silent uncommanded edit is worse than a lost gesture.
   */
  Cancel = 9,
}

/** One recognized gesture. Kind plus plain numbers, per the 7.2 file table. */
export class GestureIntent {
  public readonly kind: GestureKind;
  /** Where it happened, in CSS pixels relative to the canvas. */
  public readonly x: number;
  public readonly y: number;
  /** Movement since the previous intent, for `Pan`. Zero otherwise. */
  public readonly dx: number;
  public readonly dy: number;
  /** Zoom factor since the previous intent, for `Zoom`. One otherwise. */
  public readonly scale: number;

  public constructor(kind: GestureKind, x: number, y: number, dx: number, dy: number, scale: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.scale = scale;
  }

  public static at(kind: GestureKind, x: number, y: number): GestureIntent {
    return new GestureIntent(kind, x, y, 0, 0, 1);
  }

  public static pan(x: number, y: number, dx: number, dy: number): GestureIntent {
    return new GestureIntent(GestureKind.Pan, x, y, dx, dy, 1);
  }

  public static zoom(x: number, y: number, scale: number): GestureIntent {
    return new GestureIntent(GestureKind.Zoom, x, y, 0, 0, scale);
  }

  public static cancel(): GestureIntent {
    return new GestureIntent(GestureKind.Cancel, 0, 0, 0, 0, 1);
  }
}
