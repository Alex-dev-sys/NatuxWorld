import { create } from 'zustand';
import type { LaunchProgress } from '../../electron/services/LauncherService';
import { bridge } from '../services/electron-bridge';
import { useAccountStore } from './useAccountStore';
import { useSettingsStore } from './useSettingsStore';

// Single fixed build + server — no version picking, one PLAY button.
const FIXED_VERSION = 'forge-1.21.1';
const FIXED_LOADER = 'forge' as const;
const SERVER_IP = 'mc.vibestudy.ru';

const STAGE_LABEL: Record<string, string> = {
  idle: 'Готов к запуску',
  resolving: 'Получение манифеста...',
  'java-check': 'Проверка Java...',
  libraries: 'Загрузка библиотек...',
  assets: 'Загрузка ресурсов...',
  'natives-extract': 'Распаковка библиотек...',
  'forge-install': 'Установка Forge...',
  spawn: 'Запуск Minecraft...',
  running: 'Игра запущена',
  error: 'Ошибка',
};

interface LauncherState {
  isLaunching: boolean;
  progress: number;
  progressMessage: string;
  stage: string;
  appVersion: string;
  errorMessage: string | null;
  unsubProgress: (() => void) | null;
  play: () => Promise<void>;
  cancel: () => Promise<void>;
  setAppVersion: (v: string) => void;
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  isLaunching: false,
  progress: 0,
  progressMessage: 'Готов к запуску',
  stage: 'idle',
  appVersion: '1.4.0',
  errorMessage: null,
  unsubProgress: null,

  setAppVersion: (v) => set({ appVersion: v }),

  play: async () => {
    const { isLaunching, unsubProgress } = get();
    if (isLaunching) return;
    if (unsubProgress) unsubProgress();

    const unsub = bridge.launcher.onProgress((p: LaunchProgress) => {
      const message = p.message || STAGE_LABEL[p.stage] || p.stage;
      // Terminal stages: stop tracking launch and tear down this listener.
      const terminal = p.stage === 'idle' || p.stage === 'error';
      set({
        stage: p.stage,
        progress: p.progress,
        progressMessage: message,
        errorMessage: p.stage === 'error' ? message : null,
        isLaunching: p.stage !== 'idle' && p.stage !== 'error' && p.stage !== 'running',
      });
      if (terminal) {
        const sub = get().unsubProgress;
        if (sub) sub();
        set({ unsubProgress: null });
      }
    });
    set({
      unsubProgress: unsub,
      isLaunching: true,
      progress: 0,
      stage: 'resolving',
      progressMessage: STAGE_LABEL.resolving,
      errorMessage: null,
    });

    try {
      const result = await bridge.launcher.play({
        version: FIXED_VERSION,
        loader: FIXED_LOADER,
        username: useAccountStore.getState().user?.username ?? 'Player',
        memory: useSettingsStore.getState().settings?.memory ?? 4096,
        server: SERVER_IP,
      });

      if (!result.ok) {
        set({
          isLaunching: false,
          stage: 'error',
          progressMessage: result.error ?? 'Ошибка запуска',
          errorMessage: result.error ?? 'Ошибка запуска',
        });
      }
    } catch {
      set({
        isLaunching: false,
        stage: 'error',
        progressMessage: 'Ошибка запуска',
        errorMessage: 'Ошибка запуска',
      });
    } finally {
      // Tear the listener down on a failed/errored launch, but keep it alive
      // while the game is actually running ('running' also clears isLaunching) —
      // it must survive to receive the later 'idle' game-exit event, which then
      // tears it down itself in the terminal branch above.
      if (get().stage !== 'running') {
        const sub = get().unsubProgress;
        if (sub) sub();
        set({ unsubProgress: null });
      }
    }
  },

  cancel: async () => {
    const { unsubProgress } = get();
    await bridge.launcher.cancel();
    if (unsubProgress) unsubProgress();
    set({
      isLaunching: false,
      progress: 0,
      stage: 'idle',
      progressMessage: STAGE_LABEL.idle,
      unsubProgress: null,
    });
  },
}));
