import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import {
  filterByOsRules,
  platformOsName,
  type AssetIndex,
  type Library,
  type VanillaVersion,
} from './MojangService';
import type { DownloadJob } from './DownloadService';
import { getAssetObjectPath, getLibrariesDir, getNativesDir } from '../utils/paths';

export const ASSET_BASE_URL = 'https://resources.download.minecraft.net';

export function buildLibraryJobs(libs: Library[]): DownloadJob[] {
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

export function buildAssetJobs(index: AssetIndex): DownloadJob[] {
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

export async function extractNatives(version: VanillaVersion): Promise<void> {
  const os = platformOsName();
  const nativesDir = getNativesDir(version.id);
  await fsp.mkdir(nativesDir, { recursive: true });

  const nativeLibs = selectNativeLibs(version.libraries, os, process.arch);

  for (const lib of nativeLibs) {
    const artifactPath = lib.downloads?.artifact?.path;
    if (!artifactPath) continue;
    const jar = path.join(getLibrariesDir(), ...artifactPath.split('/'));
    if (!fs.existsSync(jar)) continue;
    await extractNonClassEntries(jar, nativesDir);
  }
}

/**
 * Pick the native jars matching BOTH the current OS and CPU arch. Mojang's rules
 * carry only os.name (no arch), so `org.lwjgl:lwjgl:3.3.3:natives-macos` (x64) and
 * `...:natives-macos-arm64` both pass rule filtering on any Mac. Their dylib/dll file
 * names collide when flattened into the natives dir, so extracting both means the
 * wrong-arch binary can win and the game dies on load (Apple Silicon hit this).
 * Base names are x64; `-arm64` / `-x86` suffixes are the other arches; an unsuffixed
 * variant (e.g. freetype's `natives-macos-patch`) is kept on arm64 only when no
 * `-arm64` twin exists.
 */
export function selectNativeLibs(libraries: Library[], os: ReturnType<typeof platformOsName>, arch: string): Library[] {
  const token = os === 'osx' ? 'macos' : os;
  const candidates = filterByOsRules(libraries, os).filter(
    (lib) => lib.name.includes(`:natives-${token}`) || lib.name.includes(`:natives-${os}`),
  );
  const names = new Set(candidates.map((l) => l.name));
  return candidates.filter((lib) => {
    const isArm64 = lib.name.endsWith('-arm64');
    const isX86 = lib.name.endsWith('-x86');
    if (arch === 'arm64') {
      if (isArm64) return true;
      if (isX86) return false;
      return !names.has(`${lib.name}-arm64`);
    }
    return !isArm64 && !isX86;
  });
}

function extractNonClassEntries(jar: string, destDir: string): Promise<void> {
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

