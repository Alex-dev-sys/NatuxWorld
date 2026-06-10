import { describe, expect, it, vi, beforeEach } from 'vitest';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/natux-settings-test' } }));

const SETTINGS_FILE = path.join('/tmp/natux-settings-test', 'settings.json');

const files: Record<string, string> = {};
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async (p: string) => { if (files[p] === undefined) throw new Error('ENOENT'); return files[p]; }),
    writeFile: vi.fn(async (p: string, d: string) => { files[p] = d; }),
  },
}));

beforeEach(() => { for (const k of Object.keys(files)) delete files[k]; vi.clearAllMocks(); });

describe('SettingsService', () => {
  it('returns defaults including new fields', async () => {
    const { SettingsService } = await import('../SettingsService');
    const s = await new SettingsService().get();
    expect(s.javaMode).toBe('bundled');
    expect(s.autoUpdate).toBe(true);
    expect(s.autoLaunch).toBe(false);
  });

  it('forward-merges an old file missing new keys', async () => {
    const { SettingsService } = await import('../SettingsService');
    const svc = new SettingsService();
    files[SETTINGS_FILE] = JSON.stringify({ memory: 8192 });
    const s = await svc.get();
    expect(s.memory).toBe(8192);
    expect(s.autoUpdate).toBe(true);
  });

  it('reset() restores defaults', async () => {
    const { SettingsService } = await import('../SettingsService');
    const svc = new SettingsService();
    await svc.set({ memory: 16384, autoUpdate: false });
    const s = await svc.reset();
    expect(s.memory).toBe(4096);
    expect(s.autoUpdate).toBe(true);
  });
});
