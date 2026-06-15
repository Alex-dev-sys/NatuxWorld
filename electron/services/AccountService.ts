import { app, safeStorage } from 'electron';
import fsp from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

export interface AccountUser {
  id: string;
  username: string;
  email: string;
  // Populated by /me (and bootstrap). Undefined right after login until refreshed.
  twoFactorEnabled?: boolean;
  twoFactorMethod?: string | null;
}

export interface StoredSession {
  token: string;
  user: AccountUser;
}

export type LoginResult =
  | { kind: 'session'; session: StoredSession }
  | { kind: '2fa'; method: string | null; challenge: string };

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
    // No OS keychain (e.g. Linux without a secret service) → don't persist the token in
    // plaintext at all; the session simply lives until the app closes.
    if (!safeStorage.isEncryptionAvailable()) return;
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const payload = {
      token: safeStorage.encryptString(session.token).toString('base64'),
      user: session.user,
      enc: true,
      savedAt: Date.now(),
    };
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

  // /login returns a full session, OR — when 2FA is on — a challenge to complete via
  // /login/2fa. The handler discriminates on `kind`.
  async login(login: string, password: string): Promise<LoginResult> {
    const res = await this.request<Record<string, unknown>>('POST', '/login', { login, password });
    if (res.twoFactorRequired) {
      return { kind: '2fa', method: (res.method as string) ?? null, challenge: res.challenge as string };
    }
    return { kind: 'session', session: res as unknown as StoredSession };
  }

  // Second step: exchange the challenge + a TOTP / email / backup code for a real session.
  async loginTwoFactor(challenge: string, code: string): Promise<StoredSession> {
    return this.request<StoredSession>('POST', '/login/2fa', { challenge, code });
  }

  // Begin TOTP enrollment — returns the otpauth URI + a QR data-URL to scan in
  // Google Authenticator. The secret is stored server-side as pending until /enable.
  async twoFactorSetup(token: string): Promise<{ otpauthUri: string; qr: string }> {
    return this.request<{ otpauthUri: string; qr: string }>('POST', '/2fa/totp/setup', undefined, token);
  }

  // Confirm the code from the app → 2FA on, returns one-time backup codes.
  async twoFactorEnable(token: string, code: string): Promise<{ ok: boolean; backupCodes: string[] }> {
    return this.request<{ ok: boolean; backupCodes: string[] }>('POST', '/2fa/totp/enable', { code }, token);
  }

  async me(token: string): Promise<AccountUser> {
    const res = await this.request<{ user: AccountUser }>('GET', '/me', undefined, token);
    return res.user;
  }

  // Global logout: bumps tokenVersion server-side → every issued token (all devices /
  // launchers) is invalidated at once. Best-effort; the local token is cleared regardless.
  async logoutGlobal(token: string): Promise<void> {
    await this.request('POST', '/logout', undefined, token);
  }

  async gameSession(token: string): Promise<{ accessToken: string; clientToken: string; uuid: string; username: string }> {
    return this.request<{ accessToken: string; clientToken: string; uuid: string; username: string }>(
      'POST', '/game-session', undefined, token,
    );
  }
}
