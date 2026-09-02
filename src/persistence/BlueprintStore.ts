import { BlueprintLibrary } from "./BlueprintLibrary";

/**
 * Where a library lives. An interface because everything above it must stay free of I/O:
 * the simulation, the solver and the editor are all pure, which is what makes them testable
 * without a filesystem and portable to a platform that has none.
 */
export interface BlueprintStore {
  read(): BlueprintLibrary;
  write(library: BlueprintLibrary): void;
}

/** Keeps a library in memory. Used by tests and by a session that never saves. */
export class MemoryBlueprintStore implements BlueprintStore {
  private text: string;

  public constructor(text: string) {
    this.text = text;
  }

  public read(): BlueprintLibrary {
    return BlueprintLibrary.decode(this.text);
  }

  public write(library: BlueprintLibrary): void {
    this.text = library.encode();
  }

  public get contents(): string {
    return this.text;
  }
}
