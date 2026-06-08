import type { NatuxAPI } from '../types/electron';

const noop = () => () => {};

const fallback: NatuxAPI = {
  window: {
    minimize: async () => {},
    maximize: async () => {},
    close: async () => {},
    isMaximized: async () => false,
    onMaximizedChange: noop,
  },
  launcher: {
    play: async () => ({ ok: true }),
    getStatus: async () => ({ stage: 'idle', progress: 0, message: 'Готов к запуску' }),
    onProgress: noop,
  },
  auth: {
    login: async (c) => ({
      id: 'web',
      username: c.username,
      uuid: 'web-uuid',
      accessToken: 'web',
    }),
    logout: async () => {},
    getUser: async () => null,
  },
  java: {
    detect: async () => null,
    install: async () => ({ ok: true }),
  },
  news: {
    getAll: async () => (await import('../data/news.json')).default as never,
  },
  server: {
    getStatus: async () => ({ online: true, players: 142, maxPlayers: 500, ping: 52, tps: 20.0 }),
    getInfo: async () => ({
      ip: 'mc.xbestu.ru',
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
    }),
    set: async (s) => s as never,
  },
  updater: {
    check: async () => ({ available: false }),
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
};

export const bridge: NatuxAPI = typeof window !== 'undefined' && window.natux ? window.natux : fallback;
