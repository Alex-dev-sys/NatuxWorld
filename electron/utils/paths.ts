import { app } from 'electron';
import path from 'node:path';

export function getMinecraftDir(): string {
  return path.join(app.getPath('userData'), 'minecraft');
}

export function getRuntimeDir(): string {
  return path.join(getMinecraftDir(), 'runtime');
}

export function getJrePath(): string {
  // macOS Temurin archives nest the JRE under Contents/Home (.app bundle layout).
  if (process.platform === 'darwin') {
    return path.join(getRuntimeDir(), 'jre-21', 'Contents', 'Home', 'bin', 'java');
  }
  const exe = process.platform === 'win32' ? 'javaw.exe' : 'java';
  return path.join(getRuntimeDir(), 'jre-21', 'bin', exe);
}

export function getVersionsDir(): string {
  return path.join(getMinecraftDir(), 'versions');
}

export function getVersionDir(id: string): string {
  return path.join(getVersionsDir(), id);
}

export function getVersionJsonPath(id: string): string {
  return path.join(getVersionDir(id), `${id}.json`);
}

export function getVersionJarPath(id: string): string {
  return path.join(getVersionDir(id), `${id}.jar`);
}

export function getNativesDir(id: string): string {
  return path.join(getVersionDir(id), 'natives');
}

export function getLibrariesDir(): string {
  return path.join(getMinecraftDir(), 'libraries');
}

export function getLibraryPath(mavenName: string): string {
  const parts = mavenName.split(':');
  const [group, artifact, version] = parts;
  const classifier = parts[3];
  const groupDir = group.replace(/\./g, path.sep);
  const suffix = classifier ? `-${classifier}` : '';
  return path.join(getLibrariesDir(), groupDir, artifact, version, `${artifact}-${version}${suffix}.jar`);
}

export function getAssetsDir(): string {
  return path.join(getMinecraftDir(), 'assets');
}

export function getAssetIndexPath(id: string): string {
  return path.join(getAssetsDir(), 'indexes', `${id}.json`);
}

export function getAssetObjectPath(hash: string): string {
  return path.join(getAssetsDir(), 'objects', hash.slice(0, 2), hash);
}

export function getForgeDir(mcVer: string): string {
  return path.join(getMinecraftDir(), 'forge', mcVer);
}

export function getAuthPath(): string {
  return path.join(getMinecraftDir(), 'auth.json');
}

export function getLogsDir(): string {
  return path.join(app.getPath('userData'), 'logs');
}

export function getCacheDir(): string {
  return path.join(app.getPath('userData'), 'cache');
}
