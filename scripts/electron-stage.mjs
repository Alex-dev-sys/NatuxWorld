import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const electronTools = createRequire(path.join(repositoryRoot, 'electron', 'package.json'));
export const electronOutput = path.join(repositoryRoot, 'build', 'electron-output');
export const electronApp = path.join(repositoryRoot, 'build', 'electron-app');

export function runNode(script, args = [], cwd = repositoryRoot) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(script)} exited with status ${result.status ?? 'unknown'}`);
}

function npmCli() {
  return process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
}

async function removeStagedPath(destination) {
  const resolved = path.resolve(destination);
  if (!resolved.startsWith(`${path.resolve(electronApp)}${path.sep}`)) {
    throw new Error('Refusing to remove a path outside the generated Electron staging directory.');
  }
  await rm(resolved, { recursive: true, force: true });
}

export async function stageElectron({ install = true, compiled = true } = {}) {
  // Every generated path is fixed under build/. No player profile is touched.
  const pkg = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const optional = JSON.parse(await readFile(path.join(repositoryRoot, 'electron', 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(repositoryRoot, 'electron', 'package-lock.json'), 'utf8'));
  const metadata = {
    name: 'natux-world-launcher', version: pkg.version, description: pkg.description,
    type: 'module', private: true, author: pkg.author, license: pkg.license,
    main: 'dist-electron/main.js', dependencies: optional.dependencies,
  };
  lock.name = metadata.name;
  lock.version = metadata.version;
  lock.packages[''] = { ...metadata, devDependencies: optional.devDependencies };
  await mkdir(electronApp, { recursive: true });
  await writeFile(path.join(electronApp, 'package.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(path.join(electronApp, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  if (install) runNode(npmCli(), ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], electronApp);
  for (const relative of ['build/icon.png', 'build/icon.ico', 'build/lock-runtime']) {
    const source = path.join(repositoryRoot, relative);
    await stat(source);
    const destination = path.join(electronApp, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await removeStagedPath(destination);
    await cp(source, destination, { recursive: true });
  }
  if (compiled) {
    for (const name of ['dist', 'dist-electron']) {
      const source = path.join(electronOutput, name);
      await stat(source);
      const destination = path.join(electronApp, name);
      await removeStagedPath(destination);
      await cp(source, destination, { recursive: true });
    }
  }
}
