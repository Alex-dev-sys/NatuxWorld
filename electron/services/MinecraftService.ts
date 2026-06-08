import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
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
    launcher_name: 'NATUX WORLD',
    launcher_version: '1.0.0',
    classpath: input.classpath ?? '',
  };
}

export interface LaunchHandle extends EventEmitter {
  pid: number;
  kill: () => void;
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
}

export class MinecraftService {
  launch(input: LaunchInput): LaunchHandle {
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

    const jvmArgs = [
      `-Xmx${input.memory}M`,
      `-Xms${Math.min(input.memory, 1024)}M`,
      `-Djava.library.path=${input.nativesDir}`,
      `-Dminecraft.launcher.brand=NATUX_WORLD`,
      `-Dminecraft.launcher.version=1.0.0`,
      ...resolveJvmArguments(input.version, values as unknown as Record<string, string>),
      '-cp',
      classpath,
      input.version.mainClass,
    ];

    const gameArgs = resolveGameArguments(input.version, values as unknown as Record<string, string>);

    const proc = spawn(input.javaPath, [...jvmArgs, ...gameArgs], {
      cwd: input.gameDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      windowsHide: false,
    });

    return MinecraftService.wrapProcess(proc);
  }

  private static wrapProcess(proc: ChildProcess): LaunchHandle {
    const handle = new EventEmitter() as LaunchHandle;
    handle.pid = proc.pid ?? -1;
    handle.kill = () => proc.kill();

    proc.stdout?.setEncoding('utf-8');
    proc.stderr?.setEncoding('utf-8');
    proc.stdout?.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) if (line) handle.emit('log', { stream: 'stdout', line });
    });
    proc.stderr?.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) if (line) handle.emit('log', { stream: 'stderr', line });
    });
    proc.on('exit', (code, signal) => handle.emit('exit', { code, signal }));
    proc.on('error', (err) => handle.emit('error', err));

    return handle;
  }
}
