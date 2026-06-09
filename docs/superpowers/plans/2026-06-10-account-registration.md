# Account Registration & Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vibestudy.ru-backed account system (register + email verify + login) that gates the launcher; the account username becomes the Minecraft offline nick.

**Architecture:** New `AccountService` (main) owns HTTPS calls to `https://vibestudy.ru/api/auth/*` and persists a token in `account.json`. A new `useAccountStore` drives an `AuthGate` (Login/Register/VerifyEmail) rendered by `App` until authenticated. On login the launcher also writes the offline MC identity via the existing `AuthService`.

**Tech Stack:** TypeScript strict, Electron 33, React 19, Zustand, Vitest, `node:https`, `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-06-10-account-registration-design.md`

**Commit convention:** No `Co-Authored-By` trailer (per `CLAUDE.md`). Push to `main` after each commit.

---

## File map

| File | Status | Tasks |
|------|--------|-------|
| `electron/services/AccountService.ts` | **create** | T1, T2 |
| `electron/services/__tests__/AccountService.test.ts` | **create** | T1, T2 |
| `src/lib/validators.ts` | **create** | T3 |
| `src/lib/__tests__/validators.test.ts` | **create** | T3 |
| `electron/ipc/channels.ts` | modify | T4 |
| `electron/ipc/handlers.ts` | modify | T4 |
| `electron/preload.ts` | modify | T4 |
| `src/types/electron.d.ts` | modify | T4 |
| `src/services/electron-bridge.ts` | modify | T4 |
| `src/store/useAccountStore.ts` | **create** | T5 |
| `src/components/auth/AuthGate.tsx` | **create** | T6 |
| `src/components/auth/LoginScreen.tsx` | **create** | T6 |
| `src/components/auth/RegisterScreen.tsx` | **create** | T6 |
| `src/components/auth/VerifyEmailScreen.tsx` | **create** | T6 |
| `src/App.tsx` | modify | T7 |
| `src/store/useLauncherStore.ts` | modify | T7 |
| `src/components/ProfileMenu.tsx` | modify | T7 |

---

## Task 1: AccountService — token storage + request helper

**Files:**
- Create: `electron/services/AccountService.ts`
- Create: `electron/services/__tests__/AccountService.test.ts`

- [ ] **Step 1: Write failing test for token persistence**

Create `electron/services/__tests__/AccountService.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run AccountService`
Expected: FAIL — cannot find `../AccountService`.

- [ ] **Step 3: Implement the storage layer**

Create `electron/services/AccountService.ts`:

```ts
import { app } from 'electron';
import fsp from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

export interface AccountUser {
  id: string;
  username: string;
  email: string;
}

export interface StoredSession {
  token: string;
  user: AccountUser;
}

export interface ApiError {
  code: string;
  message: string;
}

export class AccountApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

export class AccountService {
  private readonly base = 'https://vibestudy.ru/api/auth';
  private readonly file = path.join(app.getPath('userData'), 'account.json');

  async loadStored(): Promise<StoredSession | null> {
    try {
      const raw = await fsp.readFile(this.file, 'utf-8');
      const parsed = JSON.parse(raw) as StoredSession;
      return parsed.token && parsed.user ? parsed : null;
    } catch {
      return null;
    }
  }

  async saveStored(session: StoredSession): Promise<void> {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    await fsp.writeFile(this.file, JSON.stringify({ ...session, savedAt: Date.now() }, null, 2), 'utf-8');
  }

  async clearStored(): Promise<void> {
    try {
      await fsp.unlink(this.file);
    } catch {
      /* already gone */
    }
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run AccountService`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/services/AccountService.ts electron/services/__tests__/AccountService.test.ts
git commit -m "feat(account): AccountService token storage in account.json"
git push origin main
```

---

## Task 2: AccountService — HTTP methods + error mapping

**Files:**
- Modify: `electron/services/AccountService.ts`
- Modify: `electron/services/__tests__/AccountService.test.ts`

- [ ] **Step 1: Add failing tests for the request helper + endpoints**

Append to `AccountService.test.ts`:

```ts
import { EventEmitter } from 'node:events';

function mockHttps(status: number, body: unknown) {
  const https = require('node:https');
  vi.spyOn(https, 'request').mockImplementation((_url: string, _opts: unknown, cb: (res: unknown) => void) => {
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
  });
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
```

- [ ] **Step 2: Run, verify new tests fail**

Run: `npx vitest run AccountService`
Expected: FAIL — `login`/`me` not defined.

- [ ] **Step 3: Implement request helper + endpoints**

Add to `AccountService` (inside the class):

```ts
  private request<T>(method: 'GET' | 'POST', endpoint: string, body?: unknown, token?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = `${this.base}${endpoint}`;
      const payload = body ? JSON.stringify(body) : undefined;
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'NatuxWorldLauncher' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload));

      const req = https.request(url, { method, headers, timeout: 6000 }, (res) => {
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          let json: unknown = {};
          try { json = data ? JSON.parse(data) : {}; } catch { /* keep {} */ }
          if (status >= 200 && status < 300) {
            resolve(json as T);
          } else {
            const err = (json as { error?: ApiError }).error;
            reject(new AccountApiError(err?.code ?? 'unknown', err?.message ?? 'Ошибка сервера', status));
          }
        });
      });
      req.on('error', () => reject(new AccountApiError('network', 'Нет связи с сервером', 0)));
      req.on('timeout', () => { req.destroy(); reject(new AccountApiError('timeout', 'Превышено время ожидания', 0)); });
      if (payload) req.write(payload);
      req.end();
    });
  }

  async register(username: string, email: string, password: string): Promise<void> {
    await this.request('POST', '/register', { username, email, password });
  }

  async verifyEmail(email: string, code: string): Promise<StoredSession> {
    return this.request<StoredSession>('POST', '/verify-email', { email, code });
  }

  async resendCode(email: string): Promise<void> {
    await this.request('POST', '/resend-code', { email });
  }

  async login(login: string, password: string): Promise<StoredSession> {
    return this.request<StoredSession>('POST', '/login', { login, password });
  }

  async me(token: string): Promise<AccountUser> {
    const res = await this.request<{ user: AccountUser }>('GET', '/me', undefined, token);
    return res.user;
  }
```

- [ ] **Step 4: Run, verify all pass**

Run: `npx vitest run AccountService`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/services/AccountService.ts electron/services/__tests__/AccountService.test.ts
git commit -m "feat(account): register/verify/login/me HTTP with error mapping"
git push origin main
```

---

## Task 3: Validators

**Files:**
- Create: `src/lib/validators.ts`
- Create: `src/lib/__tests__/validators.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/validators.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isValidUsername, isValidEmail, isValidPassword, isValidCode } from '../validators';

describe('validators', () => {
  it('username 3-16 word chars', () => {
    expect(isValidUsername('Steve')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('has space')).toBe(false);
    expect(isValidUsername('Очень')).toBe(false);
  });
  it('email shape', () => {
    expect(isValidEmail('a@b.ru')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
  });
  it('password >= 8', () => {
    expect(isValidPassword('secret12')).toBe(true);
    expect(isValidPassword('short')).toBe(false);
  });
  it('code is 6 digits', () => {
    expect(isValidCode('123456')).toBe(true);
    expect(isValidCode('12a456')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run validators`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/validators.ts`:

```ts
export function isValidUsername(v: string): boolean {
  return /^[A-Za-z0-9_]{3,16}$/.test(v);
}

export function isValidEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

export function isValidPassword(v: string): boolean {
  return v.length >= 8;
}

export function isValidCode(v: string): boolean {
  return /^\d{6}$/.test(v);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run validators`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/lib/__tests__/validators.test.ts
git commit -m "feat(account): client-side auth validators"
git push origin main
```

---

## Task 4: IPC wiring (channels, handlers, preload, bridge, types)

**Files:**
- Modify: `electron/ipc/channels.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`
- Modify: `src/services/electron-bridge.ts`

- [ ] **Step 1: Add channel constants**

In `electron/ipc/channels.ts`, add an `ACCOUNT` group (match the existing export style in that file):

```ts
export const ACCOUNT = {
  BOOTSTRAP: 'account:bootstrap',
  REGISTER: 'account:register',
  VERIFY: 'account:verify',
  RESEND: 'account:resend',
  LOGIN: 'account:login',
  LOGOUT: 'account:logout',
} as const;
```

- [ ] **Step 2: Register handlers**

In `electron/ipc/handlers.ts`, instantiate the service and add handlers. Add near the other service instances:

```ts
import { AccountService, AccountApiError } from '../services/AccountService';
export const account = new AccountService();
```

Inside `registerIpcHandlers`, add (wrap API errors into a serializable `{ ok, error }`):

```ts
  ipcMain.handle('account:bootstrap', async () => {
    const stored = await account.loadStored();
    if (!stored) return { status: 'guest' as const };
    try {
      const user = await account.me(stored.token);
      await account.saveStored({ token: stored.token, user });
      return { status: 'authed' as const, user };
    } catch {
      await account.clearStored();
      return { status: 'guest' as const };
    }
  });

  const wrap = async (fn: () => Promise<unknown>) => {
    try { return { ok: true as const, data: await fn() }; }
    catch (e) {
      const err = e instanceof AccountApiError ? { code: e.code, message: e.message } : { code: 'unknown', message: 'Ошибка' };
      return { ok: false as const, error: err };
    }
  };

  ipcMain.handle('account:register', (_e, p: { username: string; email: string; password: string }) =>
    wrap(() => account.register(p.username, p.email, p.password)));

  ipcMain.handle('account:verify', (_e, p: { email: string; code: string }) =>
    wrap(async () => {
      const session = await account.verifyEmail(p.email, p.code);
      await account.saveStored(session);
      return session.user;
    }));

  ipcMain.handle('account:resend', (_e, p: { email: string }) => wrap(() => account.resendCode(p.email)));

  ipcMain.handle('account:login', (_e, p: { login: string; password: string }) =>
    wrap(async () => {
      const session = await account.login(p.login, p.password);
      await account.saveStored(session);
      return session.user;
    }));

  ipcMain.handle('account:logout', async () => { await account.clearStored(); return { ok: true as const }; });
```

- [ ] **Step 3: Expose in preload**

In `electron/preload.ts`, add to the `api` object:

```ts
    account: {
      bootstrap: () => ipcRenderer.invoke('account:bootstrap'),
      register: (p: unknown) => ipcRenderer.invoke('account:register', p),
      verify: (p: unknown) => ipcRenderer.invoke('account:verify', p),
      resend: (p: unknown) => ipcRenderer.invoke('account:resend', p),
      login: (p: unknown) => ipcRenderer.invoke('account:login', p),
      logout: () => ipcRenderer.invoke('account:logout'),
    },
```

- [ ] **Step 4: Type the API**

In `src/types/electron.d.ts`, import and add to `NatuxAPI`:

```ts
import type { AccountUser } from '../../electron/services/AccountService';

export type AccountResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export type BootstrapResult = { status: 'guest' } | { status: 'authed'; user: AccountUser };
```

Add to the `NatuxAPI` interface:

```ts
  account: {
    bootstrap: () => Promise<BootstrapResult>;
    register: (p: { username: string; email: string; password: string }) => Promise<AccountResult<void>>;
    verify: (p: { email: string; code: string }) => Promise<AccountResult<AccountUser>>;
    resend: (p: { email: string }) => Promise<AccountResult<void>>;
    login: (p: { login: string; password: string }) => Promise<AccountResult<AccountUser>>;
    logout: () => Promise<{ ok: true }>;
  };
```

- [ ] **Step 5: Add bridge fallback**

In `src/services/electron-bridge.ts`, add to the `fallback` object so browser-dev doesn't crash:

```ts
    account: {
      bootstrap: async () => ({ status: 'guest' as const }),
      register: async () => ({ ok: true as const, data: undefined }),
      verify: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
      resend: async () => ({ ok: true as const, data: undefined }),
      login: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
      logout: async () => ({ ok: true as const }),
    },
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add electron/ipc/channels.ts electron/ipc/handlers.ts electron/preload.ts src/types/electron.d.ts src/services/electron-bridge.ts
git commit -m "feat(account): IPC channels, handlers, preload, bridge, types"
git push origin main
```

---

## Task 5: useAccountStore

**Files:**
- Create: `src/store/useAccountStore.ts`

- [ ] **Step 1: Implement the store**

Create `src/store/useAccountStore.ts`:

```ts
import { create } from 'zustand';
import { bridge } from '../services/electron-bridge';
import type { AccountUser } from '../../electron/services/AccountService';

type Status = 'checking' | 'guest' | 'authed';

interface AccountState {
  status: Status;
  user: AccountUser | null;
  error: string | null;
  pendingEmail: string | null; // email awaiting verification
  bootstrap: () => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  verify: (code: string) => Promise<boolean>;
  resend: () => Promise<void>;
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  status: 'checking',
  user: null,
  error: null,
  pendingEmail: null,

  bootstrap: async () => {
    const res = await bridge.account.bootstrap();
    if (res.status === 'authed') set({ status: 'authed', user: res.user });
    else set({ status: 'guest', user: null });
  },

  register: async (username, email, password) => {
    set({ error: null });
    const res = await bridge.account.register({ username, email, password });
    if (res.ok) { set({ pendingEmail: email }); return true; }
    set({ error: res.error.message });
    return false;
  },

  verify: async (code) => {
    const email = get().pendingEmail;
    if (!email) return false;
    set({ error: null });
    const res = await bridge.account.verify({ email, code });
    if (res.ok) { set({ status: 'authed', user: res.data, pendingEmail: null }); return true; }
    set({ error: res.error.message });
    return false;
  },

  resend: async () => {
    const email = get().pendingEmail;
    if (email) await bridge.account.resend({ email });
  },

  login: async (login, password) => {
    set({ error: null });
    const res = await bridge.account.login({ login, password });
    if (res.ok) { set({ status: 'authed', user: res.data }); return true; }
    if (res.error.code === 'email_unverified') set({ pendingEmail: login.includes('@') ? login : null });
    set({ error: res.error.message });
    return false;
  },

  logout: async () => {
    await bridge.account.logout();
    set({ status: 'guest', user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/store/useAccountStore.ts
git commit -m "feat(account): useAccountStore with bootstrap/register/verify/login/logout"
git push origin main
```

---

## Task 6: Auth screens + AuthGate

**Files:**
- Create: `src/components/auth/LoginScreen.tsx`
- Create: `src/components/auth/RegisterScreen.tsx`
- Create: `src/components/auth/VerifyEmailScreen.tsx`
- Create: `src/components/auth/AuthGate.tsx`

> UI note: match the app aesthetic — `#070707` background, `#FF2B4F` accent, glass panels,
> `font-display` for headings. Reuse Tailwind classes already present in `SettingsModal`/`PlayButton`.

- [ ] **Step 1: LoginScreen**

Create `src/components/auth/LoginScreen.tsx`:

```tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import { useAccountStore } from '../../store/useAccountStore';

export function LoginScreen({ onRegister }: { onRegister: () => void }) {
  const login = useAccountStore((s) => s.login);
  const error = useAccountStore((s) => s.error);
  const [loginField, setLoginField] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const canSubmit = loginField.length >= 3 && password.length >= 8 && !busy;

  const submit = async () => {
    setBusy(true);
    await login(loginField, password);
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-[380px] rounded-2xl glass-strong p-6 shadow-premium">
      <div className="font-display text-3xl tracking-wide">ВХОД</div>
      <div className="mt-5 flex flex-col gap-3">
        <input value={loginField} onChange={(e) => setLoginField(e.target.value)} placeholder="Ник или email"
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль"
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
        {error && <div className="text-xs text-primary">{error}</div>}
        <button disabled={!canSubmit} onClick={submit}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40">
          <LogIn className="h-4 w-4" /> ВОЙТИ
        </button>
        <button onClick={onRegister} className="text-xs text-muted hover:text-white">Нет аккаунта? Регистрация</button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: RegisterScreen**

Create `src/components/auth/RegisterScreen.tsx`:

```tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import { useAccountStore } from '../../store/useAccountStore';
import { isValidUsername, isValidEmail, isValidPassword } from '../../lib/validators';

export function RegisterScreen({ onBack }: { onBack: () => void }) {
  const register = useAccountStore((s) => s.register);
  const error = useAccountStore((s) => s.error);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = isValidUsername(username) && isValidEmail(email) && isValidPassword(password) && password === confirm;

  const submit = async () => {
    setBusy(true);
    await register(username, email, password);
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-[380px] rounded-2xl glass-strong p-6 shadow-premium">
      <div className="font-display text-3xl tracking-wide">РЕГИСТРАЦИЯ</div>
      <div className="mt-5 flex flex-col gap-3">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ник (3-16, A-Z 0-9 _)"
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль (мин. 8)"
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Повторите пароль"
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
        {error && <div className="text-xs text-primary">{error}</div>}
        <button disabled={!valid || busy} onClick={submit}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40">
          <UserPlus className="h-4 w-4" /> СОЗДАТЬ
        </button>
        <button onClick={onBack} className="text-xs text-muted hover:text-white">Уже есть аккаунт? Войти</button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 3: VerifyEmailScreen**

Create `src/components/auth/VerifyEmailScreen.tsx`:

```tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { MailCheck } from 'lucide-react';
import { useAccountStore } from '../../store/useAccountStore';
import { isValidCode } from '../../lib/validators';

export function VerifyEmailScreen() {
  const verify = useAccountStore((s) => s.verify);
  const resend = useAccountStore((s) => s.resend);
  const email = useAccountStore((s) => s.pendingEmail);
  const error = useAccountStore((s) => s.error);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await verify(code);
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-[380px] rounded-2xl glass-strong p-6 shadow-premium">
      <div className="font-display text-3xl tracking-wide">ПОДТВЕРЖДЕНИЕ</div>
      <div className="mt-2 text-xs text-muted">Код отправлен на {email}</div>
      <div className="mt-5 flex flex-col gap-3">
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-значный код"
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
        {error && <div className="text-xs text-primary">{error}</div>}
        <button disabled={!isValidCode(code) || busy} onClick={submit}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40">
          <MailCheck className="h-4 w-4" /> ПОДТВЕРДИТЬ
        </button>
        <button onClick={resend} className="text-xs text-muted hover:text-white">Отправить код повторно</button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: AuthGate**

Create `src/components/auth/AuthGate.tsx`:

```tsx
import { useState } from 'react';
import { useAccountStore } from '../../store/useAccountStore';
import { AppBackdrop } from '../AppBackdrop';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';
import { VerifyEmailScreen } from './VerifyEmailScreen';

export function AuthGate() {
  const pendingEmail = useAccountStore((s) => s.pendingEmail);
  const clearError = useAccountStore((s) => s.clearError);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const go = (m: 'login' | 'register') => { clearError(); setMode(m); };

  return (
    <div className="relative grid h-screen w-screen place-items-center overflow-hidden rounded-2xl bg-bg ring-1 ring-white/[0.04]">
      <AppBackdrop />
      <div className="relative z-10">
        {pendingEmail ? <VerifyEmailScreen /> : mode === 'login'
          ? <LoginScreen onRegister={() => go('register')} />
          : <RegisterScreen onBack={() => go('login')} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/components/auth/
git commit -m "feat(account): Login/Register/VerifyEmail screens + AuthGate"
git push origin main
```

---

## Task 7: Wire gate into App, username into launch, logout into ProfileMenu

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/store/useLauncherStore.ts`
- Modify: `src/components/ProfileMenu.tsx`

- [ ] **Step 1: Gate the app**

In `src/App.tsx`, import the store + gate and branch on status. Add near other imports:

```tsx
import { useAccountStore } from './store/useAccountStore';
import { AuthGate } from './components/auth/AuthGate';
```

Inside `App`, add at the top of the component body:

```tsx
  const accountStatus = useAccountStore((s) => s.status);
  const bootstrap = useAccountStore((s) => s.bootstrap);
```

Add a bootstrap effect (alongside the existing `useEffect`):

```tsx
  useEffect(() => { bootstrap(); }, [bootstrap]);
```

Then, right before the existing `return (`, add the gate branch:

```tsx
  if (accountStatus !== 'authed') {
    return accountStatus === 'checking'
      ? <div className="grid h-screen w-screen place-items-center bg-bg text-muted">Загрузка…</div>
      : <AuthGate />;
  }
```

- [ ] **Step 2: Use account username on launch**

In `src/store/useLauncherStore.ts`, replace the hardcoded username. Add import:

```ts
import { useAccountStore } from './useAccountStore';
```

In `play`, change the `username: 'Player'` line to:

```ts
      username: useAccountStore.getState().user?.username ?? 'Player',
```

- [ ] **Step 3: Logout in ProfileMenu**

In `src/components/ProfileMenu.tsx`, wire the logout action to the account store. Add import:

```tsx
import { useAccountStore } from '../store/useAccountStore';
```

Replace the existing logout handler (the one calling `useAuthStore`'s logout) so it also clears the account session:

```tsx
  const accountLogout = useAccountStore((s) => s.logout);
  // in the logout onClick:
  await accountLogout();
```

Also display the real account username: read `useAccountStore((s) => s.user?.username)` where the menu currently shows the name.

- [ ] **Step 4: Typecheck + manual smoke**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run dev`
Manual: app shows AuthGate (no backend yet → login returns "Нет связи с сервером" — expected until API exists). Verify screen transitions Login↔Register and code screen render.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/store/useLauncherStore.ts src/components/ProfileMenu.tsx
git commit -m "feat(account): gate launcher behind auth, use account nick, wire logout"
git push origin main
```

---

## Task 8: End-to-end verification (manual, after backend API exists)

**No code changes** unless issues found.

- [ ] **Step 1:** With the vibestudy.ru API live, register a new account → receive code email → enter code → lands in launcher.
- [ ] **Step 2:** Restart launcher → goes straight to launcher (token valid via /me).
- [ ] **Step 3:** Logout → AuthGate; account.json removed.
- [ ] **Step 4:** Login wrong password → inline "Неверный логин или пароль".
- [ ] **Step 5:** Press PLAY → game launches with the account username as the MC nick.
- [ ] **Step 6:** Note any contract mismatches; adjust `AccountService` + commit.

---

## Done criteria

- [ ] `npm test` — AccountService + validators pass.
- [ ] `npm run typecheck` — green.
- [ ] `npm run build:web` — green.
- [ ] Manual: gate blocks PLAY until authed; nick flows into launch.
