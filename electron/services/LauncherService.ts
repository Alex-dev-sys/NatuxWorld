import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import yauzl from 'yauzl';
import type { BrowserWindow } from 'electron';
import {
  filterByOsRules,
  platformOsName,
  type AssetIndex,
  type Library,
  type VanillaVersion,
} from './MojangService';
import { MojangService } from './MojangService';
import { DownloadService, type DownloadJob } from './DownloadService';
import { JavaService } from './JavaService';
import { AuthService } from './AuthService';
import { ForgeService } from './ForgeService';
import { MinecraftService, type LaunchHandle } from './MinecraftService';
import { SettingsService } from './SettingsService';
import {
  getAssetObjectPath,
  getAssetsDir,
  getLibrariesDir,
  getMinecraftDir,
  getNativesDir,
  getVersionJarPath,
} from '../utils/paths';

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

export interface ServerStatus {
  online: boolean;
  players: number;
  maxPlayers: number;
  ping: number;
  tps: number;
}

export interface ServerInfo {
  ip: string;
  version: string;
  mode: string;
  map: string;
  difficulty: string;
  whitelist: boolean;
  tps: number;
  ping: number;
}

export interface PlayOptions {
  version: string;
  loader?: 'forge' | 'fabric' | 'neoforge' | 'vanilla';
  username: string;
  memory: number;
  /** When set, the game connects straight to this server on launch (quick play). */
  server?: string;
}

export function parseVersionId(id: string): { loader: string; mcVersion: string } {
  if (id.startsWith('forge-')) return { loader: 'forge', mcVersion: id.slice('forge-'.length) };
  if (id.startsWith('fabric-')) return { loader: 'fabric', mcVersion: id.slice('fabric-'.length) };
  if (id.startsWith('neoforge-')) return { loader: 'neoforge', mcVersion: id.slice('neoforge-'.length) };
  return { loader: 'vanilla', mcVersion: id };
}

export const ASSET_BASE_URL = 'https://resources.download.minecraft.net';

const CHANNEL_PROGRESS = 'launcher:progress';
const CHANNEL_LOG = 'launcher:log';

export class LauncherService extends EventEmitter {
  private window: BrowserWindow | null = null;
  private wired = false;
  private status: LaunchProgress = { stage: 'idle', progress: 0, message: 'Готов к запуску' };
  private currentProc: LaunchHandle | null = null;
  private cancelled = false;
  private isLaunching = false;

  private readonly mojang = new MojangService();
  private readonly download = new DownloadService(8);
  private readonly java = new JavaService();
  private readonly auth = new AuthService();
  private readonly forge = new ForgeService();
  private readonly minecraft = new MinecraftService();
  private readonly settingsSvc = new SettingsService();

  // Minecraft is extremely chatty (thousands of lines on boot). Sending each line
  // as its own IPC message floods the renderer and stalls the progress UI. Buffer
  // lines and flush them as one batched array on a short timer.
  private logBuffer: Array<{ stream: string; line: string }> = [];
  private logTimer: ReturnType<typeof setTimeout> | null = null;

  private queueLog(line: { stream: string; line: string }): void {
    this.logBuffer.push(line);
    if (this.logBuffer.length > 1000) this.logBuffer.shift();
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
    if (this.currentProc) {
      this.currentProc.kill();
      this.currentProc = null;
    }
    this.report({ stage: 'idle', progress: 0, message: 'Отменено' });
  }

  async play(opts: PlayOptions): Promise<{ ok: boolean; error?: string }> {
    if (this.isLaunching || this.currentProc) {
      return { ok: false, error: 'Запуск уже идёт' };
    }
    this.isLaunching = true;
    this.cancelled = false;
    try {
      const parsed = parseVersionId(opts.version);
      await this.runPipeline(parsed.mcVersion, parsed.loader, opts);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.report({ stage: 'error', progress: 0, message: `Ошибка: ${msg}` });
      return { ok: false, error: msg };
    } finally {
      this.isLaunching = false;
    }
  }

  private async runPipeline(mcVersion: string, loader: string, opts: PlayOptions): Promise<void> {
    this.report({ stage: 'resolving', progress: 0, message: 'Получение манифеста Mojang...' });
    const version = await this.mojang.resolveVersion(mcVersion);
    this.throwIfCancelled();

    this.report({ stage: 'java-check', progress: 0, message: 'Проверка Java...' });
    let java = await this.java.detect();
    if (!java) {
      this.report({ stage: 'java-check', progress: 5, message: 'Java не найдена, ставим...' });
      java = await this.java.install();
    }
    this.throwIfCancelled();

    this.report({ stage: 'libraries', progress: 0, message: 'Загрузка библиотек...' });
    const libJobs = this.buildLibraryJobs(version.libraries);
    await this.download.downloadMany(libJobs, (done, total, file) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      this.report({
        stage: 'libraries',
        progress: pct,
        message: `Библиотеки ${pct}%`,
        detail: path.basename(file),
      });
    });
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
    );
    this.throwIfCancelled();

    this.report({ stage: 'assets', progress: 0, message: 'Получение индекса ресурсов...' });
    const index = await this.mojang.resolveAssetIndex(version);
    const assetJobs = this.buildAssetJobs(index);
    await this.download.downloadMany(assetJobs, (done, total) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      this.report({ stage: 'assets', progress: pct, message: `Ресурсы ${pct}%` });
    });
    this.throwIfCancelled();

    this.report({ stage: 'natives-extract', progress: 0, message: 'Распаковка нативных библиотек...' });
    await this.extractNatives(version);
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
      launchVersion = await this.forge.install(mcVersion, java.path, version, (p) => this.report(p));
      this.throwIfCancelled();
    }

    // Account nick is authoritative: re-login if the cached offline profile
    // doesn't match (e.g. an old 'Player' identity from before login existed).
    const cached = await this.auth.getUser();
    const user = cached?.username === opts.username ? cached : await this.auth.login(opts.username);
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
    });

    this.currentProc = handle;
    handle.on('log', (line: { stream: string; line: string }) => {
      this.queueLog(line);
    });
    handle.on('exit', ({ code }: { code: number | null }) => {
      this.currentProc = null;
      this.report({
        stage: 'idle',
        progress: 0,
        message: code === 0 || code === null ? 'Игра завершена' : `Игра упала (код ${code})`,
      });
    });
    handle.on('error', (err: unknown) => {
      this.currentProc = null;
      this.report({
        stage: 'error',
        progress: 0,
        message: `Ошибка запуска: ${err instanceof Error ? err.message : String(err)}`,
      });
    });

    this.report({ stage: 'running', progress: 100, message: `Игра запущена (pid ${handle.pid})` });
  }

  private buildLibraryJobs(libs: Library[]): DownloadJob[] {
    const filtered = filterByOsRules(libs, platformOsName());
    const jobs: DownloadJob[] = [];
    for (const lib of filtered) {
      const artifact = lib.downloads?.artifact;
      if (artifact?.path && artifact.url) {
        jobs.push({
          url: artifact.url,
          dest: path.join(getLibrariesDir(), ...artifact.path.split('/')),
          sha1: artifact.sha1,
          size: artifact.size,
        });
      }
    }
    return jobs;
  }

  private buildAssetJobs(index: AssetIndex): DownloadJob[] {
    const jobs: DownloadJob[] = [];
    for (const obj of Object.values(index.objects)) {
      const prefix = obj.hash.slice(0, 2);
      jobs.push({
        url: `${ASSET_BASE_URL}/${prefix}/${obj.hash}`,
        dest: getAssetObjectPath(obj.hash),
        sha1: obj.hash,
        size: obj.size,
      });
    }
    return jobs;
  }

  private async extractNatives(version: VanillaVersion): Promise<void> {
    const os = platformOsName();
    const nativesDir = getNativesDir(version.id);
    await fsp.mkdir(nativesDir, { recursive: true });

    const nativeLibs = filterByOsRules(version.libraries, os).filter((lib) =>
      lib.name.endsWith(`:natives-${os === 'osx' ? 'macos' : os}`) || lib.name.includes(`:natives-${os}`),
    );

    for (const lib of nativeLibs) {
      const artifactPath = lib.downloads?.artifact?.path;
      if (!artifactPath) continue;
      const jar = path.join(getLibrariesDir(), ...artifactPath.split('/'));
      if (!fs.existsSync(jar)) continue;
      await this.extractNonClassEntries(jar, nativesDir);
    }
  }

  private extractNonClassEntries(jar: string, destDir: string): Promise<void> {
    const root = path.resolve(destDir);
    return new Promise((resolve, reject) => {
      yauzl.open(jar, { lazyEntries: true }, (err, zip) => {
        if (err || !zip) return reject(err ?? new Error('zip open failed'));
        zip.readEntry();
        zip.on('entry', (entry) => {
          const lower = entry.fileName.toLowerCase();
          if (
            entry.fileName.includes('\0') ||
            (process.platform !== 'win32' && entry.fileName.includes('\\'))
          ) {
            return reject(new Error(`Unsafe entry: ${entry.fileName}`));
          }
          const skip =
            lower.startsWith('meta-inf/') ||
            lower.endsWith('.class') ||
            lower.endsWith('.git') ||
            /\/$/.test(entry.fileName);
          if (skip) {
            zip.readEntry();
            return;
          }
          const resolved = path.resolve(root, path.basename(entry.fileName));
          const rel = path.relative(root, resolved);
          if (rel.startsWith('..') || path.isAbsolute(rel)) {
            return reject(new Error(`Unsafe entry escapes natives dir: ${entry.fileName}`));
          }
          zip.openReadStream(entry, (e, stream) => {
            if (e || !stream) return reject(e ?? new Error('zip read failed'));
            const out = fs.createWriteStream(resolved);
            stream.pipe(out);
            out.on('finish', () => zip.readEntry());
            out.on('error', reject);
          });
        });
        zip.on('end', () => resolve());
        zip.on('error', reject);
      });
    });
  }

  private report(p: LaunchProgress): void {
    this.status = p;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(CHANNEL_PROGRESS, p);
    }
  }

  private throwIfCancelled(): void {
    if (this.cancelled) throw new Error('Отменено пользователем');
  }

  private async fetchSiteApi<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.get(`https://vibestudy.ru${path}`, { timeout: 6000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  async getServerStatus(): Promise<ServerStatus> {
    try {
      const t0 = Date.now();
      const data = await this.fetchSiteApi<{
        online: boolean; players: { online: number; max: number }; tps?: number;
      }>('/api/server/status');
      const ping = Date.now() - t0;
      return {
        online: data.online,
        players: data.players?.online ?? 0,
        maxPlayers: data.players?.max ?? 100,
        ping,
        tps: data.tps ?? 20.0,
      };
    } catch {
      return { online: false, players: 0, maxPlayers: 100, ping: 0, tps: 0 };
    }
  }

  async getServerInfo(): Promise<ServerInfo> {
    try {
      const data = await this.fetchSiteApi<{
        online: boolean; players: { online: number; max: number }; version: string; tps?: number;
      }>('/api/server/status');
      const status = await this.getServerStatus();
      return {
        ip: 'mc.vibestudy.ru',
        version: data.version || '1.20.1+',
        mode: 'Анархия · PvP · Выживание',
        map: 'world_anarchy',
        difficulty: 'Hard',
        whitelist: false,
        tps: data.tps ?? status.tps,
        ping: status.ping,
      };
    } catch {
      return {
        ip: 'mc.vibestudy.ru',
        version: '1.20.1+',
        mode: 'Анархия · PvP · Выживание',
        map: 'world_anarchy',
        difficulty: 'Hard',
        whitelist: false,
        tps: 0,
        ping: 0,
      };
    }
  }
}

export const LAUNCHER_PROGRESS_CHANNEL = CHANNEL_PROGRESS;
export const LAUNCHER_LOG_CHANNEL = CHANNEL_LOG;
