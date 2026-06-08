import { describe, expect, it, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DownloadService, runWithConcurrency, sha1OfFile } from '../DownloadService';

function startServer(handler: http.RequestListener): Promise<http.Server & { port: number }> {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') (srv as http.Server & { port: number }).port = addr.port;
      resolve(srv as http.Server & { port: number });
    });
  });
}

const tmpRoot = path.join(os.tmpdir(), `natux-dl-test-${process.pid}`);
afterAll(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
});

describe('runWithConcurrency', () => {
  it('caps parallel jobs at maxConcurrent', async () => {
    let running = 0;
    let peak = 0;
    const jobs = Array.from({ length: 20 }, (_, i) => i);
    await runWithConcurrency(jobs, 4, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 10));
      running -= 1;
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('completes all jobs even on partial failure', async () => {
    const jobs = [1, 2, 3, 4];
    const done: number[] = [];
    await expect(
      runWithConcurrency(jobs, 2, async (n) => {
        if (n === 2) throw new Error('boom');
        done.push(n);
      }),
    ).rejects.toThrow('boom');
    // 1 should have completed; 3/4 may or may not have started depending on timing.
    expect(done).toContain(1);
  });
});

describe('sha1OfFile', () => {
  it('computes correct SHA-1 of "hello"', async () => {
    await fsp.mkdir(tmpRoot, { recursive: true });
    const p = path.join(tmpRoot, 'hello.txt');
    await fsp.writeFile(p, 'hello');
    expect(await sha1OfFile(p)).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
  });
});

describe('DownloadService.downloadMany (real local HTTP)', () => {
  it('downloads a file end-to-end and verifies SHA-1', async () => {
    const payload = Buffer.from('the quick brown fox jumps over the lazy dog', 'utf-8');
    const sha1 = createHash('sha1').update(payload).digest('hex');
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': String(payload.length) });
      res.end(payload);
    });

    try {
      await fsp.mkdir(tmpRoot, { recursive: true });
      const dest = path.join(tmpRoot, 'fox.txt');
      const svc = new DownloadService(2);
      await svc.downloadMany(
        [{ url: `http://127.0.0.1:${server.port}/fox`, dest, sha1, size: payload.length }],
        () => undefined,
      );
      expect(fs.readFileSync(dest, 'utf-8')).toBe(payload.toString('utf-8'));
    } finally {
      server.close();
    }
  });

  it('skips download when local file already matches sha1', async () => {
    const payload = Buffer.from('cached', 'utf-8');
    const sha1 = createHash('sha1').update(payload).digest('hex');
    let hits = 0;
    const server = await startServer((_req, res) => {
      hits += 1;
      res.writeHead(200);
      res.end(payload);
    });

    try {
      await fsp.mkdir(tmpRoot, { recursive: true });
      const dest = path.join(tmpRoot, 'cached.txt');
      await fsp.writeFile(dest, payload);
      const svc = new DownloadService(1);
      await svc.downloadMany(
        [{ url: `http://127.0.0.1:${server.port}/cached`, dest, sha1, size: payload.length }],
        () => undefined,
      );
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  });

  it('rejects on SHA-1 mismatch', async () => {
    const payload = Buffer.from('wrong', 'utf-8');
    const server = await startServer((_req, res) => {
      res.writeHead(200);
      res.end(payload);
    });

    try {
      await fsp.mkdir(tmpRoot, { recursive: true });
      const dest = path.join(tmpRoot, 'mismatch.txt');
      const svc = new DownloadService(1);
      await expect(
        svc.downloadMany(
          [
            {
              url: `http://127.0.0.1:${server.port}/mismatch`,
              dest,
              sha1: '0000000000000000000000000000000000000000',
              size: payload.length,
            },
          ],
          () => undefined,
        ),
      ).rejects.toThrow(/sha1 mismatch/i);
    } finally {
      server.close();
    }
  });
});
