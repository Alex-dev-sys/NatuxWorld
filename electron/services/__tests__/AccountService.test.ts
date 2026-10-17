import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import path from 'node:path';

const safeStorageMocks = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(value, 'utf-8')),
  decryptStringAsync: vi.fn(async (ciphertext: Buffer) => ({
    result: ciphertext.toString('utf-8'),
    shouldReEncrypt: false,
  })),
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/natux-test' },
  safeStorage: safeStorageMocks,
}));

const files: Record<string, string> = {};
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async (p: string) => {
      if (files[p] === undefined) throw new Error('ENOENT');
      return files[p];
    }),
    writeFile: vi.fn(async (p: string, data: string) => { files[p] = data; }),
    unlink: vi.fn(async (p: string) => { delete files[p]; }),
    mkdir: vi.fn(async () => undefined),
  },
}));

beforeEach(() => {
  for (const k of Object.keys(files)) delete files[k];
  vi.clearAllMocks();
  safeStorageMocks.isEncryptionAvailable.mockReturnValue(true);
  safeStorageMocks.encryptString.mockImplementation((value) => Buffer.from(value, 'utf-8'));
  safeStorageMocks.decryptStringAsync.mockImplementation(async (ciphertext) => ({
    result: ciphertext.toString('utf-8'),
    shouldReEncrypt: false,
  }));
});

function mockHttps(status: number, body: unknown) {
  let requestBody = '';
  type MockResponse = EventEmitter & {
    statusCode: number;
    complete: boolean;
    destroyed: boolean;
    destroy: () => MockResponse;
  };
  vi.spyOn(https, 'request').mockImplementation(((_url: string | URL, _opts: unknown) => {
    const res = new EventEmitter() as MockResponse;
    res.statusCode = status;
    res.complete = false;
    res.destroyed = false;
    res.destroy = () => { res.destroyed = true; return res; };
    const req = new EventEmitter() as EventEmitter & { write: (chunk: string) => void; end: () => void; destroy: () => void };
    req.write = (chunk: string) => { requestBody += chunk; };
    req.destroy = () => undefined;
    req.end = () => {
      setTimeout(() => {
        req.emit('response', res);
        setTimeout(() => {
          res.emit('data', Buffer.from(JSON.stringify(body)));
          res.complete = true;
          res.emit('end');
        }, 0);
      }, 0);
    };
    return req;
  }) as unknown as typeof https.request);
  return { requestBody: () => requestBody };
}

describe('AccountService HTTP', () => {
  it('login returns a session on 200', async () => {
    mockHttps(200, { token: 'jwt1', user: { id: 'u1', username: 'Steve', email: 'a@b.ru' } });
    const { AccountService } = await import('../AccountService');
    const res = await new AccountService().login('Steve', 'secret123');
    expect(res.kind).toBe('session');
    if (res.kind === 'session') {
      expect(res.session.token).toBe('jwt1');
      expect(res.session.user.username).toBe('Steve');
    }
  });

  it('login returns a 2fa challenge when twoFactorRequired', async () => {
    mockHttps(200, { twoFactorRequired: true, method: 'totp', challenge: 'ch1' });
    const { AccountService } = await import('../AccountService');
    const res = await new AccountService().login('Steve', 'secret123');
    expect(res.kind).toBe('2fa');
    if (res.kind === '2fa') expect(res.challenge).toBe('ch1');
  });

  it('login throws AccountApiError on 401', async () => {
    mockHttps(401, { error: { code: 'bad_credentials', message: 'Неверный логин или пароль' } });
    const { AccountService, AccountApiError } = await import('../AccountService');
    await expect(new AccountService().login('Steve', 'wrong')).rejects.toBeInstanceOf(AccountApiError);
  });

  it('me returns user on 200', async () => {
    mockHttps(200, { user: { id: 'u1', username: 'Steve', email: 'a@b.ru' } });
    const { AccountService } = await import('../AccountService');
    const user = await new AccountService().me('jwt1');
    expect(user.username).toBe('Steve');
  });

  it('sends the current factor code when repeating TOTP setup', async () => {
    const request = mockHttps(200, { otpauthUri: 'otpauth://totp/Steve', qr: 'data:image/png;base64,qr' });
    const { AccountService } = await import('../AccountService');
    await new AccountService().twoFactorSetup('jwt1', '654321');
    expect(request.requestBody()).toBe('{"code":"654321"}');
  });
});

describe('AccountService token storage', () => {
  it('returns null session when no token file', async () => {
    const { AccountService } = await import('../AccountService');
    const svc = new AccountService();
    expect(await svc.loadStored()).toBeNull();
  });

  it('persists and reads back a stored session', async () => {
    const { AccountService } = await import('../AccountService');
    const svc = new AccountService();
    await svc.saveStored({ token: 't1', user: { id: 'u1', username: 'Steve', email: 'a@b.ru' } });
    const stored = await new AccountService().loadStored();
    expect(stored?.token).toBe('t1');
    expect(stored?.user.username).toBe('Steve');
    expect(safeStorageMocks.decryptStringAsync).toHaveBeenCalledTimes(1);
  });

  it('retries async decryption when Electron reports a key rotation', async () => {
    safeStorageMocks.decryptStringAsync
      .mockResolvedValueOnce({ result: 'old-key-result', shouldReEncrypt: true })
      .mockResolvedValueOnce({ result: 'current-key-result', shouldReEncrypt: false });
    const { AccountService } = await import('../AccountService');
    const svc = new AccountService();
    const accountFile = path.join('/tmp/natux-test', 'account.json');
    files[accountFile] = JSON.stringify({
      token: Buffer.from('encrypted-token', 'utf-8').toString('base64'),
      user: { id: 'u1', username: 'Steve', email: 'a@b.ru' },
      enc: true,
    });

    const stored = await svc.loadStored();

    expect(stored?.token).toBe('current-key-result');
    expect(safeStorageMocks.decryptStringAsync).toHaveBeenCalledTimes(2);
  });

  it('clears the stored session', async () => {
    const { AccountService } = await import('../AccountService');
    const svc = new AccountService();
    await svc.saveStored({ token: 't1', user: { id: 'u1', username: 'Steve', email: 'a@b.ru' } });
    await svc.clearStored();
    expect(await svc.loadStored()).toBeNull();
  });

  it('keeps the session in memory when the OS keychain is unavailable', async () => {
    safeStorageMocks.isEncryptionAvailable.mockReturnValue(false);
    const { AccountService } = await import('../AccountService');
    const svc = new AccountService();
    await svc.saveStored({ token: 'memory-token', user: { id: 'u1', username: 'Steve', email: 'a@b.ru' } });
    expect((await svc.loadStored())?.token).toBe('memory-token');
    expect(Object.keys(files)).toHaveLength(0);
  });

  it('rejects and removes a legacy plaintext token file', async () => {
    const { AccountService } = await import('../AccountService');
    const svc = new AccountService();
    const accountFile = path.join('/tmp/natux-test', 'account.json');
    files[accountFile] = JSON.stringify({
      token: 'plaintext', user: { id: 'u1', username: 'Steve', email: 'a@b.ru' }, enc: false,
    });
    expect(await svc.loadStored()).toBeNull();
    expect(files[accountFile]).toBeUndefined();
  });
});
