import { app, BrowserWindow } from 'electron';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

export interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  url?: string;
}

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; notes?: string }
  | { type: 'not-available'; version: string }
  | { type: 'progress'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

const CHANNEL = 'updater:event';

export class UpdateService {
  private window: BrowserWindow | null = null;
  private wired = false;
  private lastInfo: UpdateInfo = { available: false };

  attach(win: BrowserWindow): void {
    this.window = win;
    if (this.wired) return;
    this.wired = true;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => this.emit({ type: 'checking' }));

    autoUpdater.on('update-available', (info) => {
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined;
      this.lastInfo = { available: true, version: info.version, notes };
      this.emit({ type: 'available', version: info.version, notes });
    });

    autoUpdater.on('update-not-available', (info) => {
      this.lastInfo = { available: false, version: info.version };
      this.emit({ type: 'not-available', version: info.version });
    });

    autoUpdater.on('download-progress', (p) => {
      this.emit({
        type: 'progress',
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.emit({ type: 'downloaded', version: info.version });
    });

    autoUpdater.on('error', (err) => {
      this.emit({ type: 'error', message: err?.message ?? String(err) });
    });
  }

  async check(): Promise<UpdateInfo> {
    if (!app.isPackaged) return { available: false, version: app.getVersion() };
    try {
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      if (!info) return this.lastInfo;
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined;
      this.lastInfo = { available: info.version !== app.getVersion(), version: info.version, notes };
      return this.lastInfo;
    } catch (err) {
      this.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      return { available: false };
    }
  }

  installNow(): void {
    if (!app.isPackaged) return;
    autoUpdater.quitAndInstall(false, true);
  }

  private emit(event: UpdateEvent): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(CHANNEL, event);
    }
  }
}

export const UPDATER_EVENT_CHANNEL = CHANNEL;
