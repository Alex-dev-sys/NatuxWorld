import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { javaToolchain } from './java-toolchain.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = path.join(repositoryRoot, 'build');
await mkdir(buildRoot, { recursive: true });
const staging = await mkdtemp(path.join(buildRoot, 'lock-agent-test-'));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
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

try {
  const mainClasses = path.join(staging, 'agent-classes');
  const testClasses = path.join(staging, 'test-classes');
  const jar = path.join(staging, 'natux-lock-agent.jar');
  const manifest = path.join(staging, 'MANIFEST.MF');
  await mkdir(mainClasses, { recursive: true });
  await mkdir(testClasses, { recursive: true });
  const mainSources = await collectJavaSources(path.join(repositoryRoot, 'src', 'lock-agent', 'src', 'main', 'java'));
  const testSources = await collectJavaSources(path.join(repositoryRoot, 'src', 'lock-agent', 'src', 'test', 'java'));
  if (!mainSources.length || !testSources.length) throw new Error('Lock-agent sources or tests are missing.');
  const jdk = javaToolchain();

  await writeFile(manifest, 'Manifest-Version: 1.0\nPremain-Class: com.natuxworld.lockagent.NatuxLockAgent\n\n', 'ascii');
  run(jdk.javac, ['--release', '8', '-d', mainClasses, ...mainSources]);
  run(jdk.jar, ['cfm', jar, manifest, '-C', mainClasses, '.']);
  run(jdk.javac, ['--release', '8', '-cp', mainClasses, '-d', testClasses, ...testSources]);
  const classPath = [testClasses, mainClasses].join(path.delimiter);
  run(jdk.java, [
    '-cp', classPath,
    'com.natuxworld.lockagent.test.LockAgentTestSuite',
    jdk.java,
    jar,
    classPath,
  ]);
} finally {
  const resolvedStage = path.resolve(staging);
  if (resolvedStage.startsWith(`${path.resolve(buildRoot)}${path.sep}`)) {
    await rm(resolvedStage, { recursive: true, force: true });
  }
}
