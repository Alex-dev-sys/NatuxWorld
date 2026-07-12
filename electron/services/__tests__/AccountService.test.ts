import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import https from 'node:https';

const encryptionAvailable = vi.hoisted(() => vi.fn(() => true));
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/natux-test' },
  safeStorage: {
    isEncryptionAvailable: encryptionAvailable,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
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
  encryptionAvailable.mockReturnValue(true);
});

function mockHttps(status: number, body: unknown) {
  type MockResponse = EventEmitter & { statusCode: number; setEncoding: () => void };
  vi.spyOn(https, 'request').mockImplementation(((_url: string, _opts: unknown, cb: (res: MockResponse) => void) => {
    const res = new EventEmitter() as MockResponse;
    res.statusCode = status;
    res.setEncoding = () => undefined;
    const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void };
    req.write = () => undefined;
    req.end = () => {
      cb(res);
      res.emit('data', JSON.stringify(body));
      res.emit('end');
    };
    return req;
  }) as unknown as typeof https.request);
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
    const stored = await svc.loadStored();
    expect(stored?.token).toBe('t1');
    expect(stored?.user.username).toBe('Steve');
  });

  it('clears the stored session', async () => {
    const { AccountService } = await import('../AccountService');
    const svc = new AccountService();
    await svc.saveStored({ token: 't1', user: { id: 'u1', username: 'Steve', email: 'a@b.ru' } });
    await svc.clearStored();
    expect(await svc.loadStored()).toBeNull();
  });

  it('keeps the session in memory when the OS keychain is unavailable', async () => {
    encryptionAvailable.mockReturnValue(false);
    const { AccountService } = await import('../AccountService');
    const svc = new AccountService();
    await svc.saveStored({ token: 'memory-token', user: { id: 'u1', username: 'Steve', email: 'a@b.ru' } });
    expect((await svc.loadStored())?.token).toBe('memory-token');
    expect(Object.keys(files)).toHaveLength(0);
  });

  it('rejects and removes a legacy plaintext token file', async () => {
    const { AccountService } = await import('../AccountService');
    const svc = new AccountService();
    files['/tmp/natux-test/account.json'] = JSON.stringify({
      token: 'plaintext', user: { id: 'u1', username: 'Steve', email: 'a@b.ru' }, enc: false,
    });
    expect(await svc.loadStored()).toBeNull();
    expect(files['/tmp/natux-test/account.json']).toBeUndefined();
  });
});
