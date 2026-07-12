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
  // Unsigned builds use a manual, user-visible download flow on every OS.
  | { type: 'manual'; version: string; notes?: string; url: string }
  | { type: 'not-available'; version: string }
  | { type: 'progress'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

const CHANNEL = 'updater:event';

// Until both Windows and macOS artifacts are code-signed, silently installing a
// GitHub release would make repository/CI compromise an unauthenticated RCE path.
// Keep updates explicit on every OS; switch this only together with publisher
// verification and notarization in electron-builder.
const MANUAL_UPDATE = true;
const RELEASES_URL = 'https://github.com/Alex-dev-sys/NatuxWorld/releases/latest';

export class UpdateService {
  private window: BrowserWindow | null = null;
  private wired = false;
  private lastInfo: UpdateInfo = { available: false };

  attach(win: BrowserWindow): void {
    this.window = win;
    if (this.wired) return;
    this.wired = true;

    // Unsigned artifacts are never downloaded or installed silently.
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
    // Unsigned builds always send the user to the release page instead.
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
