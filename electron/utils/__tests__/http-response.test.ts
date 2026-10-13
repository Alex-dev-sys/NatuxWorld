import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { readHttpResponse, waitForHttpResponse } from '../http-response';

const servers: http.Server[] = [];

async function startServer(handler: http.RequestListener): Promise<http.Server & { port: number }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server address');
  return Object.assign(server, { port: address.port });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

describe('HTTP response reader', () => {
  it('rejects a truncated body when the server closes after sending headers', async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200, { 'content-length': '100' });
      response.write('partial');
      setTimeout(() => response.destroy(), 10);
    });
    const request = http.request(`http://127.0.0.1:${server.port}/truncated`);
    const pending = waitForHttpResponse(request, 1000, 'deadline', (response) => readHttpResponse(response));
    request.end();

    await expect(pending).rejects.toThrow(/aborted|closed|ended/i);
  });

  it('enforces a total deadline even if the server leaves the request open', async () => {
    const server = await startServer(() => undefined);
    const request = http.request(`http://127.0.0.1:${server.port}/silent`);
    const startedAt = Date.now();
    const pending = waitForHttpResponse(request, 30, 'total deadline', (response) => readHttpResponse(response));
    request.end();

    await expect(pending).rejects.toThrow('total deadline');
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});
