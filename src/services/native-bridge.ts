/** Neutral renderer boundary for Tauri, the legacy Electron preload, and browser preview. */
import type { NatuxAPI } from '../types/native';
import { BRAND } from '../../brand.config';
import { isTauri } from '@tauri-apps/api/core';
import { createTauriBridge } from './tauri-bridge';

const noop = () => () => {};

export class NativeHostUnavailableError extends Error {
  readonly apiPath: string;

  constructor(apiPath: string) {
    super(`Native host is unavailable for "${apiPath}".`);
    this.name = 'NativeHostUnavailableError';
    this.apiPath = apiPath;
  }
}

/** Fail closed if a packaged renderer loses its Electron preload or Tauri host. */
export function createUnavailableBridge(): NatuxAPI {
  function createUnavailablePath(apiPath: string): (...args: unknown[]) => unknown {
    return new Proxy(function unavailableNativeMethod() {}, {
      get(_target, property) {
        if (property === 'then') return undefined;
        if (property === Symbol.toStringTag) return 'NatuxAPIUnavailable';
        if (typeof property === 'symbol') return undefined;
        return createUnavailablePath(apiPath ? `${apiPath}.${property}` : property);
      },
      apply(_target, _thisArgument, _argumentsList) {
        if (apiPath.split('.').pop()?.startsWith('on')) return noop();
        return Promise.reject(new NativeHostUnavailableError(apiPath || 'unknown'));
      },
    });
  }

  return createUnavailablePath('') as unknown as NatuxAPI;
}

const previewMode = (typeof __NATUX_LOCAL_MODE__ !== 'undefined' && __NATUX_LOCAL_MODE__)
  || import.meta.env.MODE === 'test';

const fallback: NatuxAPI = {
  getVersion: async () => '0.0.0',
  window: {
    minimize: async () => {},
    maximize: async () => {},
    close: async () => {},
    isMaximized: async () => false,
    onMaximizedChange: noop,
  },
  launcher: {
    play: async () => ({ ok: true }),
    getStatus: async () => ({ stage: 'idle' as const, progress: 0, message: 'Готов к запуску' }),
    cancel: async () => {},
    onProgress: noop,
    onLog: noop,
  },
  auth: {
    login: async (c) => ({
      username: c.username,
      uuid: 'web-uuid',
      accessToken: 'web',
      type: 'offline' as const,
    }),
    logout: async () => {},
    getUser: async () => null,
  },
  java: {
    detect: async () => null,
    install: async () => ({ version: '21', vendor: 'Temurin' as const, path: '/web/jre' }),
  },
  news: {
    getAll: async () => (await import('../data/news.json')).default as never,
  },
  server: {
    getStatus: async () => ({ online: true, players: 142, maxPlayers: 500, ping: 52, tps: 20.0 }),
    getInfo: async () => ({
      ip: BRAND.serverHost,
      version: BRAND.minecraftVersionLabel,
      mode: 'Анархия',
      map: 'world_anarchy',
      difficulty: 'Hard',
      whitelist: false,
      tps: 20.0,
      ping: 52,
    }),
  },
  settings: {
    get: async () => ({
      memory: 4096,
      fullscreen: false,
      closeOnLaunch: false,
      language: 'ru',
      jvmArgs: '-XX:+UseG1GC',
      resolution: { width: 1280, height: 720 },
      javaMode: 'bundled' as const,
      autoUpdate: true,
      autoLaunch: false,
      crashReports: false,
      onboardingCompleted: false,
      minimizeToTray: false,
      launchOnStartup: false,
      updateChannel: 'stable' as const,
      telemetryEnabled: false,
      installId: '',
    }),
    set: async (s) => s as never,
    getSystemMemory: async () => 8192,
    reset: async () => ({
      memory: 4096, fullscreen: false, closeOnLaunch: false, language: 'ru' as const,
      jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC', resolution: { width: 1280, height: 720 },
      javaMode: 'bundled' as const, autoUpdate: true, autoLaunch: false, crashReports: false, onboardingCompleted: false,
      minimizeToTray: false, launchOnStartup: false, updateChannel: 'stable' as const, telemetryEnabled: false, installId: '',
    }),
    pickJava: async () => null,
    verifyJava: async () => ({ ok: false, error: 'Недоступно в браузере' }),
  },
  updater: {
    check: async () => ({ available: false }),
    install: async () => {},
    onUpdate: noop,
  },
  shell: {
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    openScreenshots: async () => ({ ok: false, error: 'Недоступно в браузере' }),
    diagnosticsRun: async () => [],
    playtimeGet: async () => ({ totalMs: 0, sessions: [], lastSession: null, inGame: false }),
  },
  app: {
    onReady: noop,
    onTrayLaunchRequest: noop,
  },
  account: {
    bootstrap: async () => ({ status: 'guest' as const }),
    register: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'Недоступно в браузере' } }),
    verify: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    resend: async () => ({ ok: true as const, data: undefined }),
    login: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    login2fa: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    twoFactorSetup: async (_request?: { code?: string }) => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    twoFactorEnable: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    logout: async () => ({ ok: true as const }),
    logoutGlobal: async () => ({ ok: true as const }),
  },
};

export const bridge: NatuxAPI = typeof window !== 'undefined' && window.natux
  ? window.natux
  : isTauri()
    ? createTauriBridge()
    : previewMode
      ? fallback
      : createUnavailableBridge();
