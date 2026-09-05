import { IVec3 } from "../core/IVec3";
import { ViewYaw } from "../render/ViewYaw";
import { ZoomLadder } from "../render/ZoomLadder";
import { OverlayMode, ViewState } from "../render/ViewState";

/**
 * Player input that reaches the simulation. Logged, ordered, and total: determinism
 * depends on it (UI spec 5.2).
 */
export enum SimCommandKind {
  /** Build a design and open an attempt with it. */
  PlaceBlueprint = 0,
  /** Spec 4.4's allocation: how many repair details and runners. */
  Assign = 1,
  /** Spec 4.6: the player may click a target to focus fire. -1 clears it. */
  Focus = 2,
  /** Switch a station's load. */
  SelectLoad = 3,
  StartWave = 4,
}

export class SimCommand {
  public readonly kind: SimCommandKind;
  public readonly value: number;
  public readonly secondary: number;
  /** Blueprint name, for `PlaceBlueprint`. Empty otherwise. */
  public readonly name: string;

  public constructor(kind: SimCommandKind, value: number, secondary: number, name: string) {
    this.kind = kind;
    this.value = value;
    this.secondary = secondary;
    this.name = name;
  }

  public static placeBlueprint(name: string): SimCommand {
    return new SimCommand(SimCommandKind.PlaceBlueprint, 0, 0, name);
  }

  public static assign(repairDetails: number, runners: number): SimCommand {
    return new SimCommand(SimCommandKind.Assign, repairDetails, runners, "");
  }

  public static focus(target: number): SimCommand {
    return new SimCommand(SimCommandKind.Focus, target, 0, "");
  }

  public static selectLoad(station: number, load: number): SimCommand {
    return new SimCommand(SimCommandKind.SelectLoad, station, load, "");
  }

  public static startWave(): SimCommand {
    return new SimCommand(SimCommandKind.StartWave, 0, 0, "");
  }
}

/** Player input that cannot reach the simulation. Never logged. */
export enum ViewCommandKind {
  Overlay = 0,
  Inspect = 1,
  Select = 2,
  Seek = 3,
  Pan = 4,
  Zoom = 5,
  /**
   * Frame the design in the viewport (mobile UI spec 7.1).
   *
   * The one command this document adds, and it is a view command: a pinch-zoomed tester
   * needs a way back that is not "reload the page". It is not logged, and no `SimCommand`
   * was added for any gesture -- that is what keeps a phone attempt replayable in the
   * desktop build and in the headless batch runner.
   */
  Fit = 6,
  /**
   * A quarter turn of the camera (isometric renderer spec 2.2).
   *
   * A view command like every other one here, and unlogged like every other one here: four
   * yaws are four pictures of the same run, and an attempt flown at yaw 2 replays to the
   * same final state hash as one flown at yaw 0 (spec 10.5).
   */
  Yaw = 7,
}

export class ViewCommand {
  public readonly kind: ViewCommandKind;
  public readonly value: number;
  public readonly secondary: number;
  public readonly cell: IVec3 | null;

  public constructor(kind: ViewCommandKind, value: number, secondary: number, cell: IVec3 | null) {
    this.kind = kind;
    this.value = value;
    this.secondary = secondary;
    this.cell = cell;
  }

  public static overlay(mode: OverlayMode): ViewCommand {
    return new ViewCommand(ViewCommandKind.Overlay, mode as number, 0, null);
  }

  public static inspect(cell: IVec3 | null): ViewCommand {
    return new ViewCommand(ViewCommandKind.Inspect, 0, 0, cell);
  }

  public static select(cell: IVec3 | null): ViewCommand {
    return new ViewCommand(ViewCommandKind.Select, 0, 0, cell);
  }

  public static seek(tick: number): ViewCommand {
    return new ViewCommand(ViewCommandKind.Seek, tick, 0, null);
  }

  public static pan(dx: number, dy: number): ViewCommand {
    return new ViewCommand(ViewCommandKind.Pan, dx, dy, null);
  }

  public static zoom(factor: number): ViewCommand {
    return new ViewCommand(ViewCommandKind.Zoom, factor, 0, null);
  }

  public static fit(): ViewCommand {
    return new ViewCommand(ViewCommandKind.Fit, 0, 0, null);
  }

  public static yaw(id: number): ViewCommand {
    return new ViewCommand(ViewCommandKind.Yaw, id, 0, null);
  }
}

/** The simulation side of the split. Implemented by the app, called only by the dispatcher. */
export interface SimTarget {
  placeBlueprint(name: string): void;
  assign(repairDetails: number, runners: number): void;
  focus(target: number): void;
  selectLoad(station: number, load: number): void;
  startWave(): void;
}

/** The seek side of the split: replay position is a view concern, not a sim one. */
export interface SeekTarget {
  seekToTick(tick: number): void;
}

/**
 * The framing side of the split (mobile UI spec 7.1).
 *
 * Fitting the design needs the viewport's size and the design's bounds, neither of which
 * belongs in `ViewState`, so the dispatcher is handed this one method rather than a
 * reference to anything that could reach the simulation.
 */
export interface FitTarget {
  fitView(): void;
}

/**
 * The one dispatcher every piece of player input funnels through (UI spec 5.2).
 *
 * The split is load-bearing rather than tidy. A replay is seed + blueprint + ordered
 * `SimCommand` log with no state capture, so if a `ViewCommand` could ever change sim state
 * the replay would silently diverge from the run it recorded and the whole loop -- lose,
 * watch, fix, rerun -- would stop meaning anything.
 *
 * The invariant is enforced structurally: `dispatchView` is handed a `ViewState` and a
 * seek target and nothing else. It has no reference to the simulation and could not reach
 * it if the code tried.
 */
export class Dispatcher {
  private readonly sim: SimTarget;
  private readonly view: ViewState;
  private readonly seek: SeekTarget;
  private readonly fit: FitTarget;
  private readonly onOverlayChanged: (mode: OverlayMode) => void;

  public constructor(
    sim: SimTarget,
    view: ViewState,
    seek: SeekTarget,
    fit: FitTarget,
    onOverlayChanged: (mode: OverlayMode) => void
  ) {
    this.sim = sim;
    this.view = view;
    this.seek = seek;
    this.fit = fit;
    this.onOverlayChanged = onOverlayChanged;
  }

  public dispatchSim(command: SimCommand): void {
    if (command.kind === SimCommandKind.PlaceBlueprint) {
      this.sim.placeBlueprint(command.name);
      return;
    }
    if (command.kind === SimCommandKind.Assign) {
      this.sim.assign(command.value, command.secondary);
      return;
    }
    if (command.kind === SimCommandKind.Focus) {
      this.sim.focus(command.value);
      return;
    }
    if (command.kind === SimCommandKind.SelectLoad) {
      this.sim.selectLoad(command.value, command.secondary);
      return;
    }
    this.sim.startWave();
  }

  public dispatchView(command: ViewCommand): void {
    if (command.kind === ViewCommandKind.Overlay) {
      const mode = command.value as OverlayMode;
      this.view.overlay = mode;
      this.onOverlayChanged(mode);
      return;
    }
    if (command.kind === ViewCommandKind.Inspect) {
      this.view.hover = command.cell;
      return;
    }
    if (command.kind === ViewCommandKind.Select) {
      this.view.selected = command.cell;
      return;
    }
    if (command.kind === ViewCommandKind.Seek) {
      this.seek.seekToTick(command.value);
      return;
    }
    if (command.kind === ViewCommandKind.Pan) {
      this.view.panX += command.value;
      this.view.panY += command.secondary;
      return;
    }
    if (command.kind === ViewCommandKind.Fit) {
      this.fit.fitView();
      return;
    }
    if (command.kind === ViewCommandKind.Yaw) {
      this.view.yaw = ViewYaw.of(command.value);
      return;
    }
    // Zoom lands on a rung of the ladder and nowhere between (isometric renderer spec 2.3):
    // every voxel vertex has to stay on an exact pixel, so a pinch snaps and so does a key.
    this.view.scale = ZoomLadder.scaled(this.view.scale, command.value);
  }
}
