import { app, safeStorage } from 'electron';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { BRAND_URLS } from '../../brand.config';
import { readHttpResponse, waitForHttpResponse } from '../utils/http-response';

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
  private readonly base = BRAND_URLS.authApi;
  private volatileSession: StoredSession | null = null;

  async loadStored(): Promise<StoredSession | null> {
    if (this.volatileSession) return this.volatileSession;
    try {
      const raw = await fsp.readFile(this.file, 'utf-8');
      const parsed = JSON.parse(raw) as StoredSession & { enc?: boolean };
      if (!parsed.token || !parsed.user) return null;
      if (parsed.enc) {
        try {
          // Newer Electron versions can read the synchronous format written by
          // existing installs through the async API, including key rotation.
          const ciphertext = Buffer.from(parsed.token, 'base64');
          let decrypted = await safeStorage.decryptStringAsync(ciphertext);
          for (let attempt = 0; decrypted.shouldReEncrypt && attempt < 2; attempt += 1) {
            decrypted = await safeStorage.decryptStringAsync(ciphertext);
          }
          return { token: decrypted.result, user: parsed.user };
        } catch {
          // Corrupt/undecryptable token (e.g. OS keychain changed): force re-login.
          return null;
        }
      }
      // Versions before safeStorage hardening could leave a plaintext token.
      // Never keep accepting that legacy format indefinitely: remove it and
      // require one fresh login so the replacement is encrypted.
      await fsp.unlink(this.file).catch(() => undefined);
      return null;
    } catch {
      return null;
    }
  }

  async saveStored(session: StoredSession): Promise<void> {
    // No OS keychain (e.g. Linux without a secret service) → don't persist the token in
    // plaintext at all; the session simply lives until the app closes.
    this.volatileSession = session;
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
    this.volatileSession = null;
    try {
      await fsp.unlink(this.file);
    } catch {
      /* already gone */
    }
  }

  private request<T>(method: 'GET' | 'POST', endpoint: string, body?: unknown, token?: string): Promise<T> {
    const url = `${this.base}${endpoint}`;
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'http:' ? http : https;
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'NatuxWorldLauncher' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload));

    const timeoutMessage = 'Account request timed out';
    const req = transport.request(parsedUrl, { method, headers });
    const response = waitForHttpResponse(req, 6000, timeoutMessage, async (res) => {
      const data = (await readHttpResponse(res, 2 * 1024 * 1024)).toString('utf-8');
      const status = res.statusCode ?? 0;
      let json: unknown = {};
      try { json = data ? JSON.parse(data) : {}; } catch { /* keep {} */ }
      if (status >= 200 && status < 300) return json as T;
      const err = (json as { error?: ApiError }).error;
      throw new AccountApiError(err?.code ?? 'unknown', err?.message ?? 'Ошибка сервера', status);
    });
    if (payload) req.write(payload);
    req.end();

    return response.catch((error: unknown) => {
      if (error instanceof AccountApiError) throw error;
      if (error instanceof Error && error.message === timeoutMessage) {
        throw new AccountApiError('timeout', 'Превышено время ожидания', 0);
      }
      throw new AccountApiError('network', 'Нет связи с сервером', 0);
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
  async twoFactorSetup(token: string, code?: string): Promise<{ otpauthUri: string; qr: string }> {
    return this.request<{ otpauthUri: string; qr: string }>(
      'POST', '/2fa/totp/setup', code === undefined ? undefined : { code }, token,
    );
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
