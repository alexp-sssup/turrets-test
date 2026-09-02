import { Blueprint } from "../blueprint/Blueprint";
import { BlueprintCodec } from "./BlueprintCodec";

/**
 * Spec 3: "blueprint library persists between runs -- free; it is the entire cross-run
 * progression."
 *
 * A named collection with no other behaviour. Designs are keyed by name, and re-saving a
 * name replaces it, because the loop being tested (spec 1.2) is a player iterating on *one*
 * design across six attempts rather than accumulating forty.
 */
export class BlueprintLibrary {
  private readonly entries: Map<string, Blueprint>;
  private readonly order: string[];

  public constructor() {
    this.entries = new Map<string, Blueprint>();
    this.order = [];
  }

  public get size(): number {
    return this.entries.size;
  }

  public save(blueprint: Blueprint): void {
    if (!this.entries.has(blueprint.name)) {
      this.order.push(blueprint.name);
    }
    this.entries.set(blueprint.name, blueprint);
  }

  public load(name: string): Blueprint | null {
    const found = this.entries.get(name);
    return found === undefined ? null : found;
  }

  public has(name: string): boolean {
    return this.entries.has(name);
  }

  public remove(name: string): boolean {
    if (!this.entries.delete(name)) {
      return false;
    }
    for (let i = 0; i < this.order.length; i++) {
      if (this.order[i] === name) {
        this.order.splice(i, 1);
        break;
      }
    }
    return true;
  }

  /** Names in insertion order, which is the order the library is written out in. */
  public names(): string[] {
    const copy: string[] = [];
    for (let i = 0; i < this.order.length; i++) {
      copy.push(this.order[i]);
    }
    return copy;
  }

  public encode(): string {
    const parts: string[] = [];
    for (let i = 0; i < this.order.length; i++) {
      const blueprint = this.entries.get(this.order[i]);
      if (blueprint !== undefined) {
        parts.push(BlueprintCodec.encode(blueprint));
      }
    }
    return parts.join("\n");
  }

  public static decode(text: string): BlueprintLibrary {
    const library = new BlueprintLibrary();
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) {
        continue;
      }
      library.save(BlueprintCodec.decode(line));
    }
    return library;
  }
}
