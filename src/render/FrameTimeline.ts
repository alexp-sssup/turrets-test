import { RunEvent } from "../sim/RunEvent";
import { FieldFrame } from "./FieldFrame";

/**
 * Every tick of an attempt, kept so the replay can scrub it.
 *
 * A replay in this project is an input log, not a state capture (spec 4.5) -- the log is
 * what gets exported and what re-drives the simulation headlessly. This timeline is the
 * *rendered* form of the attempt the tester just watched, held so that scrubbing is instant
 * rather than a re-simulation. A frame costs about a kilobyte because the joint field is
 * shared between consecutive frames whose analysis has not been redone, so a full five-wave
 * run is a few megabytes.
 *
 * The event log is stored alongside it, and every frame carries the count of events
 * recorded by its tick. That is how "my gun went quiet" and "that corridor collapsed" end
 * up on one timeline: the frames and the events came out of the same run in the same order.
 */
export class FrameTimeline {
  private readonly frames: FieldFrame[];
  private eventList: readonly RunEvent[];

  public constructor() {
    this.frames = [];
    this.eventList = [];
  }

  public append(frame: FieldFrame): void {
    this.frames.push(frame);
  }

  /**
   * Replaces the frame at the head of the timeline (crew-visible spec 2.3).
   *
   * The one case for it is the frame the Allocate screen is looking at: tick zero, captured
   * before the run starts, re-derived when the allocation being edited changes. It is a
   * *correction* of a frame nobody has watched yet rather than a new tick, so appending
   * would put a second tick zero on a timeline the replay scrubs by index.
   */
  public replaceLast(frame: FieldFrame): void {
    if (this.frames.length === 0) {
      this.frames.push(frame);
      return;
    }
    this.frames[this.frames.length - 1] = frame;
  }

  /** Replaces the stored event log. Called as the run grows it. */
  public setEvents(events: readonly RunEvent[]): void {
    this.eventList = events;
  }

  public get events(): readonly RunEvent[] {
    return this.eventList;
  }

  public get length(): number {
    return this.frames.length;
  }

  public get isEmpty(): boolean {
    return this.frames.length === 0;
  }

  public frameAt(index: number): FieldFrame {
    const clamped = index < 0 ? 0 : index >= this.frames.length ? this.frames.length - 1 : index;
    return this.frames[clamped];
  }

  public get last(): FieldFrame {
    return this.frames[this.frames.length - 1];
  }

  public get durationSeconds(): number {
    return this.frames.length === 0 ? 0 : this.last.timeSeconds;
  }

  /**
   * The frame index for a simulation time. Frames are appended in order at a fixed
   * timestep, so this is a division rather than a search -- which matters because the Run
   * screen calls it every animation frame.
   */
  public indexAtTime(timeSeconds: number): number {
    if (this.frames.length === 0) {
      return 0;
    }
    const step = this.frames.length > 1 ? this.frames[1].timeSeconds - this.frames[0].timeSeconds : 0;
    if (step <= 0) {
      return this.frames.length - 1;
    }
    const guess = Math.round((timeSeconds - this.frames[0].timeSeconds) / step);
    if (guess < 0) {
      return 0;
    }
    return guess >= this.frames.length ? this.frames.length - 1 : guess;
  }

  /** The first frame at or after an event's timestamp. What "jump to this moment" seeks to. */
  public indexOfEvent(event: RunEvent): number {
    return this.indexAtTime(event.timeSeconds);
  }
}
