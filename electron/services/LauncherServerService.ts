import http from 'node:http';
import https from 'node:https';
import { BRAND } from '../../brand.config';

export interface ServerStatus {
  online: boolean;
  players: number;
  maxPlayers: number;
  ping: number;
  tps: number;
}

export interface ServerInfo {
  ip: string;
  version: string;
  mode: string;
  map: string;
  difficulty: string;
  whitelist: boolean;
  tps: number;
  ping: number;
}

export class LauncherServerService {
  private async fetchSiteApi<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${BRAND.siteOrigin}${path}`);
      const transport = url.protocol === 'http:' ? http : https;
      const req = transport.get(url, { timeout: 6000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  async getServerStatus(): Promise<ServerStatus> {
    try {
      const t0 = Date.now();
      const data = await this.fetchSiteApi<{
        online: boolean; players: { online: number; max: number }; tps?: number;
      }>('/api/server/status');
      const ping = Date.now() - t0;
      return {
        online: data.online,
        players: data.players?.online ?? 0,
        maxPlayers: data.players?.max ?? 100,
        ping,
        tps: data.tps ?? 20.0,
      };
    } catch {
      return { online: false, players: 0, maxPlayers: 100, ping: 0, tps: 0 };
    }
  }

  async getServerInfo(): Promise<ServerInfo> {
    try {
      const t0 = Date.now();
      const data = await this.fetchSiteApi<{
        online: boolean; players: { online: number; max: number }; version: string; tps?: number;
      }>('/api/server/status');
      const ping = Date.now() - t0;
      return {
        ip: BRAND.serverHost,
        version: data.version || '1.20.1+',
        mode: 'Анархия · PvP · Выживание',
        map: 'world_anarchy',
        difficulty: 'Hard',
        whitelist: false,
        tps: data.tps ?? 20.0,
        ping,
      };
    } catch {
      return {
        ip: BRAND.serverHost,
        version: '1.20.1+',
        mode: 'Анархия · PvP · Выживание',
        map: 'world_anarchy',
        difficulty: 'Hard',
        whitelist: false,
        tps: 0,
        ping: 0,
      };
    }
  }
}
