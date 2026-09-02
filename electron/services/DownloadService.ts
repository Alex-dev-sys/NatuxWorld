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
const MIN_RESUME_BYTES = 64 * 1024; // don't bother resuming tiny stubs

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

  async downloadMany(jobs: DownloadJob[], onProgress: DownloadProgressCb, signal?: AbortSignal): Promise<void> {
    const totalBytes = jobs.reduce((acc, j) => acc + (j.size ?? 0), 0);
    let doneBytes = 0;

    await runWithConcurrency(jobs, this.maxConcurrent, async (job) => {
      if (signal?.aborted) throw new Error('Отменено пользователем');
      const reportedBytes = await this.downloadOne(job, signal);
      doneBytes += reportedBytes;
      onProgress(doneBytes, totalBytes, job.dest);
    });
  }

  private async downloadOne(job: DownloadJob, signal?: AbortSignal): Promise<number> {
    if (job.sha1 && existsSync(job.dest)) {
      const existing = await sha1OfFile(job.dest);
      if (existing === job.sha1.toLowerCase()) return job.size ?? 0;
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      if (signal?.aborted) throw new Error('Отменено пользователем');
      try {
        const written = await this.fetchToFile(job, signal);
        return written;
      } catch (err) {
        if (signal?.aborted) throw new Error('Отменено пользователем');
        lastError = err;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
        }
      }
    }
    throw lastError ?? new Error(`Download failed: ${job.url}`);
  }

  private async fetchToFile(job: DownloadJob, signal?: AbortSignal): Promise<number> {
    await fsp.mkdir(path.dirname(job.dest), { recursive: true });
    const tmp = `${job.dest}.tmp`;
    let resumeFrom = 0;
    // A partial .tmp from a previous attempt/connection drop can be resumed if the
    // server supports ranges (HTTP 206). Integrity is still enforced afterwards:
    // the full file is re-hashed (sha1) and size-checked before it lands at dest.
    try {
      const st = await fsp.stat(tmp);
      if (st.isFile() && st.size >= MIN_RESUME_BYTES && (!job.size || st.size < job.size)) {
        resumeFrom = st.size;
      }
    } catch {
      // no tmp yet — normal first download
    }

    const hash = createHash('sha1');
    let received = 0;
    let resumed = false;

    try {
      // Whether the very first request was https. Used to forbid a redirect from
      // downgrading the transport (https->http MITM), which would void TLS protection.
      const originSecure = new URL(job.url).protocol === 'https:';
      await new Promise<void>((resolve, reject) => {
        const tryGet = (rawUrl: string, redirects = 0) => {
          if (redirects > MAX_REDIRECTS) return reject(new Error('Too many redirects'));
          const target = new URL(rawUrl);
          // Only http/https are ever valid here; reject file:, data:, etc.
          if (target.protocol !== 'https:' && target.protocol !== 'http:') {
            return reject(new Error(`Refusing non-http(s) URL: ${target.protocol}`));
          }
          // Never follow a redirect that downgrades https -> http.
          if (originSecure && target.protocol === 'http:') {
            return reject(new Error(`Refusing protocol downgrade to http: ${rawUrl}`));
          }
          const client = target.protocol === 'https:' ? https : http;
          const headers: Record<string, string> = { 'User-Agent': 'NatuxWorldLauncher' };
          if (resumeFrom > 0) headers.Range = `bytes=${resumeFrom}-`;
          const req = client.get(
            rawUrl,
            // signal: in-flight request is destroyed immediately when the user cancels,
            // instead of the cancel waiting for the whole stage to finish downloading.
            { headers, signal },
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
              if (resumeFrom > 0) {
                if (res.statusCode === 206) {
                  // Server honoured the range — append to the partial file.
                  resumed = true;
                  received = resumeFrom;
                } else if (res.statusCode === 200) {
                  // Range unsupported — start over with a clean file.
                  resumeFrom = 0;
                } else {
                  reject(new Error(`HTTP ${res.statusCode} for ${rawUrl}`));
                  res.resume();
                  return;
                }
              } else if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${rawUrl}`));
                res.resume();
                return;
              }
              res.on('data', (chunk: Buffer) => {
                hash.update(chunk);
                received += chunk.length;
              });
              const out = createWriteStream(tmp, { flags: resumed ? 'a' : 'w' });
              pipeline(res, out).then(resolve, reject);
            },
          );
          req.on('error', reject);
        };
        tryGet(job.url);
      });

      // Catch truncated downloads (dropped connection) even when no sha1 is provided.
      if (job.size && received !== job.size) {
        throw new Error(`Size mismatch for ${job.url}: got ${received}, expected ${job.size}`);
      }

      if (job.sha1) {
        // Re-hash the COMPLETE file (covers both fresh and resumed downloads —
        // the incremental hash above only saw the tail on resume).
        const fullHash = createHash('sha1');
        await pipeline(createReadStream(tmp), fullHash);
        const got = fullHash.digest('hex');
        if (got !== job.sha1.toLowerCase()) {
          throw new Error(`SHA1 mismatch for ${job.url}: got ${got}, expected ${job.sha1}`);
        }
      }

      await fsp.rename(tmp, job.dest);
      return received;
    } catch (err) {
      // Integrity failures (hash/size mismatch) must delete the partial file — it is
      // provably corrupt. Network errors keep it: the next retry (or next launch)
      // resumes from where the connection dropped.
      const integrityFailure = err instanceof Error && /SHA1 mismatch|Size mismatch/.test(err.message);
      if (integrityFailure) {
        await fsp.unlink(tmp).catch(() => undefined);
      }
      throw err;
    }
  }
}
