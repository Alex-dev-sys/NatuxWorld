import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { javaToolchain } from './java-toolchain.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = path.join(repositoryRoot, 'build');
const stagePrefix = path.join(buildRoot, 'lock-runtime-stage-');
const runtimeDirectory = path.join(buildRoot, 'lock-runtime');
const windows = process.platform === 'win32';
const executableName = `lock-helper${windows ? '.exe' : ''}`;

await mkdir(buildRoot, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
  }
}

async function collectJavaSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaSources(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.java')) files.push(fullPath);
  }
  return files.sort();
}

const staging = await mkdtemp(stagePrefix);
try {
  const classes = path.join(staging, 'classes');
  await mkdir(classes, { recursive: true });
  const agentSources = await collectJavaSources(
    path.join(repositoryRoot, 'src', 'lock-agent', 'src', 'main', 'java'),
  );
  if (agentSources.length === 0) throw new Error('No lock-agent Java sources were found.');
  const jdk = javaToolchain();

  const manifest = path.join(staging, 'MANIFEST.MF');
  const jar = path.join(staging, 'natux-lock-agent.jar');
  await writeFile(manifest, 'Manifest-Version: 1.0\nPremain-Class: com.natuxworld.lockagent.NatuxLockAgent\n\n', 'ascii');
  run(jdk.javac, ['--release', '8', '-d', classes, ...agentSources]);
  run(jdk.jar, ['cfm', jar, manifest, '-C', classes, '.']);

  const targetDirectory = path.join(buildRoot, 'lock-rust-target');
  run('cargo', [
    'build', '--locked', '--release',
    '--manifest-path', path.join(repositoryRoot, 'src', 'profile-lock-core', 'Cargo.toml'),
    '--bin', 'lock-helper',
  ], { env: { ...process.env, CARGO_TARGET_DIR: targetDirectory } });

  const rustHelper = path.join(targetDirectory, 'release', executableName);
  const helperStat = await stat(rustHelper);
  if (!helperStat.isFile() || helperStat.size === 0) {
    throw new Error(`Built lock helper is empty or missing: ${rustHelper}`);
  }

  await mkdir(runtimeDirectory, { recursive: true });
  const packagedHelper = path.join(runtimeDirectory, executableName);
  await cp(rustHelper, packagedHelper);
  if (!windows) await chmod(packagedHelper, 0o755);
  await cp(jar, path.join(runtimeDirectory, 'natux-lock-agent.jar'));
  const jarContents = await readFile(path.join(runtimeDirectory, 'natux-lock-agent.jar'));
  if (jarContents.length < 128) throw new Error('Built lock-agent JAR is unexpectedly small.');
  process.stdout.write(`Prepared ${os.platform()} lock runtime in ${runtimeDirectory}\n`);
} finally {
  // Only remove the unique temporary directory created above, never the shared build folder.
  const resolvedStage = path.resolve(staging);
  if (resolvedStage.startsWith(`${path.resolve(buildRoot)}${path.sep}`)) {
    await rm(resolvedStage, { recursive: true, force: true });
  }
}
