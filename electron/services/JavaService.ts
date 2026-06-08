import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fsp from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { getJrePath, getRuntimeDir } from '../utils/paths';

export interface JavaInstallation {
  version: string;
  vendor: 'Temurin' | 'system';
  path: string;
}

interface AdoptiumAsset {
  binaries: Array<{
    package: { link: string; checksum: string; name: string };
  }>;
  version_data?: { semver: string };
}

export class JavaService extends EventEmitter {
  static adoptiumUrl(os: string, arch: string, major: number): string {
    return `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
  }

  static adoptiumAssetUrl(os: string, arch: string, major: number): string {
    return (
      `https://api.adoptium.net/v3/assets/feature_releases/${major}/ga?` +
      `architecture=${arch}&image_type=jre&jvm_impl=hotspot&os=${os}` +
      `&page_size=1&project=jdk&vendor=eclipse`
    );
  }

  static parseVersion(versionOutput: string): string | null {
    const m = versionOutput.match(/version "([^"]+)"/);
    return m ? m[1] : null;
  }

  static isJava21Plus(versionOutput: string): boolean {
    const ver = JavaService.parseVersion(versionOutput);
    if (!ver) return false;
    const major = Number(ver.split('.')[0]);
    return Number.isFinite(major) && major >= 21;
  }

  static platformOs(platform: NodeJS.Platform): string {
    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'mac';
    return 'linux';
  }

  static platformArch(arch: string): string {
    if (arch === 'arm64') return 'aarch64';
    return arch;
  }

  async detect(): Promise<JavaInstallation | null> {
    const managed = getJrePath();
    try {
      await fsp.access(managed);
      return { version: '21', vendor: 'Temurin', path: managed };
    } catch {
      // fall through
    }

    return new Promise((resolve) => {
      const proc = spawn('java', ['-version']);
      let out = '';
      proc.stderr.on('data', (d) => (out += d.toString()));
      proc.on('close', () => {
        if (!JavaService.isJava21Plus(out)) {
          resolve(null);
          return;
        }
        const version = JavaService.parseVersion(out) ?? 'unknown';
        resolve({ version, vendor: 'system', path: 'java' });
      });
      proc.on('error', () => resolve(null));
    });
  }

  async install(): Promise<JavaInstallation> {
    const os = JavaService.platformOs(process.platform);
    const arch = JavaService.platformArch(process.arch);

    this.emit('progress', { progress: 0, message: 'Запрос метаданных Java...' });
    const asset = await this.fetchAssetMetadata(os, arch);
    const pkg = asset.binaries[0]?.package;
    if (!pkg) throw new Error('Adoptium: no JRE binary returned');

    const runtimeDir = getRuntimeDir();
    await fsp.mkdir(runtimeDir, { recursive: true });
    const archivePath = path.join(runtimeDir, pkg.name);

    this.emit('progress', { progress: 5, message: 'Загрузка JRE 21...' });
    await this.downloadVerified(pkg.link, archivePath, pkg.checksum);

    this.emit('progress', { progress: 90, message: 'Распаковка JRE...' });
    await this.extractZip(archivePath, runtimeDir);
    await this.normalizeRuntimeDir(runtimeDir);
    await fsp.unlink(archivePath).catch(() => undefined);

    if (process.platform !== 'win32') {
      await fsp.chmod(getJrePath(), 0o755).catch(() => undefined);
    }

    this.emit('progress', { progress: 100, message: 'Java установлена' });
    const version = asset.version_data?.semver ?? '21';
    return { version, vendor: 'Temurin', path: getJrePath() };
  }

  private fetchAssetMetadata(os: string, arch: string): Promise<AdoptiumAsset> {
    const url = JavaService.adoptiumAssetUrl(os, arch, 21);
    return new Promise((resolve, reject) => {
      this.httpGetJson(url)
        .then((json) => {
          if (!Array.isArray(json) || json.length === 0) {
            reject(new Error('Adoptium: empty asset list'));
            return;
          }
          resolve(json[0] as AdoptiumAsset);
        })
        .catch(reject);
    });
  }

  private httpGetJson(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      https
        .get(url, { headers: { 'User-Agent': 'NatuxWorldLauncher' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            this.httpGetJson(new URL(res.headers.location, url).toString()).then(resolve, reject);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
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
    });
  }

  private async downloadVerified(url: string, dest: string, expectedSha256: string): Promise<void> {
    const tmp = `${dest}.tmp`;
    const hash = createHash('sha256');
    let downloaded = 0;
    let total = 0;

    await new Promise<void>((resolve, reject) => {
      const tryGet = (u: string, redirects = 0) => {
        if (redirects > 5) {
          reject(new Error('Too many redirects'));
          return;
        }
        https
          .get(u, { headers: { 'User-Agent': 'NatuxWorldLauncher' } }, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              tryGet(new URL(res.headers.location, u).toString(), redirects + 1);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode} for ${u}`));
              res.resume();
              return;
            }
            total = Number(res.headers['content-length'] ?? 0);
            const out = createWriteStream(tmp);
            res.on('data', (chunk) => {
              hash.update(chunk);
              downloaded += chunk.length;
              if (total > 0) {
                const pct = 5 + Math.round((downloaded / total) * 80);
                this.emit('progress', {
                  progress: Math.min(pct, 85),
                  message: `Загрузка JRE 21... ${Math.round((downloaded / total) * 100)}%`,
                });
              }
            });
            pipeline(res, out).then(resolve, reject);
          })
          .on('error', reject);
      };
      tryGet(url);
    });

    const got = hash.digest('hex');
    if (got !== expectedSha256.toLowerCase()) {
      await fsp.unlink(tmp).catch(() => undefined);
      throw new Error(`JRE SHA-256 mismatch: got ${got}, expected ${expectedSha256}`);
    }
    await fsp.rename(tmp, dest);
  }

  private extractZip(archive: string, destDir: string): Promise<void> {
    const root = path.resolve(destDir);
    return new Promise((resolve, reject) => {
      yauzl.open(archive, { lazyEntries: true }, (err, zip) => {
        if (err || !zip) return reject(err ?? new Error('zip open failed'));
        zip.readEntry();
        zip.on('entry', (entry) => {
          if (entry.fileName.includes('\0') || (process.platform !== 'win32' && entry.fileName.includes('\\'))) {
            return reject(new Error(`Unsafe zip entry: ${entry.fileName}`));
          }
          const resolved = path.resolve(root, entry.fileName);
          const rel = path.relative(root, resolved);
          if (rel.startsWith('..') || path.isAbsolute(rel)) {
            return reject(new Error(`Unsafe zip entry escapes destination: ${entry.fileName}`));
          }
          if (/\/$/.test(entry.fileName)) {
            fsp.mkdir(resolved, { recursive: true }).then(() => zip.readEntry()).catch(reject);
            return;
          }
          fsp.mkdir(path.dirname(resolved), { recursive: true }).then(() => {
            zip.openReadStream(entry, (e, stream) => {
              if (e || !stream) return reject(e ?? new Error('zip read stream failed'));
              const out = createWriteStream(resolved);
              stream.pipe(out);
              out.on('finish', () => zip.readEntry());
              out.on('error', reject);
            });
          }).catch(reject);
        });
        zip.on('end', () => resolve());
        zip.on('error', reject);
      });
    });
  }

  private async normalizeRuntimeDir(runtimeDir: string): Promise<void> {
    const entries = await fsp.readdir(runtimeDir, { withFileTypes: true });
    const jdkLike = entries.find((e) => e.isDirectory() && /^jdk-?21/i.test(e.name));
    if (jdkLike) {
      const target = path.join(runtimeDir, 'jre-21');
      try {
        await fsp.rm(target, { recursive: true, force: true });
      } catch {
        /* ok */
      }
      await fsp.rename(path.join(runtimeDir, jdkLike.name), target);
    }
  }
}
