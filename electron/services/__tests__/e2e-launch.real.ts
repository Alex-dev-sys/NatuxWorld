// REAL end-to-end launch harness. NOT part of `npm test` (filename lacks `.test.`).
// Run explicitly:
//   npx vitest run --include 'electron/**/__tests__/**/*.real.ts' --testTimeout 1200000
// Hits live Adoptium/Mojang/Forge endpoints, installs a real JRE, downloads the game,
// and spawns Minecraft into a temp dir — proving the launch pipeline works on this OS/arch.
import { afterAll, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';

const USER_DATA = path.join(os.tmpdir(), 'natux-e2e');

vi.mock('electron', () => ({
  app: {
    getPath: () => USER_DATA,
    getVersion: () => '0.0.0-e2e',
  },
  safeStorage: { isEncryptionAvailable: () => false },
}));

// Capture everything the service would send to the renderer.
class FakeWebContents {
  sent: Array<{ channel: string; payload: unknown }> = [];
  send(channel: string, payload: unknown) {
    this.sent.push({ channel, payload });
  }
}
class FakeWindow extends EventEmitter {
  webContents = new FakeWebContents();
  isDestroyed() {
    return false;
  }
}

afterAll(() => {
  // Leave the temp dir for inspection but make the path visible.
  console.log(`[e2e] artifacts in: ${USER_DATA}`);
});

describe('real launch pipeline (live network)', () => {
  it('installs JRE, downloads game, spawns Minecraft', async () => {
    const { LauncherService } = await import('../LauncherService');
    const { getJrePath } = await import('../../utils/paths');

    const win = new FakeWindow();
    const launcher = new LauncherService();
    launcher.attach(win as never);

    const progress: string[] = [];
    const gameLogs: string[] = [];
    // Mirror the renderer: progress + batched log channels.
    const origSend = win.webContents.send.bind(win.webContents);
    win.webContents.send = (channel: string, payload: unknown) => {
      if (channel === 'launcher:progress') {
        const p = payload as { stage: string; message: string };
        progress.push(`${p.stage}: ${p.message}`);
      } else if (channel === 'launcher:log') {
        for (const l of payload as Array<{ line: string }>) gameLogs.push(l.line);
      }
      origSend(channel, payload);
    };

    const result = await launcher.play({
      version: 'forge-1.21.1',
      loader: 'forge',
      username: 'E2ETester',
      memory: 2048,
      server: undefined, // don't auto-join; we only need the client to start
    });

    console.log('[e2e] play result:', JSON.stringify(result));
    console.log('[e2e] last stages:', progress.slice(-8).join(' | '));
    expect(result.ok).toBe(true);

    // Proof #1: the managed JRE was installed at the platform-correct path and runs.
    expect(fs.existsSync(getJrePath())).toBe(true);

    // Proof #2: pipeline reached spawn → 'running'.
    expect(progress.some((p) => p.startsWith('running:'))).toBe(true);

    // Proof #3: Minecraft actually started — wait for its characteristic boot lines.
    const markers = ['LWJGL', 'OpenAL', 'Backend library', 'Setting user', 'Loading Minecraft'];
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline && !gameLogs.some((l) => markers.some((m) => l.includes(m)))) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    const hit = gameLogs.find((l) => markers.some((m) => l.includes(m)));
    console.log('[e2e] game boot marker:', hit ?? '(none seen)');
    console.log('[e2e] sample game logs:\n' + gameLogs.slice(0, 25).join('\n'));

    await launcher.cancel();
    expect(hit, 'Minecraft did not emit a known startup log line').toBeTruthy();
  }, 1200000);
});
