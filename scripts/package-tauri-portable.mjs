import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function packageTauriPortable(root = repositoryRoot) {
  if (process.platform !== 'win32') throw new Error('Portable distribution currently supports Windows x64 only.');
  if (process.arch !== 'x64') throw new Error('Build the portable distribution on Windows x64.');
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(metadata.version)) throw new Error('Invalid portable package version.');
  const executable = path.join(root, 'src/native/target/release/natux-world-launcher-native.exe');
  const agent = path.join(root, 'build/lock-runtime/natux-lock-agent.jar');
  for (const input of [executable, agent]) {
    if (!(await stat(input)).isFile() || (await stat(input)).size === 0) throw new Error('Missing portable runtime input.');
  }
  const output = path.join(root, 'release/tauri');
  await mkdir(output, { recursive: true });
  const staging = await mkdtemp(path.join(output, 'portable-stage-'));
  const archive = path.join(output, `NatuxWorld-${metadata.version}-x64-portable.zip`);
  try {
    await mkdir(path.join(staging, 'natux-lock'));
    await copyFile(executable, path.join(staging, 'natux-world-launcher-native.exe'));
    await copyFile(agent, path.join(staging, 'natux-lock/natux-lock-agent.jar'));
    await copyFile(path.join(repositoryRoot, 'scripts/start-tauri-portable.ps1'), path.join(staging, 'start-portable.ps1'));
    await copyFile(path.join(repositoryRoot, 'scripts/start-tauri-portable.cmd'), path.join(staging, 'Start NATUX WORLD.cmd'));
    await writeFile(path.join(staging, 'natux-portable.json'), `${JSON.stringify({ schemaVersion: 1, profileDirectory: 'profile' })}\n`);
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      path.join(repositoryRoot, 'scripts/package-tauri-portable.ps1'),
      '-SourceDirectory', staging, '-OutputFile', archive], { windowsHide: true, encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Portable ZIP packaging failed.');
    return archive;
  } finally {
    const absolute = path.resolve(staging);
    if (path.dirname(absolute) === path.resolve(output)) await rm(absolute, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`Portable archive: ${await packageTauriPortable()}\n`);
}
