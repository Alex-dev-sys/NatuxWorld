import { app, BrowserWindow, dialog } from 'electron';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import pkg from 'electron-updater';
import {
  fetchTrustedTauriControl,
  getTauriMigrationOffer,
  fetchTrustedUpdateManifest,
  isUpdateVisible,
  matchesUpdateCandidate,
  type TauriMigrationOffer,
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
  | { type: 'tauri-migration'; version: string; url: string }
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
  private downloadedFile: string | null = null;
  private downloadedManifestVersion: string | null = null;
  private lastTauriMigrationNotice: string | null = null;
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
      this.downloadedFile = null;
      this.downloadedManifestVersion = null;
      void autoUpdater.downloadUpdate().catch((err: unknown) => {
        this.downloadingVersion = null;
        this.downloadedFile = null;
        this.downloadedManifestVersion = null;
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

    autoUpdater.on('update-downloaded', async (info) => {
      if (MANUAL_UPDATE) {
        this.emit({ type: 'downloaded', version: info.version });
        return;
      }
      const manifest = this.trustedManifest;
      if (!manifest || info.version !== manifest.version || !info.downloadedFile) {
        this.downloadingVersion = null;
        this.downloadedFile = null;
        this.downloadedManifestVersion = null;
        this.emit({ type: 'error', message: 'Downloaded update version is not trusted' });
        return;
      }
      try {
        const digest = await this.hashFile(info.downloadedFile);
        if (digest !== manifest.sha512) {
          this.downloadingVersion = null;
          this.downloadedFile = null;
          this.downloadedManifestVersion = null;
          this.emit({ type: 'error', message: 'Downloaded installer does not match the signed manifest' });
          return;
        }
        this.downloadedFile = info.downloadedFile;
        this.downloadedManifestVersion = manifest.version;
        this.downloadingVersion = null;
        this.emit({ type: 'downloaded', version: info.version });
      } catch {
        this.downloadingVersion = null;
        this.downloadedFile = null;
        this.downloadedManifestVersion = null;
        this.emit({ type: 'error', message: 'Could not verify the downloaded installer' });
      }
    });

    autoUpdater.on('error', (err) => {
      this.emit({ type: 'error', message: err?.message ?? String(err) });
    });
  }

  async check(): Promise<UpdateInfo> {
    if (!app.isPackaged) return { available: false, version: app.getVersion() };
    try {
      const ctx = await this.visibilityContext();
      void fetchTrustedTauriControl(ctx.channel).then((control) => {
        const offer: TauriMigrationOffer | null = getTauriMigrationOffer(control, {
          ...ctx,
          currentVersion: app.getVersion(),
          platform: process.platform,
          arch: process.arch,
        });
        if (offer && this.lastTauriMigrationNotice !== offer.version) {
          this.lastTauriMigrationNotice = offer.version;
          this.emit({ type: 'tauri-migration', ...offer });
        }
      }).catch(() => {
        // An unavailable/malformed Tauri channel must never interrupt Electron updates.
      });
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
   * version, hash our own executable and compare with the manifest's
   * `executableSha512`. A mismatch means the installed binary was modified
   * after install — warn the user (dialog) and let them decide. Never blocks
   * startup.
   *
   * `manifest.sha512` is the INSTALLER's hash — a different file — so comparing
   * against it flagged every healthy installation as corrupt. Releases signed
   * before `executableSha512` existed simply have nothing to check.
   */
  async checkSelfIntegrity(): Promise<'ok' | 'stale-manifest' | 'mismatch' | 'error'> {
    if (!app.isPackaged || MANUAL_UPDATE) return 'stale-manifest';
    try {
      const manifest = await fetchTrustedUpdateManifest();
      if (manifest.version !== app.getVersion()) return 'stale-manifest';
      if (!manifest.executableSha512) return 'stale-manifest';

      const hash = createHash('sha512');
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(process.execPath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      if (hash.digest('base64') === manifest.executableSha512) return 'ok';

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

  async installNow(): Promise<void> {
    // Windows reaches this point only after signed-manifest verification.
    if (!app.isPackaged || MANUAL_UPDATE) return;
    const manifest = this.trustedManifest;
    const downloadedFile = this.downloadedFile;
    if (!manifest || !downloadedFile || this.downloadedManifestVersion !== manifest.version) {
      this.emit({ type: 'error', message: 'No verified update installer is ready' });
      return;
    }
    try {
      // Recheck immediately before handing the installer to electron-updater so
      // a replaced file cannot inherit the earlier update-downloaded decision.
      if (await this.hashFile(downloadedFile) !== manifest.sha512) {
        this.downloadedFile = null;
        this.downloadedManifestVersion = null;
        this.emit({ type: 'error', message: 'Downloaded installer no longer matches the signed manifest' });
        return;
      }
    } catch {
      this.downloadedFile = null;
      this.downloadedManifestVersion = null;
      this.emit({ type: 'error', message: 'Could not verify the downloaded installer' });
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  }

  private async hashFile(filePath: string): Promise<string> {
    const hash = createHash('sha512');
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
    return hash.digest('base64');
  }

  private emit(event: UpdateEvent): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(CHANNEL, event);
    }
  }
}

export const UPDATER_EVENT_CHANNEL = CHANNEL;
