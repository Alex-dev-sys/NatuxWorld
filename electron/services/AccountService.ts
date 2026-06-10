import { app, safeStorage } from 'electron';
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
  private readonly file = path.join(app.getPath('userData'), 'account.json');
  private readonly base = 'https://vibestudy.ru/api/auth';

  async loadStored(): Promise<StoredSession | null> {
    try {
      const raw = await fsp.readFile(this.file, 'utf-8');
      const parsed = JSON.parse(raw) as StoredSession & { enc?: boolean };
      if (!parsed.token || !parsed.user) return null;
      if (parsed.enc) {
        try {
          const token = safeStorage.decryptString(Buffer.from(parsed.token, 'base64'));
          return { token, user: parsed.user };
        } catch {
          // Corrupt/undecryptable token (e.g. OS keychain changed): force re-login.
          return null;
        }
      }
      return { token: parsed.token, user: parsed.user };
    } catch {
      return null;
    }
  }

  async saveStored(session: StoredSession): Promise<void> {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const savedAt = Date.now();
    let payload: Record<string, unknown>;
    if (safeStorage.isEncryptionAvailable()) {
      payload = {
        token: safeStorage.encryptString(session.token).toString('base64'),
        user: session.user,
        enc: true,
        savedAt,
      };
    } else {
      payload = { token: session.token, user: session.user, enc: false, savedAt };
    }
    await fsp.writeFile(this.file, JSON.stringify(payload, null, 2), 'utf-8');
  }

  async clearStored(): Promise<void> {
    try {
      await fsp.unlink(this.file);
    } catch {
      /* already gone */
    }
  }

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
        res.on('data', (c: string) => (data += c));
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
}
