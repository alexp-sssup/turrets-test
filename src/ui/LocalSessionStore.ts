import { SessionStore } from "../telemetry/SessionStore";

/**
 * `localStorage`, with the failure case handled rather than assumed away.
 *
 * UI spec 7.1: everything persists locally and nothing requires a server. A browser in
 * private mode, or one with site data blocked, throws on the first write -- so this falls
 * back to keeping the session in memory. A tester who loses their library between reloads
 * is a nuisance; a tester who gets a blank page is a lost session.
 */
export class LocalSessionStore implements SessionStore {
  private readonly fallback: Map<string, string>;
  private usable: boolean;

  public constructor() {
    this.fallback = new Map<string, string>();
    this.usable = LocalSessionStore.probe();
  }

  public get persistent(): boolean {
    return this.usable;
  }

  public read(key: string): string | null {
    if (this.usable) {
      try {
        return window.localStorage.getItem(key);
      } catch (error) {
        this.usable = false;
      }
    }
    const found = this.fallback.get(key);
    return found === undefined ? null : found;
  }

  public write(key: string, value: string): void {
    this.fallback.set(key, value);
    if (!this.usable) {
      return;
    }
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      this.usable = false;
    }
  }

  private static probe(): boolean {
    try {
      const key = "turrets-p0/probe";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }
}
