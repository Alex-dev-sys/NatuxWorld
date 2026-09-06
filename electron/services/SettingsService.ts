import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface LauncherSettings {
  memory: number;
  fullscreen: boolean;
  closeOnLaunch: boolean;
  language: 'ru' | 'en';
  javaPath?: string;
  jvmArgs: string;
  resolution: { width: number; height: number };
  javaMode: 'bundled' | 'custom';
  autoUpdate: boolean;
  autoLaunch: boolean;
  /** Opt-in: send anonymous crash logs to the backend on launch error / game crash. */
  crashReports: boolean;
  /** The welcome flow is shown once after the player has signed in. */
  onboardingCompleted: boolean;
  /** Hide to tray instead of quitting when the window is closed. */
  minimizeToTray: boolean;
  /** Start the launcher when the OS boots (per-user login item). */
  launchOnStartup: boolean;
  /** Update feed channel: 'beta' receives prerelease builds. */
  updateChannel: 'stable' | 'beta';
  /** Opt-in count-only usage telemetry (no identifiers, no content). */
  telemetryEnabled: boolean;
  /** Random per-install id used ONLY for staged-update rollout bucketing. */
  installId: string;
}

const DEFAULTS: LauncherSettings = {
  memory: 4096,
  fullscreen: false,
  closeOnLaunch: false,
  language: 'ru',
  jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC',
  resolution: { width: 1280, height: 720 },
  javaMode: 'bundled',
  autoUpdate: true,
  autoLaunch: false,
  crashReports: false,
  onboardingCompleted: false,
  minimizeToTray: false,
  launchOnStartup: false,
  updateChannel: 'stable',
  telemetryEnabled: false,
  installId: '',
};

export class SettingsService {
  private file = path.join(app.getPath('userData'), 'settings.json');
  private listeners = new Set<(s: LauncherSettings) => void>();
  private writeQueue: Promise<LauncherSettings> = Promise.resolve({ ...DEFAULTS });

  /** Subscribe to runtime settings changes (tray/autostart live re-apply). */
  onDidChange(cb: (s: LauncherSettings) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(s: LauncherSettings): void {
    for (const cb of this.listeners) {
      try { cb(s); } catch { /* listener errors must not break persistence */ }
    }
  }

  async get(): Promise<LauncherSettings> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8');
      const merged = { ...DEFAULTS, ...JSON.parse(raw) } as LauncherSettings;
      // Ensure every install has a stable rollout bucket id (never sent anywhere
      // except the rollout gate computation).
      if (!merged.installId) {
        merged.installId = globalThis.crypto.randomUUID();
        await fs.writeFile(this.file, JSON.stringify(merged, null, 2), 'utf-8').catch(() => undefined);
      }
      return merged;
    } catch {
      const seeded = { ...DEFAULTS, installId: globalThis.crypto.randomUUID() };
      await fs.writeFile(this.file, JSON.stringify(seeded, null, 2), 'utf-8').catch(() => undefined);
      return seeded;
    }
  }

  async set(patch: Partial<LauncherSettings>): Promise<LauncherSettings> {
    const operation = this.writeQueue.then(async () => {
      const current = await this.get();
      const next = { ...current, ...patch };
      const temp = `${this.file}.tmp`;
      await fs.writeFile(temp, JSON.stringify(next, null, 2), 'utf-8');
      if (typeof fs.rename === 'function') await fs.rename(temp, this.file);
      else await fs.writeFile(this.file, JSON.stringify(next, null, 2), 'utf-8');
      this.notify(next);
      return next;
    });
    this.writeQueue = operation.catch(() => ({ ...DEFAULTS }));
    return operation;
  }

  async reset(): Promise<LauncherSettings> {
    const next = { ...DEFAULTS, installId: currentInstallId(await this.get()) };
    await fs.writeFile(this.file, JSON.stringify(next, null, 2), 'utf-8');
    this.notify(next);
    return next;
  }
}

/** reset() keeps the rollout bucket id so staged rollouts don't reshuffle. */
function currentInstallId(s: LauncherSettings): string {
  return s.installId;
}
