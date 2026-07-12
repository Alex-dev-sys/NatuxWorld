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

const expected = `NATUX WORLD-Setup-${version}-x64.exe`;
const files = await readdir(releaseDir);
const artifacts = files.filter((name) => name === expected);
if (artifacts.length !== 1) {
  throw new Error(`Expected exactly one Windows update artifact named ${expected}`);
}

const artifact = artifacts[0];
const bytes = await readFile(path.join(releaseDir, artifact));
const manifest = {
  schemaVersion: 1,
  repository,
  version,
  artifact,
  sha512: createHash('sha512').update(bytes).digest('base64'),
};
const rawManifest = JSON.stringify(manifest);
const signature = sign(null, Buffer.from(rawManifest, 'utf8'), privateKey).toString('base64');

await writeFile(path.join(releaseDir, 'natux-update.json'), rawManifest, { encoding: 'utf8', mode: 0o644 });
await writeFile(path.join(releaseDir, 'natux-update.json.sig'), signature, { encoding: 'ascii', mode: 0o644 });
