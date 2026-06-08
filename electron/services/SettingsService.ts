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
}

const DEFAULTS: LauncherSettings = {
  memory: 4096,
  fullscreen: false,
  closeOnLaunch: false,
  language: 'ru',
  jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC',
  resolution: { width: 1280, height: 720 },
};

export class SettingsService {
  private file = path.join(app.getPath('userData'), 'settings.json');

  async get(): Promise<LauncherSettings> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8');
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return DEFAULTS;
    }
  }

  async set(patch: Partial<LauncherSettings>): Promise<LauncherSettings> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await fs.writeFile(this.file, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }
}
