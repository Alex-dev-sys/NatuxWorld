import { EventEmitter } from 'node:events';

export interface LaunchOptions {
  version: string;
  loader: 'forge' | 'fabric' | 'neoforge';
  username: string;
  memory: number;
}

export interface LaunchProgress {
  stage: 'idle' | 'preparing' | 'downloading' | 'launching' | 'running' | 'error';
  progress: number;
  message: string;
}

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

export class LauncherService extends EventEmitter {
  private status: LaunchProgress = {
    stage: 'idle',
    progress: 0,
    message: 'Готов к запуску',
  };

  async play(_options: unknown): Promise<{ ok: boolean }> {
    this.status = { stage: 'preparing', progress: 5, message: 'Подготовка окружения...' };
    this.emit('progress', this.status);
    return { ok: true };
  }

  getStatus(): LaunchProgress {
    return this.status;
  }

  async getServerStatus(): Promise<ServerStatus> {
    return {
      online: true,
      players: 142,
      maxPlayers: 500,
      ping: 52,
      tps: 20.0,
    };
  }

  async getServerInfo(): Promise<ServerInfo> {
    return {
      ip: 'mc.xbestu.ru',
      version: '1.21.6 Forge',
      mode: 'Анархия',
      map: 'world_anarchy',
      difficulty: 'Hard',
      whitelist: false,
      tps: 20.0,
      ping: 52,
    };
  }
}
