import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { lstat, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'Alex-dev-sys/NatuxWorld';
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MAX_SIGNATURE_BYTES = 4096;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function containsControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function validateInputs({ version, channel, rolloutPct, releaseTag, privateKeyPem, migrationEnabled }) {
  requireString(version, 'VERSION');
  if (!VERSION_RE.test(version)) throw new Error('VERSION must be a valid launcher version');
  if (channel !== 'stable' && channel !== 'beta') throw new Error('CHANNEL must be stable or beta');
  if (typeof rolloutPct !== 'string' || !/^(?:0|[1-9]\d{0,2})$/.test(rolloutPct)) {
    throw new Error('ROLLOUT_PCT must be an integer from 0 to 100');
  }
  const rollout = Number(rolloutPct);
  if (rollout > 100) throw new Error('ROLLOUT_PCT must be an integer from 0 to 100');
  if (typeof migrationEnabled !== 'boolean') throw new Error('TAURI_MIGRATION_ENABLED must be true or false');
  if (releaseTag !== `v${version}`) throw new Error('RELEASE_TAG must match v${VERSION}');
  const pem = requireString(privateKeyPem, 'UPDATE_SIGNING_PRIVATE_KEY').replace(/\\n/g, '\n');
  let key;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new Error('UPDATE_SIGNING_PRIVATE_KEY must be a valid Ed25519 private key');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('UPDATE_SIGNING_PRIVATE_KEY must be an Ed25519 private key');
  }
  return { rollout, migrationEnabled, key };
}

async function validateBuildVersion(version) {
  const [packageJson, tauriConfig] = await Promise.all([
    readFile(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
    readFile(path.join(REPOSITORY_ROOT, 'src', 'native', 'tauri.conf.json'), 'utf8'),
  ]);
  const packageVersion = JSON.parse(packageJson).version;
  const nativeVersion = JSON.parse(tauriConfig).version;
  if (version !== packageVersion || version !== nativeVersion) {
    throw new Error('VERSION must match package.json and src/native/tauri.conf.json');
  }
}

function platformForArtifact(name) {
  const lower = name.toLowerCase();
  const archTokens = [...lower.matchAll(/(?:^|[^a-z0-9])(aarch64|arm64|x86_64|x64|i686|armv7)(?:$|[^a-z0-9])/g)]
    .map((match) => match[1]);

  if (lower.endsWith('.exe') || lower.endsWith('.msi')) {
    if (/(?:^|[^a-z0-9])(?:darwin|macos|linux)(?:$|[^a-z0-9])/.test(lower)) {
      throw new Error(`Windows updater artifact has a conflicting platform name: ${name}`);
    }
    if (archTokens.some((token) => !['x86_64', 'x64'].includes(token))) {
      throw new Error(`Unsupported Windows updater architecture in ${name}`);
    }
    return 'windows-x86_64';
  }

  if (lower.endsWith('.app.tar.gz')) {
    if (/(?:^|[^a-z0-9])(?:windows|linux)(?:$|[^a-z0-9])/.test(lower)) {
      throw new Error(`macOS updater archive has a conflicting platform name: ${name}`);
    }
    const architectures = new Set(archTokens.map((token) => {
      if (token === 'aarch64' || token === 'arm64') return 'aarch64';
      if (token === 'x86_64' || token === 'x64') return 'x86_64';
      return token;
    }));
    if (architectures.size !== 1 || !['x86_64', 'aarch64'].includes([...architectures][0])) {
      throw new Error(`macOS updater archive name must identify x86_64 or aarch64: ${name}`);
    }
    return `darwin-${[...architectures][0]}`;
  }

  if (lower.endsWith('.appimage') || lower.endsWith('.appimage.tar.gz')) {
    throw new Error(`Linux updater archives are not supported by this feed: ${name}`);
  }
  return null;
}

function safeAssetName(name) {
  if (
    name.length > 255 || name === '.' || name === '..' || name.includes('/') || name.includes('\\') ||
    containsControlCharacters(name)
  ) {
    throw new Error(`Unsafe release asset filename: ${JSON.stringify(name)}`);
  }
  return name;
}

function encodeAssetName(name) {
  return encodeURIComponent(name).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function findPlatformAssets(directory, releaseTag) {
  const entries = await readdir(directory, { withFileTypes: true });
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const candidates = entries
    .map((entry) => ({ name: safeAssetName(entry.name), entry, platform: platformForArtifact(entry.name) }))
    .filter((candidate) => candidate.platform)
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (candidates.length === 0) throw new Error('No supported Tauri updater archives found in release/tauri');

  const platforms = {};
  for (const { name, entry, platform } of candidates) {
    if (!entry.isFile()) throw new Error(`Updater archive is not a regular file: ${name}`);
    if (Object.hasOwn(platforms, platform)) {
      throw new Error(`More than one updater archive found for ${platform}`);
    }
    const signatureName = `${name}.sig`;
    const signatureEntry = byName.get(signatureName);
    if (!signatureEntry?.isFile()) throw new Error(`Missing signature sidecar: ${signatureName}`);
    const signaturePath = path.join(directory, signatureName);
    const signatureStat = await lstat(signaturePath).catch(() => null);
    if (!signatureStat?.isFile() || signatureStat.isSymbolicLink()) {
      throw new Error(`Signature sidecar is not a regular file: ${signatureName}`);
    }
    if (signatureStat.size > MAX_SIGNATURE_BYTES) {
      throw new Error(`Signature sidecar is too large: ${signatureName}`);
    }
    let signature;
    try {
      signature = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(signaturePath)).trim();
    } catch {
      throw new Error(`Signature sidecar is not valid UTF-8: ${signatureName}`);
    }
    if (!signature || containsControlCharacters(signature)) {
      throw new Error(`Signature sidecar is empty or malformed: ${signatureName}`);
    }
    const assetUrl = `https://github.com/${REPOSITORY}/releases/download/${releaseTag}/${encodeAssetName(name)}`;
    platforms[platform] = { signature, url: assetUrl };
  }
  return platforms;
}

async function writeAtomically(filename, contents) {
  const temporary = `${filename}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
    await rename(temporary, filename);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export async function generateTauriFeed({
  directory = path.join(REPOSITORY_ROOT, 'release', 'tauri'),
  version,
  channel,
  rolloutPct,
  releaseTag,
  privateKeyPem,
  migrationEnabled = false,
  now = new Date(),
} = {}) {
  const { rollout, migrationEnabled: migration, key } = validateInputs({
    version, channel, rolloutPct, releaseTag, privateKeyPem, migrationEnabled,
  });
  await validateBuildVersion(version);
  const releaseDirectory = path.resolve(directory);
  const directoryStat = await lstat(releaseDirectory).catch(() => null);
  if (!directoryStat?.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('TAURI_RELEASE_DIR must be an existing directory');
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid feed timestamp');

  const platforms = await findPlatformAssets(releaseDirectory, releaseTag);
  const feedUrl = `https://github.com/${REPOSITORY}/releases/download/${releaseTag}/latest.json`;
  const latest = {
    version,
    notes: `NATUX WORLD ${version}`,
    pub_date: now.toISOString(),
    platforms,
  };
  const control = {
    schemaVersion: 1,
    repository: REPOSITORY,
    channel,
    version,
    rolloutPct: rollout,
    feedUrl,
    migrationEnabled: migration,
  };
  const latestJson = `${JSON.stringify(latest, null, 2)}\n`;
  const controlJson = JSON.stringify(control);
  const signature = sign(null, Buffer.from(controlJson, 'utf8'), key).toString('base64');

  await writeAtomically(path.join(releaseDirectory, 'latest.json'), latestJson);
  await writeAtomically(path.join(releaseDirectory, 'natux-tauri-control.json'), controlJson);
  await writeAtomically(path.join(releaseDirectory, 'natux-tauri-control.json.sig'), signature);
  return { latest, control, signature };
}

async function runFromEnvironment() {
  const migrationValue = process.env.TAURI_MIGRATION_ENABLED;
  if (migrationValue !== undefined && !['true', 'false'].includes(migrationValue.toLowerCase())) {
    throw new Error('TAURI_MIGRATION_ENABLED must be true or false');
  }
  const result = await generateTauriFeed({
    directory: process.env.TAURI_RELEASE_DIR || path.join(REPOSITORY_ROOT, 'release', 'tauri'),
    version: process.env.VERSION,
    channel: process.env.CHANNEL,
    rolloutPct: process.env.ROLLOUT_PCT,
    releaseTag: process.env.RELEASE_TAG,
    privateKeyPem: process.env.UPDATE_SIGNING_PRIVATE_KEY,
    migrationEnabled: migrationValue?.toLowerCase() === 'true',
  });
  process.stdout.write(`Generated Tauri updater feed for ${result.control.version}: ${Object.keys(result.latest.platforms).join(', ')}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  runFromEnvironment().catch((error) => {
    process.stderr.write(`Tauri feed generation failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
