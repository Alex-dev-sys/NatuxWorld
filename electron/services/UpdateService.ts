import { app, BrowserWindow } from 'electron';
import pkg from 'electron-updater';
import {
  fetchTrustedUpdateManifest,
  matchesUpdateCandidate,
  type SignedUpdateManifest,
} from './UpdateTrust';
const { autoUpdater } = pkg;

export interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  url?: string;
  error?: string;
}

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; notes?: string }
  // macOS stays manual until Developer ID signing/notarization is configured.
  | { type: 'manual'; version: string; notes?: string; url: string }
  | { type: 'not-available'; version: string }
  | { type: 'progress'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

const CHANNEL = 'updater:event';

// Windows updates are authenticated independently from Authenticode with an
// Ed25519-signed manifest. macOS still requires Developer ID notarization.
const MANUAL_UPDATE = process.platform !== 'win32';
const RELEASES_URL = 'https://github.com/Alex-dev-sys/NatuxWorld/releases/latest';

export class UpdateService {
  private window: BrowserWindow | null = null;
  private wired = false;
  private lastInfo: UpdateInfo = { available: false };
  private trustedManifest: SignedUpdateManifest | null = null;
  private downloadingVersion: string | null = null;

  attach(win: BrowserWindow): void {
    this.window = win;
    if (this.wired) return;
    this.wired = true;

    // Download only after update-available metadata matches the signed manifest.
    autoUpdater.autoDownload = false;
    // Keep installation behind the explicit "Restart and install" button.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => this.emit({ type: 'checking' }));

    autoUpdater.on('update-available', (info) => {
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined;
      this.lastInfo = { available: true, version: info.version, notes };
      if (MANUAL_UPDATE) {
        this.emit({ type: 'manual', version: info.version, notes, url: RELEASES_URL });
        return;
      }
      if (!this.trustedManifest || !matchesUpdateCandidate(info, this.trustedManifest)) {
        this.emit({ type: 'error', message: 'Update metadata does not match the signed manifest' });
        return;
      }
      this.emit({ type: 'available', version: info.version, notes });
      if (this.downloadingVersion === info.version) return;
      this.downloadingVersion = info.version;
      void autoUpdater.downloadUpdate().catch((err: unknown) => {
        this.downloadingVersion = null;
        this.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      });
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
      if (!MANUAL_UPDATE && info.version !== this.trustedManifest?.version) {
        this.emit({ type: 'error', message: 'Downloaded update version is not trusted' });
        return;
      }
      this.emit({ type: 'downloaded', version: info.version });
    });

    autoUpdater.on('error', (err) => {
      this.emit({ type: 'error', message: err?.message ?? String(err) });
    });
  }

  async check(): Promise<UpdateInfo> {
    if (!app.isPackaged) return { available: false, version: app.getVersion() };
    try {
      if (!MANUAL_UPDATE) {
        // Fail closed: electron-updater is never allowed to download before this
        // detached signature and the release SHA-512 have been verified.
        this.trustedManifest = await fetchTrustedUpdateManifest();
      }
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      if (!info) return this.lastInfo;
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined;
      this.lastInfo = { available: info.version !== app.getVersion(), version: info.version, notes };
      return this.lastInfo;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ type: 'error', message });
      return { available: false, error: message };
    }
  }

  installNow(): void {
    // Windows reaches this point only after signed-manifest verification.
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
