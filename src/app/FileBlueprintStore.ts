import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { BlueprintLibrary } from "../persistence/BlueprintLibrary";
import { BlueprintStore } from "../persistence/BlueprintStore";

/**
 * The only file I/O in the project.
 *
 * Everything else -- solver, editor, simulation -- is pure, so keeping the filesystem
 * behind `BlueprintStore` and inside `app/` is what makes the rest testable without one and
 * portable to a platform that has none.
 */
export class FileBlueprintStore implements BlueprintStore {
  private readonly path: string;

  public constructor(path: string) {
    this.path = path;
  }

  public read(): BlueprintLibrary {
    if (!existsSync(this.path)) {
      return new BlueprintLibrary();
    }
    return BlueprintLibrary.decode(readFileSync(this.path, "utf8"));
  }

  public write(library: BlueprintLibrary): void {
    writeFileSync(this.path, library.encode() + "\n", "utf8");
  }

  public get location(): string {
    return this.path;
  }
}
