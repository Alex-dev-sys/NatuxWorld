import { createHash } from 'node:crypto';
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

    // This document supplies the sha1 of every later artifact, so verify it against the
    // manifest's pinned sha1 before trusting/caching. Hash the served bytes (re-serializing
    // would change them), then parse those same bytes.
    const body = await this.httpGetText(entry.url);
    if (entry.sha1) {
      const got = createHash('sha1').update(body).digest('hex');
      if (got !== entry.sha1.toLowerCase()) {
        throw new Error(`Version JSON sha1 mismatch for "${id}": got ${got}, expected ${entry.sha1}`);
      }
    }
    const version = JSON.parse(body) as VanillaVersion;
    await fsp.mkdir(getVersionDir(id), { recursive: true });
    await fsp.writeFile(cachedPath, body, 'utf-8');
    return version;
  }

  async resolveAssetIndex(version: VanillaVersion): Promise<AssetIndex> {
    const dest = getAssetIndexPath(version.assetIndex.id);
    if (fs.existsSync(dest)) {
      const cached = await fsp.readFile(dest, 'utf-8');
      try {
        return JSON.parse(cached) as AssetIndex;
      } catch {
        // Corrupt cache (truncated/partial write): drop it and re-fetch below.
        await fsp.unlink(dest).catch(() => undefined);
      }
    }
    // The asset index supplies the hash of every asset object, so verify it against the
    // sha1 pinned in the (already verified) version JSON before trusting/caching.
    const body = await this.httpGetText(version.assetIndex.url);
    if (version.assetIndex.sha1) {
      const got = createHash('sha1').update(body).digest('hex');
      if (got !== version.assetIndex.sha1.toLowerCase()) {
        throw new Error(
          `Asset index sha1 mismatch for "${version.assetIndex.id}": got ${got}, expected ${version.assetIndex.sha1}`,
        );
      }
    }
    const index = JSON.parse(body) as AssetIndex;
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.mkdir(getAssetsDir(), { recursive: true });
    await fsp.writeFile(dest, body, 'utf-8');
    return index;
  }

  private async httpGetJson(url: string): Promise<unknown> {
    return JSON.parse(await this.httpGetText(url));
  }

  /** GET with retries — transient resets (ECONNRESET) are routine on flaky networks. */
  private async httpGetText(url: string, attempts = 3): Promise<string> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await this.httpGetTextOnce(url);
      } catch (err) {
        lastError = err;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2 ** i * 500));
      }
    }
    throw lastError;
  }

  /** GET a URL and return the raw response body. https-only; refuses non-https redirects. */
  private httpGetTextOnce(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const tryGet = (u: string, redirects = 0) => {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        if (new URL(u).protocol !== 'https:') {
          return reject(new Error(`Refusing non-https URL: ${u}`));
        }
        https
          .get(u, { headers: { 'User-Agent': 'NatuxWorldLauncher' } }, (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              tryGet(new URL(res.headers.location, u).toString(), redirects + 1);
              res.resume();
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
            res.on('end', () => resolve(body));
          })
          .on('error', reject);
      };
      tryGet(url);
    });
  }
}
