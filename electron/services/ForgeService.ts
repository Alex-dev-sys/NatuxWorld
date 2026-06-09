import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DownloadService } from './DownloadService';
import type { ArgEntry, Library, VanillaVersion } from './MojangService';
import {
  getForgeDir,
  getMinecraftDir,
  getVersionDir,
  getVersionJsonPath,
} from '../utils/paths';
import type { LaunchProgress } from './LauncherService';

/** Forge manifest after merging vanilla inherited data with the Forge version.json. */
export type MergedVersion = VanillaVersion;

interface ForgeVersionJson {
  id: string;
  inheritsFrom?: string;
  type?: string;
  mainClass: string;
  libraries: Library[];
  arguments?: { game: ArgEntry[]; jvm: ArgEntry[] };
}

const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';

/** Pinned, known-good Forge builds per Minecraft version for reproducible installs. */
export const FORGE_VERSIONS: Record<string, string> = {
  '1.21.6': '56.0.4',
  '1.20.1': '47.4.20',
};

/** `group:artifact[:classifier]` — identity for de-duplicating libraries across vanilla+forge. */
function libKey(name: string): string {
  const [group, artifact, , classifier] = name.split(':');
  return classifier ? `${group}:${artifact}:${classifier}` : `${group}:${artifact}`;
}

/**
 * Merge an inheriting Forge version.json onto its vanilla base.
 * Forge libraries win on conflict; arguments are appended after vanilla's;
 * mainClass is overridden; assetIndex/downloads/javaVersion stay from vanilla.
 */
export function mergeVersions(vanilla: VanillaVersion, forge: ForgeVersionJson): MergedVersion {
  const byKey = new Map<string, Library>();
  for (const lib of vanilla.libraries) byKey.set(libKey(lib.name), lib);
  for (const lib of forge.libraries) byKey.set(libKey(lib.name), lib);

  const vanillaArgs = vanilla.arguments ?? { game: [], jvm: [] };
  const forgeArgs = forge.arguments ?? { game: [], jvm: [] };

  return {
    ...vanilla,
    id: forge.id,
    type: forge.type ?? vanilla.type,
    mainClass: forge.mainClass,
    libraries: [...byKey.values()],
    arguments: {
      game: [...vanillaArgs.game, ...forgeArgs.game],
      jvm: [...vanillaArgs.jvm, ...forgeArgs.jvm],
    },
  };
}

export function forgeVersionId(mcVersion: string, build: string): string {
  return `${mcVersion}-forge-${build}`;
}

export function installerUrl(mcVersion: string, build: string): string {
  const v = `${mcVersion}-${build}`;
  return `${FORGE_MAVEN}/${v}/forge-${v}-installer.jar`;
}

/** javaw.exe has no stdout pipe — the headless installer needs java.exe for console output. */
function consoleJava(javaPath: string): string {
  return javaPath.replace(/javaw\.exe$/i, 'java.exe');
}

export class ForgeService extends EventEmitter {
  constructor(private readonly download = new DownloadService(8)) {
    super();
  }

  /**
   * Install Forge for `mcVersion` on top of the already-prepared vanilla files,
   * then return the merged manifest ready for MinecraftService.launch.
   * Uses Forge's own headless installer (`--installClient`) — the sanctioned path
   * from the design spec, far more robust than re-implementing the processor engine.
   */
  async install(
    mcVersion: string,
    javaPath: string,
    vanilla: VanillaVersion,
    onProgress: (p: LaunchProgress) => void,
  ): Promise<MergedVersion> {
    const build = FORGE_VERSIONS[mcVersion];
    if (!build) throw new Error(`Forge не поддерживается для ${mcVersion}`);

    const id = forgeVersionId(mcVersion, build);
    const forgeJsonPath = getVersionJsonPath(id);

    // Cached install — reuse if the merged version json already exists.
    if (!fs.existsSync(forgeJsonPath)) {
      await this.runInstaller(mcVersion, build, javaPath, onProgress);
    } else {
      onProgress({ stage: 'forge-install', progress: 90, message: 'Forge уже установлен' });
    }

    const forge = JSON.parse(await fsp.readFile(forgeJsonPath, 'utf-8')) as ForgeVersionJson;
    onProgress({ stage: 'forge-install', progress: 100, message: 'Forge готов' });
    return mergeVersions(vanilla, forge);
  }

  private async runInstaller(
    mcVersion: string,
    build: string,
    javaPath: string,
    onProgress: (p: LaunchProgress) => void,
  ): Promise<void> {
    const installer = path.join(getForgeDir(mcVersion), `forge-${mcVersion}-${build}-installer.jar`);

    onProgress({ stage: 'forge-install', progress: 0, message: 'Загрузка установщика Forge...' });
    await this.download.downloadMany([{ url: installerUrl(mcVersion, build), dest: installer }], () => undefined);

    // Forge installer refuses to run without a launcher_profiles.json in the target dir.
    const gameDir = getMinecraftDir();
    await fsp.mkdir(gameDir, { recursive: true });
    const profiles = path.join(gameDir, 'launcher_profiles.json');
    if (!fs.existsSync(profiles)) {
      await fsp.writeFile(profiles, JSON.stringify({ profiles: {}, version: 3 }), 'utf-8');
    }
    await fsp.mkdir(getVersionDir(forgeVersionId(mcVersion, build)), { recursive: true });

    onProgress({ stage: 'forge-install', progress: 20, message: 'Установка Forge (процессоры)...' });
    await this.spawnInstaller(consoleJava(javaPath), installer, gameDir, onProgress);
  }

  private spawnInstaller(
    java: string,
    installer: string,
    gameDir: string,
    onProgress: (p: LaunchProgress) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(java, ['-jar', installer, '--installClient', gameDir], {
        cwd: gameDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const tail: string[] = [];
      const onLine = (chunk: Buffer) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
          if (!line.trim()) continue;
          tail.push(line);
          if (tail.length > 20) tail.shift();
          this.emit('log', { stream: 'forge', line });
          onProgress({ stage: 'forge-install', progress: 60, message: 'Установка Forge...', detail: line.slice(0, 80) });
        }
      };
      proc.stdout?.on('data', onLine);
      proc.stderr?.on('data', onLine);
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Установщик Forge завершился с кодом ${code}: ${tail.slice(-3).join(' | ')}`));
      });
    });
  }
}
