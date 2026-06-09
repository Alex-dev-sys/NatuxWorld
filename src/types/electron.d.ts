import type {
  ServerStatus,
  ServerInfo,
  LaunchProgress,
  PlayOptions,
} from '../../electron/services/LauncherService';
import type { NewsItem } from '../../electron/services/NewsService';
import type { User, Credentials } from '../../electron/services/AuthService';
import type { JavaInstallation } from '../../electron/services/JavaService';
import type { LauncherSettings } from '../../electron/services/SettingsService';
import type { UpdateInfo, UpdateEvent } from '../../electron/services/UpdateService';

export interface LauncherLog {
  stream: 'stdout' | 'stderr' | 'forge' | string;
  line: string;
}

export interface NatuxAPI {
  getVersion: () => Promise<string>;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (cb: (val: boolean) => void) => () => void;
  };
  launcher: {
    play: (options: PlayOptions) => Promise<{ ok: boolean; error?: string }>;
    getStatus: () => Promise<LaunchProgress>;
    cancel: () => Promise<void>;
    onProgress: (cb: (p: LaunchProgress) => void) => () => void;
    onLog: (cb: (lines: LauncherLog[]) => void) => () => void;
  };
  auth: {
    login: (creds: Credentials) => Promise<User>;
    logout: () => Promise<void>;
    getUser: () => Promise<User | null>;
  };
  java: {
    detect: () => Promise<JavaInstallation | null>;
    install: () => Promise<JavaInstallation>;
  };
  news: {
    getAll: () => Promise<NewsItem[]>;
  };
  server: {
    getStatus: () => Promise<ServerStatus>;
    getInfo: () => Promise<ServerInfo>;
  };
  settings: {
    get: () => Promise<LauncherSettings>;
    set: (settings: Partial<LauncherSettings>) => Promise<LauncherSettings>;
  };
  updater: {
    check: () => Promise<UpdateInfo>;
    install: () => Promise<void>;
    onUpdate: (cb: (event: UpdateEvent) => void) => () => void;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  app: {
    onReady: (cb: (data: { version: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    natux?: NatuxAPI;
  }
}

export {};
