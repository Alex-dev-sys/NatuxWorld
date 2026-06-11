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
  // macOS only: in-app install is impossible (Squirrel.Mac refuses unsigned updates),
  // so the user is pointed at the release page to download the new dmg manually.
  | { type: 'manual'; version: string; notes?: string; url: string }
  | { type: 'not-available'; version: string }
  | { type: 'progress'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

const CHANNEL = 'updater:event';

// macOS builds are unsigned (no Apple Developer ID), and Squirrel.Mac rejects unsigned
// auto-updates with a code-signature error. So on mac we never download/quitAndInstall —
// we just detect the new version and send the user to the release page.
const MANUAL_UPDATE = process.platform === 'darwin';
const RELEASES_URL = 'https://github.com/Alex-dev-sys/NatuxWorld/releases/latest';

export class UpdateService {
  private window: BrowserWindow | null = null;
  private wired = false;
  private lastInfo: UpdateInfo = { available: false };

  attach(win: BrowserWindow): void {
    this.window = win;
    if (this.wired) return;
    this.wired = true;

    // On mac, never auto-download or install-on-quit: the install step can't succeed
    // unsigned, and a half-downloaded update only wastes bandwidth and shows a broken
    // "ready to install" toast. Windows keeps the full silent-download flow.
    autoUpdater.autoDownload = !MANUAL_UPDATE;
    autoUpdater.autoInstallOnAppQuit = !MANUAL_UPDATE;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => this.emit({ type: 'checking' }));

    autoUpdater.on('update-available', (info) => {
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined;
      this.lastInfo = { available: true, version: info.version, notes };
      if (MANUAL_UPDATE) {
        this.emit({ type: 'manual', version: info.version, notes, url: RELEASES_URL });
      } else {
        this.emit({ type: 'available', version: info.version, notes });
      }
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
    // No in-app install on mac (unsigned) — the renderer opens the release page instead.
    if (!app.isPackaged || MANUAL_UPDATE) return;
    autoUpdater.quitAndInstall(false, true);
  }

  private emit(event: UpdateEvent): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(CHANNEL, event);
    }
  }
}

export const UPDATER_EVENT_CHANNEL = CHANNEL;
