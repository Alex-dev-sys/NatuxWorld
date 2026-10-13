import type { ClientRequest, IncomingMessage } from 'node:http';

const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/**
 * Read a response body and reject if the peer ends it before IncomingMessage
 * reports a complete response. Node emits `aborted`/`close` for this case; it
 * does not guarantee an `end` event or a ClientRequest timeout.
 */
export function readHttpResponse(
  response: IncomingMessage,
  maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
      // Do not keep reading an oversized or otherwise failed response.
      if (!response.destroyed) response.destroy();
    };

    response.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        fail(new Error(`HTTP response exceeded ${maxBytes} bytes`));
        return;
      }
      chunks.push(buffer);
    });
    response.on('aborted', () => fail(new Error('HTTP response was aborted')));
    response.on('error', (error) => fail(error));
    response.on('close', () => {
      if (!response.complete) fail(new Error('HTTP response closed before completion'));
    });
    response.on('end', () => {
      if (!response.complete) {
        fail(new Error('HTTP response ended before completion'));
        return;
      }
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, size));
    });
  });
}

/**
 * Wait for a response while enforcing a wall-clock deadline across connection,
 * headers, and body. Socket idle timeouts alone do not bound total request time.
 */
export function waitForHttpResponse<T>(
  request: ClientRequest,
  timeoutMs: number,
  timeoutMessage: string,
  consume: (response: IncomingMessage) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: (value: T) => void, value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.removeListener('response', onResponse);
      callback(value);
    };
    const finishError = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.removeListener('response', onResponse);
      reject(error);
    };
    const onError = (error: Error) => finishError(error);
    const onResponse = (response: IncomingMessage) => {
      Promise.resolve()
        .then(() => consume(response))
        .then((value) => finish(resolve, value), finishError);
    };
    const timer = setTimeout(() => {
      finishError(new Error(timeoutMessage));
      // Destroy without an error argument; the deadline error has already been
      // delivered, and emitting a second request error could be unhandled.
      request.destroy();
    }, timeoutMs);

    request.once('error', onError);
    request.once('response', onResponse);
  });
}
