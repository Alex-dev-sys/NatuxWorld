import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { MojangService } from './MojangService';
import { DownloadService } from './DownloadService';
import { JavaService } from './JavaService';
import { AuthService } from './AuthService';
import { ForgeService } from './ForgeService';
import { MinecraftService, type LaunchHandle } from './MinecraftService';
import { SettingsService } from './SettingsService';
import { CrashReportService } from './CrashReportService';
import { playtime } from './PlaytimeService';
import { discordRpc } from './DiscordRpcService';
import { TelemetryService } from './TelemetryService';
import { LauncherServerService, type ServerStatus, type ServerInfo } from './LauncherServerService';
import { buildLibraryJobs, buildAssetJobs, extractNatives, selectNativeLibs } from './LauncherResources';
import {
  getAssetsDir,
  getAuthlibPath,
  getMinecraftDir,
  getNativesDir,
  getRuntimeDir,
  getVersionJarPath,
} from '../utils/paths';

export type { ServerStatus, ServerInfo } from './LauncherServerService';
export { ASSET_BASE_URL } from './LauncherResources';

export type Stage =
  | 'idle'
  | 'resolving'
  | 'java-check'
  | 'libraries'
  | 'assets'
  | 'natives-extract'
  | 'forge-install'
  | 'spawn'
  | 'running'
  | 'error';

export interface LaunchProgress {
  stage: Stage;
  progress: number;
  message: string;
  detail?: string;
}

export interface PlayOptions {
  version: string;
  loader?: 'forge' | 'fabric' | 'neoforge' | 'vanilla';
  username: string;
  memory: number;
  /** When set, the game connects straight to this server on launch (quick play). */
  server?: string;
  /** Injected by handlers.ts — real Yggdrasil credentials from /api/auth/game-session. */
  _gameToken?: { accessToken: string; uuid: string };
}

export function parseVersionId(id: string): { loader: string; mcVersion: string } {
  if (id.startsWith('forge-')) return { loader: 'forge', mcVersion: id.slice('forge-'.length) };
  if (id.startsWith('fabric-')) return { loader: 'fabric', mcVersion: id.slice('fabric-'.length) };
  if (id.startsWith('neoforge-')) return { loader: 'neoforge', mcVersion: id.slice('neoforge-'.length) };
  return { loader: 'vanilla', mcVersion: id };
}

/** Free disk space required before we start pulling libraries/assets (~1.5 GB). */
const MIN_FREE_BYTES = 1.5 * 1024 * 1024 * 1024;

/** Longest the UI waits for a cancelled pipeline to unwind before showing idle. */
const CANCEL_GRACE_MS = 10_000;
const CHANNEL_PROGRESS = 'launcher:progress';
const CHANNEL_LOG = 'launcher:log';

export class LauncherService extends EventEmitter {
  private window: BrowserWindow | null = null;
  private wired = false;
  private status: LaunchProgress = { stage: 'idle', progress: 0, message: 'Готов к запуску' };
  private currentProc: LaunchHandle | null = null;
  private cancelled = false;
  private isLaunching = false;
  private abort: AbortController | null = null;
  /** Resolves when the in-flight pipeline has fully unwound; see cancel(). */
  private launchSettled: Promise<void> | null = null;
  private resolveLaunchSettled: (() => void) | null = null;

  private readonly mojang = new MojangService();
  private readonly download = new DownloadService(8);
  private readonly java = new JavaService();
  private readonly auth = new AuthService();
  private readonly forge = new ForgeService();
  private readonly minecraft = new MinecraftService();
  private readonly settingsSvc = new SettingsService();
  private readonly crashReporter = new CrashReportService();
  private readonly telemetry = new TelemetryService();
  private readonly server = new LauncherServerService();

  // Rolling tail of recent log lines, retained for opt-in crash reports. Separate from
  // logBuffer (which is drained on each IPC flush), so a report still has context.
  private recentLogs: string[] = [];

  // Minecraft is extremely chatty (thousands of lines on boot). Sending each line
  // as its own IPC message floods the renderer and stalls the progress UI. Buffer
  // lines and flush them as one batched array on a short timer.
  private logBuffer: Array<{ stream: string; line: string }> = [];
  private logTimer: ReturnType<typeof setTimeout> | null = null;

  private queueLog(line: { stream: string; line: string }): void {
    this.logBuffer.push(line);
    if (this.logBuffer.length > 1000) this.logBuffer.shift();
    this.recentLogs.push(`[${line.stream}] ${line.line}`);
    if (this.recentLogs.length > 300) this.recentLogs.shift();
    if (!this.logTimer) {
      this.logTimer = setTimeout(() => this.flushLogs(), 150);
    }
  }

  private flushLogs(): void {
    const batch = this.logBuffer;
    this.logBuffer = [];
    this.logTimer = null;
    if (batch.length && this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(CHANNEL_LOG, batch);
    }
  }

  attach(win: BrowserWindow): void {
    this.window = win;
    if (this.wired) return;
    this.wired = true;
    this.java.on('progress', (p: { progress: number; message: string }) => {
      this.report({
        stage: 'java-check',
        progress: p.progress,
        message: p.message,
      });
    });
    this.forge.on('log', (line: { stream: string; line: string }) => {
      this.queueLog(line);
    });
  }

  getStatus(): LaunchProgress {
    return this.status;
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    this.abort?.abort();
    if (this.currentProc) {
      this.currentProc.kill();
      this.currentProc = null;
    }
    // Report "Отменено" only once the pipeline has actually stopped. Announcing
    // it while Java/Forge were still installing let the user press PLAY again
    // and get "Запуск уже идёт" from a stage that had not finished unwinding.
    if (this.launchSettled) {
      await Promise.race([
        this.launchSettled,
        new Promise<void>((r) => setTimeout(r, CANCEL_GRACE_MS)),
      ]);
    }
    this.report({ stage: 'idle', progress: 0, message: 'Отменено' });
  }

  async play(opts: PlayOptions): Promise<{ ok: boolean; error?: string }> {
    if (this.isLaunching || this.currentProc) {
      return { ok: false, error: 'Запуск уже идёт' };
    }
    this.isLaunching = true;
    this.cancelled = false;
    this.abort = new AbortController();
    this.recentLogs = [];
    this.launchSettled = new Promise<void>((resolve) => { this.resolveLaunchSettled = resolve; });
    try {
      const parsed = parseVersionId(opts.version);
      await this.runPipeline(parsed.mcVersion, parsed.loader, opts);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const failedStage = this.status.stage; // capture before report() overwrites to 'error'
      this.report({ stage: 'error', progress: 0, message: `Ошибка: ${msg}` });
      // User-initiated cancel is not a crash — don't report it.
      if (!this.cancelled) {
        void this.telemetry.send('install_fail');
        void this.crashReporter.report({
          kind: 'launch-error',
          stage: failedStage,
          message: msg,
          logs: this.recentLogs,
          // Scrubbed out of the report, never sent.
          username: opts.username,
        });
      }
      return { ok: false, error: msg };
    } finally {
      this.isLaunching = false;
      this.resolveLaunchSettled?.();
      this.resolveLaunchSettled = null;
      this.launchSettled = null;
    }
  }

  private async runPipeline(mcVersion: string, loader: string, opts: PlayOptions): Promise<void> {
    this.report({ stage: 'resolving', progress: 0, message: 'Получение манифеста Mojang...' });
    const version = await this.mojang.resolveVersion(mcVersion);
    this.throwIfCancelled();

    // Disk space gate: fail BEFORE downloading hundreds of MB, with a clear
    // message instead of an obscure ENOSPC in the middle of the install.
    await fsp.mkdir(getMinecraftDir(), { recursive: true });
    const stats = await fsp.statfs(getMinecraftDir());
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    if (Number.isFinite(freeBytes) && freeBytes < MIN_FREE_BYTES) {
      throw new Error(
        `Недостаточно места на диске: свободно ${(freeBytes / 1024 ** 3).toFixed(1)} GB, ` +
        `для игры нужно ~${(MIN_FREE_BYTES / 1024 ** 3).toFixed(1)} GB. Освободите место и попробуйте снова.`,
      );
    }

    this.report({ stage: 'java-check', progress: 0, message: 'Проверка Java...' });
    let java = await this.java.detect();
    if (!java) {
      this.report({ stage: 'java-check', progress: 5, message: 'Java не найдена, ставим...' });
      java = await this.java.install(this.abort?.signal);
    }
    this.throwIfCancelled();

    this.report({ stage: 'libraries', progress: 0, message: 'Загрузка библиотек...' });
    const libJobs = buildLibraryJobs(version.libraries);
    await this.download.downloadMany(libJobs, (done, total, file) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      this.report({
        stage: 'libraries',
        progress: pct,
        message: `Библиотеки ${pct}%`,
        detail: path.basename(file),
      });
    }, this.abort?.signal);
    this.throwIfCancelled();

    this.report({ stage: 'libraries', progress: 100, message: 'Загрузка клиента...' });
    await this.download.downloadMany(
      [
        {
          url: version.downloads.client.url,
          dest: getVersionJarPath(version.id),
          sha1: version.downloads.client.sha1,
          size: version.downloads.client.size,
        },
      ],
      () => undefined,
      this.abort?.signal,
    );
    this.throwIfCancelled();

    this.report({ stage: 'assets', progress: 0, message: 'Получение индекса ресурсов...' });
    const index = await this.mojang.resolveAssetIndex(version);
    const assetJobs = buildAssetJobs(index);
    await this.download.downloadMany(assetJobs, (done, total) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      this.report({ stage: 'assets', progress: pct, message: `Ресурсы ${pct}%` });
    }, this.abort?.signal);
    this.throwIfCancelled();

    this.report({ stage: 'natives-extract', progress: 0, message: 'Распаковка нативных библиотек...' });
    await extractNatives(version);
    this.throwIfCancelled();

    if (loader !== 'vanilla' && loader !== 'forge') {
      this.report({
        stage: 'libraries',
        progress: 100,
        message: `${loader} ещё не поддерживается — запускаем ваниль`,
      });
    }

    // Forge installs on top of the prepared vanilla files; merged manifest drives the launch.
    // The vanilla client jar and natives dir are reused (Forge inherits them).
    let launchVersion = version;
    if (loader === 'forge') {
      this.report({ stage: 'forge-install', progress: 0, message: 'Установка Forge...' });
      launchVersion = await this.forge.install(
        mcVersion,
        java.path,
        version,
        (p) => this.report(p),
        this.abort?.signal,
      );
      this.throwIfCancelled();
    }

    // Account nick is authoritative: re-login if the cached offline profile
    // doesn't match (e.g. an old 'Player' identity from before login existed).
    // Always refresh auth file from opts.username (guaranteed by handlers.ts to be from verified session).
    const user = await this.auth.login(opts.username);
    // Override with real Yggdrasil credentials when available (online-mode=true path).
    if (opts._gameToken) {
      user.accessToken = opts._gameToken.accessToken;
      user.uuid = opts._gameToken.uuid;
    }
    this.throwIfCancelled();

    // Ensure authlib-injector is present (pinned v1.2.7, sha1 verified).
    const authlibPath = getAuthlibPath();
    if (!fs.existsSync(authlibPath)) {
      await fsp.mkdir(getRuntimeDir(), { recursive: true });
      this.report({ stage: 'spawn', progress: 0, message: 'Загрузка authlib-injector...' });
      await this.download.downloadMany([{
        url: 'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.7/authlib-injector-1.2.7.jar',
        dest: authlibPath,
        sha1: '9a401b2cdb97bf49e5c447dcfb0325979168b672',
        size: 344477,
      }], () => {}, this.abort?.signal);
    }
    this.throwIfCancelled();

    this.report({ stage: 'spawn', progress: 0, message: 'Запуск Minecraft...' });
    await fsp.mkdir(getMinecraftDir(), { recursive: true });

    const cfg = await this.settingsSvc.get();

    // SECURITY: cfg.jvmArgs and cfg.javaPath are intentionally NOT forwarded to the launch
    // arg builder. They originate from the (untrusted) renderer; passing jvmArgs would let a
    // compromised UI inject arbitrary JVM flags, and javaPath would run an arbitrary binary.
    // If ever wired in, each must be tokenized + validated (no shell, no path traversal).
    const handle = this.minecraft.launch({
      version: launchVersion,
      javaPath: java.path,
      gameDir: getMinecraftDir(),
      assetsDir: getAssetsDir(),
      nativesDir: getNativesDir(version.id),
      clientJar: getVersionJarPath(version.id),
      user,
      memory: cfg.memory,
      quickPlayServer: opts.server,
      width: cfg.resolution.width,
      height: cfg.resolution.height,
      fullscreen: cfg.fullscreen,
      authlibJarPath: authlibPath,
    });

    this.currentProc = handle;
    handle.on('log', (line: { stream: string; line: string }) => {
      this.queueLog(line);
    });
    handle.on('exit', ({ code }: { code: number | null }) => {
      this.currentProc = null;
      void playtime.endSession().catch(() => undefined);
      void discordRpc.clear().catch(() => undefined);
      const crashed = code !== 0 && code !== null;
      this.report({
        stage: 'idle',
        progress: 0,
        message: crashed ? `Игра упала (код ${code})` : 'Игра завершена',
      });
      // A non-zero exit that the user didn't trigger via cancel() is a real crash.
      if (crashed && !this.cancelled) {
        void this.telemetry.send('game_crash');
        void this.crashReporter.report({
          kind: 'game-crash',
          stage: 'running',
          exitCode: code ?? undefined,
          message: `Игра завершилась с кодом ${code}`,
          logs: this.recentLogs,
          // Scrubbed out of the report, never sent.
          username: opts.username,
        });
      }
    });
    handle.on('error', (err: unknown) => {
      this.currentProc = null;
      void playtime.endSession().catch(() => undefined);
      void discordRpc.clear().catch(() => undefined);
      this.report({
        stage: 'error',
        progress: 0,
        message: `Ошибка запуска: ${err instanceof Error ? err.message : String(err)}`,
      });
    });

    // The game is live: start the local play-time session, advertise on Discord
    // and (opt-in) count the successful launch.
    void playtime.beginSession().catch(() => undefined);
    void discordRpc.setInGame({ username: opts.username, server: opts.server }).catch(() => undefined);
    void this.telemetry.send('launch_ok');

    this.report({ stage: 'running', progress: 100, message: `Игра запущена (pid ${handle.pid})` });

    // closeOnLaunch: get out of the way once the game is actually up. Minimize
    // rather than quit — the launcher still owns the game process, play-time
    // session, log stream and crash reporting. The window stays on the taskbar
    // (and the tray, when close-to-tray is on), so it is always reachable.
    if (cfg.closeOnLaunch && this.window && !this.window.isDestroyed()) {
      this.window.minimize();
    }
  }

  static selectNativeLibs = selectNativeLibs;

  // Thousands of small asset downloads each fire a progress callback. Forwarding every
  // one over IPC makes the renderer re-render at hundreds of FPS and the whole app lags.
  // Same-stage updates are throttled to ~10/s; stage changes always go out immediately.
  private lastSentAt = 0;
  private pendingReport: ReturnType<typeof setTimeout> | null = null;

  private report(p: LaunchProgress): void {
    this.status = p;
    const stageChanged = this.lastSentStage !== p.stage;
    const now = Date.now();
    if (stageChanged || now - this.lastSentAt >= 100) {
      if (this.pendingReport) {
        clearTimeout(this.pendingReport);
        this.pendingReport = null;
      }
      this.sendProgress(p);
    } else if (!this.pendingReport) {
      // Trailing send so the final value of a burst (e.g. "Ресурсы 100%") isn't dropped.
      this.pendingReport = setTimeout(() => {
        this.pendingReport = null;
        this.sendProgress(this.status);
      }, 120);
    }
  }

  private lastSentStage: Stage | null = null;

  private sendProgress(p: LaunchProgress): void {
    this.lastSentAt = Date.now();
    this.lastSentStage = p.stage;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(CHANNEL_PROGRESS, p);
    }
  }

  private throwIfCancelled(): void {
    if (this.cancelled) throw new Error('Отменено пользователем');
  }

  getServerStatus(): Promise<ServerStatus> {
    return this.server.getServerStatus();
  }

  getServerInfo(): Promise<ServerInfo> {
    return this.server.getServerInfo();
  }
}

export const LAUNCHER_PROGRESS_CHANNEL = CHANNEL_PROGRESS;
export const LAUNCHER_LOG_CHANNEL = CHANNEL_LOG;
