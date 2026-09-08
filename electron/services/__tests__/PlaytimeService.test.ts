import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

// vi.mock is hoisted above module-level consts, so the path has to be too.
const userData = vi.hoisted(() =>
  require('node:path').join(require('node:os').tmpdir(), `natux-playtime-${process.pid}`) as string,
);
vi.mock('electron', () => ({
  app: { getPath: () => userData },
}));

import { PlaytimeService } from '../PlaytimeService';

const file = path.join(userData, 'playtime.json');

async function readFileState() {
  return JSON.parse(await fs.readFile(file, 'utf-8'));
}

describe('PlaytimeService', () => {
  beforeEach(async () => {
    await fs.rm(userData, { recursive: true, force: true });
    await fs.mkdir(userData, { recursive: true });
  });

  it('records a finished session', async () => {
    const svc = new PlaytimeService();
    await svc.beginSession();
    await svc.endSession();

    const stats = await svc.getStats();
    expect(stats.inGame).toBe(false);
    expect(stats.sessions).toHaveLength(1);
  });

  it('a heartbeat that lands after endSession cannot resurrect the session', async () => {
    const svc = new PlaytimeService() as unknown as {
      beginSession(): Promise<void>;
      endSession(): Promise<void>;
      getStats(): Promise<{ inGame: boolean; sessions: unknown[]; totalMs: number }>;
      withState<T>(fn: (s: Record<string, unknown>) => T | Promise<T>): Promise<T>;
      save(s: unknown): Promise<void>;
    };

    await svc.beginSession();

    // Make the heartbeat's write slow, so that without serialization it would
    // land AFTER endSession's and overwrite it with a pre-end snapshot — the
    // exact ordering that wiped the session and left inGame stuck true.
    const realSave = svc.save.bind(svc);
    let delayNextSave = true;
    svc.save = async (state: unknown) => {
      if (delayNextSave) {
        delayNextSave = false;
        await new Promise((r) => setTimeout(r, 50));
      }
      return realSave(state);
    };

    const lateHeartbeat = svc.withState(async (state) => {
      if (state.activeStart === null) return;
      state.activeHeartbeat = Date.now();
      await svc.save(state);
    });
    const ending = svc.endSession();
    await Promise.all([lateHeartbeat, ending]);

    const stats = await svc.getStats();
    // The finished session must survive: the earlier bug wrote a pre-end
    // snapshot back and left 0 sessions with inGame stuck true.
    expect(stats.inGame).toBe(false);
    expect(stats.sessions).toHaveLength(1);

    const onDisk = await readFileState();
    expect(onDisk.activeStart).toBeNull();
  });

  it('closes a crashed session at its last heartbeat instead of counting idle time', async () => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    await fs.writeFile(
      file,
      JSON.stringify({
        totalMs: 0,
        sessions: [],
        // Started a day ago, last seen alive one minute later, then the process died.
        activeStart: dayAgo,
        activeHeartbeat: dayAgo + 60_000,
      }),
      'utf-8',
    );

    const stats = await new PlaytimeService().getStats();

    expect(stats.inGame).toBe(false);
    expect(stats.sessions).toHaveLength(1);
    // One minute credited, not twenty-four hours.
    expect(stats.totalMs).toBe(60_000);
  });
});
