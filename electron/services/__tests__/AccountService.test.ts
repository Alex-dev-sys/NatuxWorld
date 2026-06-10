import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/natux-test' },
  safeStorage: {
    isEncryptionAvailable: () => true,
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
});

function mockHttps(status: number, body: unknown) {
  const https = require('node:https');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(https, 'request').mockImplementation(((_url: string, _opts: unknown, cb: (res: any) => void) => {
    const res = new EventEmitter() as EventEmitter & { statusCode: number; setEncoding: () => void };
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
  }) as any);
}

describe('AccountService HTTP', () => {
  it('login returns token+user on 200', async () => {
    mockHttps(200, { token: 'jwt1', user: { id: 'u1', username: 'Steve', email: 'a@b.ru' } });
    const { AccountService } = await import('../AccountService');
    const res = await new AccountService().login('Steve', 'secret123');
    expect(res.token).toBe('jwt1');
    expect(res.user.username).toBe('Steve');
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
});
