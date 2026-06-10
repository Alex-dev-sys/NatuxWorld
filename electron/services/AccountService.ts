import { app } from 'electron';
import fsp from 'node:fs/promises';
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
