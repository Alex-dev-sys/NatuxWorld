import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { getAuthPath, getMinecraftDir } from '../utils/paths';

export interface User {
  uuid: string;
  username: string;
  accessToken: string;
  type: 'offline';
}

export interface Credentials {
  username: string;
  type?: 'offline' | 'microsoft';
}

export class AuthService {
  static offlineUuid(username: string): string {
    const hash = crypto.createHash('md5').update('OfflinePlayer:' + username, 'utf-8').digest();
    hash[6] = (hash[6] & 0x0f) | 0x30; // version 3 (name, MD5)
    hash[8] = (hash[8] & 0x3f) | 0x80; // IETF variant
    const hex = hash.toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-');
  }

  async getUser(): Promise<User | null> {
    try {
      const raw = await fsp.readFile(getAuthPath(), 'utf-8');
      const parsed = JSON.parse(raw) as User;
      if (parsed.uuid && parsed.username) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  async login(creds: Credentials | string): Promise<User> {
    const username = typeof creds === 'string' ? creds : creds.username;
    const user: User = {
      uuid: AuthService.offlineUuid(username),
      username,
      accessToken: '0',
      type: 'offline',
    };
    await fsp.mkdir(getMinecraftDir(), { recursive: true });
    await fsp.mkdir(path.dirname(getAuthPath()), { recursive: true });
    await fsp.writeFile(getAuthPath(), JSON.stringify(user, null, 2), 'utf-8');
    return user;
  }

  async logout(): Promise<void> {
    try {
      await fsp.unlink(getAuthPath());
    } catch {
      /* already gone, fine */
    }
  }
}
