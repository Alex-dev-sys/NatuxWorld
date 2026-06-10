import fs from 'node:fs';
import fsp from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { getAssetIndexPath, getAssetsDir, getVersionDir, getVersionJsonPath } from '../utils/paths';

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

export type OsName = 'windows' | 'osx' | 'linux';

export interface Rule {
  action: 'allow' | 'disallow';
  os?: { name?: OsName; arch?: string };
  features?: Record<string, boolean>;
}

export interface DownloadEntry {
  path?: string;
  url: string;
  sha1: string;
  size: number;
}

export interface Library {
  name: string;
  downloads?: {
    artifact?: DownloadEntry;
    classifiers?: Record<string, DownloadEntry>;
  };
  natives?: Partial<Record<OsName, string>>;
  rules?: Rule[];
}

export type ArgEntry = string | { rules: Rule[]; value: string | string[] };

export interface VanillaVersion {
  id: string;
  mainClass: string;
  type: string;
  assetIndex: { id: string; url: string; sha1: string; size: number; totalSize: number };
  libraries: Library[];
  downloads: { client: DownloadEntry; client_mappings?: DownloadEntry };
  arguments?: { game: ArgEntry[]; jvm: ArgEntry[] };
  minecraftArguments?: string;
  javaVersion?: { majorVersion: number; component?: string };
}

export interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
}

export interface ManifestEntry {
  id: string;
  url: string;
  type: string;
  sha1: string;
}

export function platformOsName(platform: NodeJS.Platform = process.platform): OsName {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'osx';
  return 'linux';
}

export function evaluateRules(
  rules: Rule[],
  os: OsName = platformOsName(),
  features: Record<string, boolean> = {},
): boolean {
  let allow = false;
  for (const r of rules) {
    let matches = !r.os || !r.os.name || r.os.name === os;
    // Feature-gated args (--demo, --width/--height, --quickPlay*) must be skipped
    // unless that feature is active — otherwise their empty ${...} values reach the
    // game. Vanilla tolerates empty width/height; Forge's jopt parser throws on "".
    if (matches && r.features) {
      for (const [key, want] of Object.entries(r.features)) {
        if ((features[key] ?? false) !== want) {
          matches = false;
          break;
        }
      }
    }
    if (matches) allow = r.action === 'allow';
  }
  return allow;
}

export function filterByOsRules<T extends { rules?: Rule[] }>(items: T[], os: OsName = platformOsName()): T[] {
  return items.filter((it) => !it.rules || evaluateRules(it.rules, os));
}

export function substitutePlaceholders(input: string, values: Record<string, string>): string {
  return input.replace(/\$\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
}

export function resolveGameArguments(version: VanillaVersion, values: Record<string, string>): string[] {
  if (version.arguments?.game) {
    const out: string[] = [];
    for (const entry of version.arguments.game) {
      if (typeof entry === 'string') {
        out.push(substitutePlaceholders(entry, values));
        continue;
      }
      if (entry.rules && !evaluateRules(entry.rules)) continue;
      const value = Array.isArray(entry.value) ? entry.value : [entry.value];
      for (const v of value) out.push(substitutePlaceholders(v, values));
    }
    return out;
  }
  if (version.minecraftArguments) {
    return version.minecraftArguments.split(/\s+/).map((arg) => substitutePlaceholders(arg, values));
  }
  return [];
}

export function resolveJvmArguments(version: VanillaVersion, values: Record<string, string>): string[] {
  const args = version.arguments?.jvm;
  if (!args) return [];
  const out: string[] = [];
  for (const entry of args) {
    if (typeof entry === 'string') {
      out.push(substitutePlaceholders(entry, values));
      continue;
    }
    if (entry.rules && !evaluateRules(entry.rules)) continue;
    const value = Array.isArray(entry.value) ? entry.value : [entry.value];
    for (const v of value) out.push(substitutePlaceholders(v, values));
  }
  return out;
}

export class MojangService {
  async resolveVersion(id: string): Promise<VanillaVersion> {
    const cachedPath = getVersionJsonPath(id);
    if (fs.existsSync(cachedPath)) {
      const cached = await fsp.readFile(cachedPath, 'utf-8');
      try {
        return JSON.parse(cached) as VanillaVersion;
      } catch {
        // Corrupt cache (truncated/partial write): drop it and re-fetch below.
        await fsp.unlink(cachedPath).catch(() => undefined);
      }
    }

    const manifest = (await this.httpGetJson(MANIFEST_URL)) as { versions: ManifestEntry[] };
    const entry = manifest.versions.find((v) => v.id === id);
    if (!entry) throw new Error(`Version "${id}" not found in Mojang manifest`);

    const version = (await this.httpGetJson(entry.url)) as VanillaVersion;
    await fsp.mkdir(getVersionDir(id), { recursive: true });
    await fsp.writeFile(cachedPath, JSON.stringify(version, null, 2), 'utf-8');
    return version;
  }

  async resolveAssetIndex(version: VanillaVersion): Promise<AssetIndex> {
    const dest = getAssetIndexPath(version.assetIndex.id);
    if (fs.existsSync(dest)) {
      const cached = await fsp.readFile(dest, 'utf-8');
      return JSON.parse(cached) as AssetIndex;
    }
    const index = (await this.httpGetJson(version.assetIndex.url)) as AssetIndex;
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.mkdir(getAssetsDir(), { recursive: true });
    await fsp.writeFile(dest, JSON.stringify(index, null, 2), 'utf-8');
    return index;
  }

  private httpGetJson(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const tryGet = (u: string, redirects = 0) => {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        https
          .get(u, { headers: { 'User-Agent': 'NatuxWorldLauncher' } }, (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              tryGet(new URL(res.headers.location, u).toString(), redirects + 1);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode} for ${u}`));
              res.resume();
              return;
            }
            let body = '';
            res.setEncoding('utf-8');
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                resolve(JSON.parse(body));
              } catch (err) {
                reject(err);
              }
            });
          })
          .on('error', reject);
      };
      tryGet(url);
    });
  }
}
