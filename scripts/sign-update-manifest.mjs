import { createHash, createPrivateKey, sign } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repository = 'Alex-dev-sys/NatuxWorld';
const releaseDir = path.resolve('release');
const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid package version: ${version}`);
}

const privateKeyPem = process.env.UPDATE_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!privateKeyPem) throw new Error('UPDATE_SIGNING_PRIVATE_KEY is required');
const privateKey = createPrivateKey(privateKeyPem);
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Update signing key must be Ed25519');

// electron-builder owns the published filename (including its sanitisation of
// product names), so the signed record must be derived from its latest.yml.
// This prevents a harmless-looking filename difference from blocking a valid
// update, while still binding the exact file and SHA-512 in the signature.
const latestYml = await readFile(path.join(releaseDir, 'latest.yml'), 'utf8');
const latestVersion = latestYml.match(/^version:\s*(\S+)\s*$/m)?.[1];
const artifact = latestYml.match(/^\s*-\s+url:\s*(\S+)\s*$/m)?.[1];
const updaterSha512 = latestYml.match(/^\s+sha512:\s*([A-Za-z0-9+/]+={0,2})\s*$/m)?.[1];
if (latestVersion !== version || !artifact || !/^[^/\\]+\.exe$/i.test(artifact) || !updaterSha512) {
  throw new Error('latest.yml does not contain a valid Windows update entry');
}

const files = await readdir(releaseDir);
if (!files.includes(artifact)) {
  throw new Error(`Update artifact from latest.yml is missing: ${artifact}`);
}
const bytes = await readFile(path.join(releaseDir, artifact));
const actualSha512 = createHash('sha512').update(bytes).digest('base64');
if (actualSha512 !== updaterSha512) {
  throw new Error('Update artifact SHA-512 does not match latest.yml');
}
const manifest = {
  schemaVersion: 1,
  repository,
  version,
  artifact,
  sha512: actualSha512,
};
const rawManifest = JSON.stringify(manifest);
const signature = sign(null, Buffer.from(rawManifest, 'utf8'), privateKey).toString('base64');

await writeFile(path.join(releaseDir, 'natux-update.json'), rawManifest, { encoding: 'utf8', mode: 0o644 });
await writeFile(path.join(releaseDir, 'natux-update.json.sig'), signature, { encoding: 'ascii', mode: 0o644 });
