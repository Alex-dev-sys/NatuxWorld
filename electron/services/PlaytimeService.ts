import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

export interface PlaytimeSession {
  start: number;
  end: number;
}

export interface PlaytimeStats {
  totalMs: number;
  sessions: PlaytimeSession[];
  lastSession: PlaytimeSession | null;
  inGame: boolean;
}

interface PlaytimeFile {
  totalMs: number;
  sessions: PlaytimeSession[];
  activeStart: number | null;
  /** Last proof-of-life from a running session; see recover(). */
  activeHeartbeat: number | null;
}

const MAX_SESSIONS = 30;
/** How often a live session stamps proof-of-life on disk. */
const HEARTBEAT_MS = 60_000;
/**
 * A session whose heartbeat is older than this did not end cleanly (crash, power
 * loss). It is closed at its last heartbeat, so the hours the machine spent off
 * are never counted as play time.
 */
const STALE_AFTER_MS = 5 * HEARTBEAT_MS;

/**
 * Local play-time tracking. Stays entirely on this machine (userData/playtime.json):
 * no network, no identifiers — the stats are the user's own.
 */
export class PlaytimeService {
  private file = path.join(app.getPath('userData'), 'playtime.json');
  private heartbeatTimer: NodeJS.Timeout | null = null;

  private async load(): Promise<PlaytimeFile> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8');
      const data = JSON.parse(raw) as Partial<PlaytimeFile>;
      return {
        totalMs: Number(data.totalMs) || 0,
        sessions: Array.isArray(data.sessions) ? data.sessions.slice(-MAX_SESSIONS) : [],
        activeStart: typeof data.activeStart === 'number' ? data.activeStart : null,
        activeHeartbeat: typeof data.activeHeartbeat === 'number' ? data.activeHeartbeat : null,
      };
    } catch {
      return { totalMs: 0, sessions: [], activeStart: null, activeHeartbeat: null };
    }
  }

  /**
   * Closes a session left open by a crash, crediting only up to its last
   * heartbeat. Without this an interrupted session stayed "active" and the next
   * launch counted every idle hour since as play time. Returns the repaired
   * state; callers pass it on instead of re-reading.
   */
  private reconcile(state: PlaytimeFile, now = Date.now()): PlaytimeFile {
    if (state.activeStart === null) return state;
    const lastSeen = state.activeHeartbeat ?? state.activeStart;
    if (now - lastSeen <= STALE_AFTER_MS) return state;

    const end = Math.max(state.activeStart, lastSeen);
    state.totalMs += Math.max(0, end - state.activeStart);
    state.sessions = [...state.sessions, { start: state.activeStart, end }].slice(-MAX_SESSIONS);
    state.activeStart = null;
    state.activeHeartbeat = null;
    return state;
  }

  private async save(state: PlaytimeFile): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Serializes read-modify-write cycles. Every mutation loads INSIDE the queue,
   * so a heartbeat that was already in flight when the session ended cannot save
   * a pre-end snapshot over the finished one (which wiped the session and left
   * inGame stuck true). clearInterval does not stop a callback that has already
   * started — ordering has to come from here, not from the timer.
   */
  private queue: Promise<unknown> = Promise.resolve();

  private withState<T>(fn: (state: PlaytimeFile) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const state = await this.load();
      return fn(state);
    });
    // Keep the chain alive even if this link rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Begin (or re-anchor) the active session. Safe to call repeatedly. */
  async beginSession(): Promise<void> {
    await this.withState(async (loaded) => {
      const now = Date.now();
      const state = this.reconcile(loaded, now);
      if (state.activeStart === null) state.activeStart = now;
      state.activeHeartbeat = now;
      await this.save(state);
    });
    this.startHeartbeat();
  }

  /** Close the active session, if any. Fire-and-forget friendly. */
  async endSession(): Promise<void> {
    this.stopHeartbeat();
    await this.withState(async (loaded) => {
      const state = this.reconcile(loaded);
      if (state.activeStart === null) return;
      const session: PlaytimeSession = { start: state.activeStart, end: Date.now() };
      state.totalMs += Math.max(0, session.end - session.start);
      state.sessions = [...state.sessions, session].slice(-MAX_SESSIONS);
      state.activeStart = null;
      state.activeHeartbeat = null;
      await this.save(state);
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      void this.withState(async (state) => {
        // Re-read inside the queue: if the session ended while this tick was
        // waiting, there is nothing to stamp and nothing to write back.
        if (state.activeStart === null) return;
        state.activeHeartbeat = Date.now();
        await this.save(state);
      }).catch(() => undefined);
    }, HEARTBEAT_MS);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  async getStats(): Promise<PlaytimeStats> {
    const now = Date.now();
    // Through the same queue: getStats can write (crash repair), so it must not
    // interleave with begin/end/heartbeat.
    return this.withState(async (loaded) => {
    // reconcile mutates in place, so record what it was BEFORE the repair.
    const hadActive = loaded.activeStart !== null;
    const state = this.reconcile(loaded, now);
    // A repaired crash session must be persisted, not just reported.
    if (hadActive && state.activeStart === null) await this.save(state);

    // Report live total while a session is running.
    const live = state.activeStart !== null ? Math.max(0, now - state.activeStart) : 0;
    const sessions = state.sessions;
    return {
      totalMs: state.totalMs + live,
      sessions,
      lastSession: sessions.length ? sessions[sessions.length - 1] : null,
      inGame: state.activeStart !== null,
    };
    });
  }
}

/** Shared instance: main-process exit hooks and LauncherService must agree on one file owner. */
export const playtime = new PlaytimeService();
