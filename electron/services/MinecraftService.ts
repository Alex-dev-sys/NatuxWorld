import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { writeFileSync, unlinkSync } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import {
  filterByOsRules,
  platformOsName,
  resolveGameArguments,
  resolveJvmArguments,
  type Library,
  type OsName,
  type VanillaVersion,
} from './MojangService';
import { getLibrariesDir } from '../utils/paths';
import type { User } from './AuthService';
import { BRAND, BRAND_URLS } from '../../brand.config';

export function classpathSeparator(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? ';' : ':';
}

export function buildClasspath(
  libs: string[],
  clientJar: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return [...libs, clientJar].join(classpathSeparator(platform));
}

export function resolveLibraryPaths(libs: Library[], os: OsName = platformOsName()): string[] {
  const filtered = filterByOsRules(libs, os);
  const out: string[] = [];
  for (const lib of filtered) {
    const artifact = lib.downloads?.artifact;
    if (artifact?.path) {
      out.push(path.join(getLibrariesDir(), ...artifact.path.split('/')));
    }
    const classifierName = lib.natives?.[os];
    const cls = classifierName ? lib.downloads?.classifiers?.[classifierName] : undefined;
    if (cls?.path) {
      out.push(path.join(getLibrariesDir(), ...cls.path.split('/')));
    }
  }
  return out;
}

export interface GameValues {
  auth_player_name: string;
  auth_uuid: string;
  auth_access_token: string;
  version_name: string;
  version_type: string;
  game_directory: string;
  assets_root: string;
  assets_index_name: string;
  user_type: string;
  natives_directory: string;
  launcher_name: string;
  launcher_version: string;
  classpath: string;
}

export function buildGameValues(input: {
  username: string;
  uuid: string;
  accessToken: string;
  versionId: string;
  versionType: string;
  gameDir: string;
  assetsDir: string;
  assetIndex: string;
  nativesDir: string;
  classpath?: string;
}): GameValues {
  return {
    auth_player_name: input.username,
    auth_uuid: input.uuid,
    auth_access_token: input.accessToken,
    version_name: input.versionId,
    version_type: input.versionType,
    game_directory: input.gameDir,
    assets_root: input.assetsDir,
    assets_index_name: input.assetIndex,
    user_type: 'msa',
    natives_directory: input.nativesDir,
    launcher_name: BRAND.name,
    launcher_version: '1.0.0',
    classpath: input.classpath ?? '',
  };
}

export interface LaunchHandle extends EventEmitter {
  pid: number;
  kill: () => void;
  ready: Promise<void>;
}

export interface LaunchInput {
  version: VanillaVersion;
  javaPath: string;
  gameDir: string;
  assetsDir: string;
  nativesDir: string;
  clientJar: string;
  user: User;
  memory: number;
  /** If set, append --quickPlayMultiplayer so MC joins this server directly. */
  quickPlayServer?: string;
  width?: number;
  height?: number;
  fullscreen?: boolean;
  /** Full path to authlib-injector.jar — if set, prepended as -javaagent before heap flags. */
  authlibJarPath?: string;
  /** Bundled premain agent that takes ownership of .game.lock inside the JVM. */
  lockAgentJarPath: string;
  /** Electron userData path shared with Tauri's lock helper and the Java agent. */
  profileDir: string;
}

const LOCK_READY_LINE = 'NATUX_LOCK_READY_V1';
const LOCK_READY_TIMEOUT_MS = 30_000;

export class MinecraftService {
  constructor(
    private readonly spawnProcess: typeof spawn = spawn,
    private readonly readinessTimeoutMs = LOCK_READY_TIMEOUT_MS,
  ) {}

  async launch(input: LaunchInput, beforeSpawn: () => Promise<void>): Promise<LaunchHandle> {
    // SECURITY: this builder takes only memory + manifest-derived JVM args. It deliberately
    // does NOT accept settings.jvmArgs / settings.javaPath from the renderer (arbitrary JVM
    // flags / arbitrary binary). If those are ever wired in, tokenize + validate them first.
    const os = platformOsName();
    const libPaths = resolveLibraryPaths(input.version.libraries, os);
    const classpath = buildClasspath(libPaths, input.clientJar, process.platform);

    const values = buildGameValues({
      username: input.user.username,
      uuid: input.user.uuid.replace(/-/g, ''),
      accessToken: input.user.accessToken,
      versionId: input.version.id,
      versionType: input.version.type ?? 'release',
      gameDir: input.gameDir,
      assetsDir: input.assetsDir,
      assetIndex: input.version.assetIndex.id,
      nativesDir: input.nativesDir,
      classpath,
    });

    const memory = Math.max(512, Math.min(65536, Math.floor(Number(input.memory) || 4096)));
    const jvmArgs = [
      // Acquire .game.lock before Minecraft classes or manifest-provided agents can run.
      `-javaagent:${input.lockAgentJarPath}`,
      // Keep authlib-injector immediately after our lock agent so it patches auth before game classes.
      ...(input.authlibJarPath ? [`-javaagent:${input.authlibJarPath}=${BRAND_URLS.yggdrasil}`] : []),
      `-Xmx${memory}M`,
      `-Xms${Math.min(memory, 1024)}M`,
      `-Djava.library.path=${input.nativesDir}`,
      `-Dminecraft.launcher.brand=NATUX_WORLD`,
      `-Dminecraft.launcher.version=1.0.0`,
      ...resolveJvmArguments(input.version, values as unknown as Record<string, string>),
      '-cp',
      classpath,
      input.version.mainClass,
    ];

    const gameArgs = resolveGameArguments(input.version, values as unknown as Record<string, string>);
    if (input.quickPlayServer) {
      gameArgs.push('--quickPlayMultiplayer', input.quickPlayServer);
    }
    if (input.fullscreen) {
      gameArgs.push('--fullscreen');
    } else if (input.width && input.height) {
      gameArgs.push('--width', String(input.width), '--height', String(input.height));
    }

    // The full classpath (esp. with Forge) blows past the OS command-line length limit
    // and yields "spawn ENAMETOOLONG". Java 9+ reads args from an @argfile instead.
    const argfile = path.join(input.gameDir, 'launch-args.txt');
    const removeArgfile = () => {
      try { unlinkSync(argfile); } catch { /* already gone */ }
    };
    // A missing or unreadable agent must fail before the launcher hands off .game.lock.
    await access(input.lockAgentJarPath);
    writeFileSync(argfile, MinecraftService.toArgFile([...jvmArgs, ...gameArgs]), 'utf-8');

    // The token-bearing argfile is written under .game.lock; hand off immediately
    // before spawn and remove it if handoff fails.
    try { await beforeSpawn(); }
    catch (error) { removeArgfile(); throw error; }

    // javaw.exe has NO stdout/stderr — a crash would surface only as "exit 1" with no logs.
    // Use java.exe (console hidden via windowsHide) so we can capture and forward output.
    const java = input.javaPath.replace(/javaw\.exe$/i, 'java.exe');

    const env = { ...process.env };
    // Java processes recognized these variables before -javaagent premain. An inherited
    // agent must never run before the lock agent has serialized Minecraft access.
    for (const key of Object.keys(env)) {
      if (['JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS'].includes(key.toUpperCase())) delete env[key];
    }
    env.NATUX_PROFILE_DIR = input.profileDir;
    let proc: ChildProcess;
    try {
      proc = this.spawnProcess(java, [`@${argfile}`], {
        cwd: input.gameDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        windowsHide: true,
      });
    } catch (error) {
      removeArgfile();
      throw error;
    }

    // The argfile contains the LIVE game access token — it must not linger on
    // disk. Delete shortly after spawn (once the JVM has read it) and again on
    // exit/error for crash paths.
    const graceTimer = setTimeout(removeArgfile, 10_000);
    graceTimer.unref?.();
    proc.once('exit', () => { clearTimeout(graceTimer); removeArgfile(); });
    proc.once('error', () => { clearTimeout(graceTimer); removeArgfile(); });

    return MinecraftService.wrapProcess(proc, this.readinessTimeoutMs);
  }

  /**
   * Serialize args into a Java @argfile. Each arg is double-quoted; backslashes and
   * quotes are escaped, because Java treats `\` as an escape char inside argfiles.
   */
  static toArgFile(args: string[]): string {
    return args
      .map((a) =>
        // Args are joined with \n, so a value containing a newline (or \r/\0) would split
        // into extra argfile tokens — i.e. arbitrary injected JVM/game args. Strip all
        // control characters before quoting so one logical arg stays one token.
        // eslint-disable-next-line no-control-regex -- stripping control chars is the point
        `"${a.replace(/[\x00-\x1f\x7f]/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
      )
      .join('\n');
  }

  private static wrapProcess(proc: ChildProcess, readinessTimeoutMs: number): LaunchHandle {
    const handle = new EventEmitter() as LaunchHandle;
    handle.pid = proc.pid ?? -1;
    handle.kill = () => proc.kill();
    handle.on('error', () => undefined);

    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    let ready = false;
    let settled = false;
    let pending = '';
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    handle.ready = readyPromise;
    const failBeforeReady = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(readyTimer);
      rejectReady(error);
    };
    const readyTimer = setTimeout(() => {
      const error = new Error('Java не подтвердил получение блокировки игры (тайм-аут)');
      failBeforeReady(error);
      proc.kill();
    }, readinessTimeoutMs);
    readyTimer.unref?.();

    const emitStdoutLine = (raw: string) => {
      const line = raw.replace(/\r$/, '');
      if (!ready && line === LOCK_READY_LINE) {
        ready = true;
        settled = true;
        clearTimeout(readyTimer);
        resolveReady();
        return;
      }
      if (line) handle.emit('log', { stream: 'stdout', line });
    };

    proc.stdout?.setEncoding('utf-8');
    proc.stderr?.setEncoding('utf-8');
    proc.stdout?.on('data', (chunk: string) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) emitStdoutLine(line);
    });
    proc.stderr?.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) if (line) handle.emit('log', { stream: 'stderr', line });
    });
    proc.on('exit', (code, signal) => {
      if (pending) emitStdoutLine(pending);
      if (!ready) failBeforeReady(new Error(`Java завершилась до получения блокировки (код ${code ?? 'unknown'})`));
      handle.emit('exit', { code, signal });
    });
    proc.on('error', (err) => {
      failBeforeReady(new Error(`Не удалось запустить Java: ${err.message}`));
      handle.emit('error', err);
    });

    return handle;
  }
}
