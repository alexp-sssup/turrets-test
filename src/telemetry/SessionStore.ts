/**
 * Where a tester's session survives a page reload.
 *
 * An interface, because everything above it stays free of I/O for the same reason the
 * simulation does: UI spec 7.1 requires no server and no account, but it does not require
 * the code that decides *what* to remember to know that the answer is `localStorage`. The
 * browser implementation lives in `ui/`.
 */
export interface SessionStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

/** For tests and for a private-mode browser that refuses to store anything. */
export class MemorySessionStore implements SessionStore {
  private readonly entries: Map<string, string>;

  public constructor() {
    this.entries = new Map<string, string>();
  }

  public read(key: string): string | null {
    const found = this.entries.get(key);
    return found === undefined ? null : found;
  }

  public write(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

export const SESSION_ID_KEY: string = "turrets-p0/session-id";
export const LIBRARY_KEY: string = "turrets-p0/library";
export const ATTEMPT_COUNT_KEY: string = "turrets-p0/attempts";
export const SEEN_GUIDED_RUN_KEY: string = "turrets-p0/guided-run-seen";

/**
 * A session id a tester can quote in feedback (UI spec 7.1).
 *
 * Six characters from an unambiguous alphabet -- no i, l, o, 0, 1 -- because the whole
 * point is that somebody reads it off a screen and types it into a message.
 */
export class SessionId {
  private static readonly ALPHABET: string = "23456789abcdefghjkmnpqrstuvwxyz";

  public static generate(randomFraction: () => number): string {
    let id = "";
    for (let i = 0; i < 6; i++) {
      const index = Math.floor(randomFraction() * SessionId.ALPHABET.length) % SessionId.ALPHABET.length;
      id += SessionId.ALPHABET.charAt(index);
    }
    return id;
  }

  /** Reads the stored id, generating and storing one on a tester's first visit. */
  public static resolve(store: SessionStore, randomFraction: () => number): string {
    const existing = store.read(SESSION_ID_KEY);
    if (existing !== null && existing.length > 0) {
      return existing;
    }
    const created = SessionId.generate(randomFraction);
    store.write(SESSION_ID_KEY, created);
    return created;
  }
}
