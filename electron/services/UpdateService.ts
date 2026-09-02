import { app, BrowserWindow, dialog } from 'electron';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import pkg from 'electron-updater';
import {
  fetchTrustedUpdateManifest,
  isUpdateVisible,
  matchesUpdateCandidate,
  type SignedUpdateManifest,
} from './UpdateTrust';
import { SettingsService } from './SettingsService';
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
  private settings = new SettingsService();

  /** Resolve the effective channel/installId for this check. */
  private async visibilityContext(): Promise<{ channel: 'stable' | 'beta'; installId: string }> {
    try {
      const s = await this.settings.get();
      return { channel: s.updateChannel === 'beta' ? 'beta' : 'stable', installId: s.installId };
    } catch {
      return { channel: 'stable', installId: '' };
    }
  }

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

    autoUpdater.on('update-available', async (info) => {
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined;
      if (MANUAL_UPDATE) {
        this.lastInfo = { available: true, version: info.version, notes };
        this.emit({ type: 'manual', version: info.version, notes, url: RELEASES_URL });
        return;
      }
      const ctx = await this.visibilityContext();
      if (
        !this.trustedManifest ||
        !matchesUpdateCandidate(info, this.trustedManifest) ||
        // Channel + staged-rollout gate on top of the signature check: an update
        // aimed at another channel (or outside the rollout bucket) is invisible.
        !isUpdateVisible(this.trustedManifest, { ...ctx, currentVersion: app.getVersion() })
      ) {
        this.lastInfo = { available: false, version: info.version };
        this.emit({ type: 'not-available', version: info.version });
        return;
      }
      this.lastInfo = { available: true, version: info.version, notes };
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
      const ctx = await this.visibilityContext();
      if (!MANUAL_UPDATE) {
        // Fail closed: electron-updater is never allowed to download before this
        // detached signature and the release SHA-512 have been verified.
        this.trustedManifest = await fetchTrustedUpdateManifest();
        // Beta channel listens for prerelease GitHub releases.
        autoUpdater.allowPrerelease = ctx.channel === 'beta';
      }
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      if (!info) return this.lastInfo;
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined;
      // Visible availability already accounts for channel + rollout; a same-version
      // feed or a hidden staged release reads as "up to date" here.
      const visible =
        info.version !== app.getVersion() &&
        (!MANUAL_UPDATE && this.trustedManifest
          ? isUpdateVisible(this.trustedManifest, { ...ctx, currentVersion: app.getVersion() })
          : true);
      this.lastInfo = { available: visible, version: info.version, notes: visible ? notes : undefined };
      return this.lastInfo;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ type: 'error', message });
      return { available: false, error: message };
    }
  }

  /**
   * Self-integrity check: when the signed manifest describes the CURRENT
   * version, hash our own executable and compare with the manifest SHA-512.
   * A mismatch means the installed binary was modified after install — warn
   * the user (dialog) and let them decide. Never blocks startup.
   */
  async checkSelfIntegrity(): Promise<'ok' | 'stale-manifest' | 'mismatch' | 'error'> {
    if (!app.isPackaged || MANUAL_UPDATE) return 'stale-manifest';
    try {
      const manifest = await fetchTrustedUpdateManifest();
      if (manifest.version !== app.getVersion()) return 'stale-manifest';

      const hash = createHash('sha512');
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(process.execPath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      if (hash.digest('base64') === manifest.sha512) return 'ok';

      this.emit({ type: 'error', message: 'Launcher integrity check failed: binary does not match the signed manifest' });
      dialog.showMessageBox({
        type: 'warning',
        title: 'Проверка целостности',
        message: 'Файл лаунчера не совпадает с подписанным манифестом.',
        detail: 'Возможна повреждённая установка или стороннее изменение файлов. Рекомендуется переустановить лаунчер с официального сайта.',
        buttons: ['Понятно'],
      });
      return 'mismatch';
    } catch {
      return 'error';
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
