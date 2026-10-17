import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const icoSignature = Buffer.from([0x00, 0x00, 0x01, 0x00]);
const iconCopies = [
  { source: 'public/icon.png', destination: 'build/icon.png', signature: pngSignature },
  {
    source: 'src/native/icons/icon.ico',
    destination: 'build/icon.ico',
    signature: icoSignature,
  },
];

export async function prepareLauncherIcons(root = repositoryRoot) {
  const validatedCopies = [];

  for (const icon of iconCopies) {
    const sourcePath = path.join(root, icon.source);
    const content = await readFile(sourcePath);
    if (content.length < icon.signature.length || !content.subarray(0, icon.signature.length).equals(icon.signature)) {
      throw new Error(`Invalid launcher icon input: ${icon.source}`);
    }
    validatedCopies.push({ ...icon, content });
  }

  const buildDirectory = path.join(root, 'build');
  await mkdir(buildDirectory, { recursive: true });

  for (const icon of validatedCopies) {
    await writeFile(path.join(root, icon.destination), icon.content);
  }

  return validatedCopies.map(({ source, destination }) => ({ source, destination }));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const copied = await prepareLauncherIcons();
    for (const icon of copied) {
      process.stdout.write(`Prepared ${icon.destination} from ${icon.source}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Failed to prepare launcher icons.'}\n`);
    process.exitCode = 1;
  }
}
