import type { NatuxAPI } from '../types/electron';

const noop = () => () => {};

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
      ip: 'mc.vibestudy.ru',
      version: '1.21.6 Forge',
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
    }),
    set: async (s) => s as never,
    getSystemMemory: async () => 8192,
    reset: async () => ({
      memory: 4096, fullscreen: false, closeOnLaunch: false, language: 'ru' as const,
      jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC', resolution: { width: 1280, height: 720 },
      javaMode: 'bundled' as const, autoUpdate: true, autoLaunch: false, crashReports: false,
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
  },
  app: {
    onReady: noop,
  },
  account: {
    bootstrap: async () => ({ status: 'guest' as const }),
    register: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'Недоступно в браузере' } }),
    verify: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    resend: async () => ({ ok: true as const, data: undefined }),
    login: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    login2fa: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    twoFactorSetup: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    twoFactorEnable: async () => ({ ok: false as const, error: { code: 'offline', message: 'Недоступно в браузере' } }),
    logout: async () => ({ ok: true as const }),
  },
};

export const bridge: NatuxAPI = typeof window !== 'undefined' && window.natux ? window.natux : fallback;
