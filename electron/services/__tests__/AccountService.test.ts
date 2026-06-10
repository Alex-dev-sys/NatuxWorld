import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/natux-test' } }));

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
