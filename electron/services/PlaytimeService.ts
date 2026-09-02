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
}

const MAX_SESSIONS = 30;

/**
 * Local play-time tracking. Stays entirely on this machine (userData/playtime.json):
 * no network, no identifiers — the stats are the user's own.
 */
export class PlaytimeService {
  private file = path.join(app.getPath('userData'), 'playtime.json');

  private async load(): Promise<PlaytimeFile> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8');
      const data = JSON.parse(raw) as Partial<PlaytimeFile>;
      return {
        totalMs: Number(data.totalMs) || 0,
        sessions: Array.isArray(data.sessions) ? data.sessions.slice(-MAX_SESSIONS) : [],
        activeStart: typeof data.activeStart === 'number' ? data.activeStart : null,
      };
    } catch {
      return { totalMs: 0, sessions: [], activeStart: null };
    }
  }

  private async save(state: PlaytimeFile): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(state, null, 2), 'utf-8');
  }

  /** Begin (or re-anchor) the active session. Safe to call repeatedly. */
  async beginSession(): Promise<void> {
    const state = await this.load();
    if (state.activeStart === null) state.activeStart = Date.now();
    await this.save(state);
  }

  /** Close the active session, if any. Fire-and-forget friendly. */
  async endSession(): Promise<void> {
    const state = await this.load();
    if (state.activeStart === null) return;
    const session: PlaytimeSession = { start: state.activeStart, end: Date.now() };
    state.totalMs += Math.max(0, session.end - session.start);
    state.sessions = [...state.sessions, session].slice(-MAX_SESSIONS);
    state.activeStart = null;
    await this.save(state);
  }

  async getStats(): Promise<PlaytimeStats> {
    const state = await this.load();
    // Report live total while a session is running.
    const live = state.activeStart !== null ? Math.max(0, Date.now() - state.activeStart) : 0;
    const sessions = state.sessions;
    return {
      totalMs: state.totalMs + live,
      sessions,
      lastSession: sessions.length ? sessions[sessions.length - 1] : null,
      inGame: state.activeStart !== null,
    };
  }
}

/** Shared instance: main-process exit hooks and LauncherService must agree on one file owner. */
export const playtime = new PlaytimeService();
