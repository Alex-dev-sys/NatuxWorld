import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { URL } from 'node:url';

export interface DownloadJob {
  url: string;
  dest: string;
  sha1?: string;
  size?: number;
}

export type DownloadProgressCb = (bytesDone: number, bytesTotal: number, currentFile: string) => void;

const MAX_REDIRECTS = 5;
const MAX_RETRIES = 3;

export async function sha1OfFile(filePath: string): Promise<string> {
  const hash = createHash('sha1');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

export async function runWithConcurrency<T>(
  items: T[],
  maxConcurrent: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let index = 0;
  let firstError: unknown = null;
  const max = Math.max(1, maxConcurrent);

  const runners = Array.from({ length: Math.min(max, items.length) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      try {
        await worker(items[current], current);
      } catch (err) {
        if (!firstError) firstError = err;
        // continue draining queue; first error rethrown at the end
      }
    }
  });

  await Promise.all(runners);
  if (firstError) throw firstError;
}

export class DownloadService {
  constructor(private readonly maxConcurrent: number = 8) {}

  async downloadMany(jobs: DownloadJob[], onProgress: DownloadProgressCb): Promise<void> {
    const totalBytes = jobs.reduce((acc, j) => acc + (j.size ?? 0), 0);
    let doneBytes = 0;

    await runWithConcurrency(jobs, this.maxConcurrent, async (job) => {
      const reportedBytes = await this.downloadOne(job);
      doneBytes += reportedBytes;
      onProgress(doneBytes, totalBytes, job.dest);
    });
  }

  private async downloadOne(job: DownloadJob): Promise<number> {
    if (job.sha1 && existsSync(job.dest)) {
      const existing = await sha1OfFile(job.dest);
      if (existing === job.sha1.toLowerCase()) return job.size ?? 0;
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        const written = await this.fetchToFile(job);
        return written;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
        }
      }
    }
    throw lastError ?? new Error(`Download failed: ${job.url}`);
  }

  private async fetchToFile(job: DownloadJob): Promise<number> {
    await fsp.mkdir(path.dirname(job.dest), { recursive: true });
    const tmp = `${job.dest}.tmp`;
    const hash = createHash('sha1');
    let received = 0;

    await new Promise<void>((resolve, reject) => {
      const tryGet = (rawUrl: string, redirects = 0) => {
        if (redirects > MAX_REDIRECTS) return reject(new Error('Too many redirects'));
        const target = new URL(rawUrl);
        const client = target.protocol === 'https:' ? https : http;
        const req = client.get(
          rawUrl,
          { headers: { 'User-Agent': 'NatuxWorldLauncher' } },
          (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              tryGet(new URL(res.headers.location, rawUrl).toString(), redirects + 1);
              res.resume();
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode} for ${rawUrl}`));
              res.resume();
              return;
            }
            res.on('data', (chunk: Buffer) => {
              hash.update(chunk);
              received += chunk.length;
            });
            const out = createWriteStream(tmp);
            pipeline(res, out).then(resolve, reject);
          },
        );
        req.on('error', reject);
      };
      tryGet(job.url);
    });

    if (job.sha1) {
      const got = hash.digest('hex');
      if (got !== job.sha1.toLowerCase()) {
        await fsp.unlink(tmp).catch(() => undefined);
        throw new Error(`SHA1 mismatch for ${job.url}: got ${got}, expected ${job.sha1}`);
      }
    }

    await fsp.rename(tmp, job.dest);
    return received;
  }
}
