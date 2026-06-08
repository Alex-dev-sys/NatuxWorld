import { create } from 'zustand';
import type { LoaderKind, MinecraftVersion } from '../types';
import type { LaunchProgress } from '../../electron/services/LauncherService';
import { bridge } from '../services/electron-bridge';

export const VERSIONS: MinecraftVersion[] = [
  { id: 'forge-1.21.6', label: 'Forge 1.21.6', loader: 'forge', recommended: true },
  { id: 'fabric-1.21.6', label: 'Fabric 1.21.6', loader: 'fabric' },
  { id: 'neoforge-1.21.6', label: 'NeoForge 1.21.6', loader: 'neoforge' },
  { id: 'forge-1.20.1', label: 'Forge 1.20.1', loader: 'forge' },
];

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
  selectedVersion: MinecraftVersion;
  isLaunching: boolean;
  progress: number;
  progressMessage: string;
  stage: string;
  appVersion: string;
  errorMessage: string | null;
  unsubProgress: (() => void) | null;
  setVersion: (v: MinecraftVersion) => void;
  play: () => Promise<void>;
  cancel: () => Promise<void>;
  setAppVersion: (v: string) => void;
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  selectedVersion: VERSIONS[0],
  isLaunching: false,
  progress: 0,
  progressMessage: 'Готов к запуску',
  stage: 'idle',
  appVersion: '1.4.0',
  errorMessage: null,
  unsubProgress: null,

  setVersion: (v) => set({ selectedVersion: v }),
  setAppVersion: (v) => set({ appVersion: v }),

  play: async () => {
    const { selectedVersion, isLaunching, unsubProgress } = get();
    if (isLaunching) return;
    if (unsubProgress) unsubProgress();

    const unsub = bridge.launcher.onProgress((p: LaunchProgress) => {
      const message = p.message || STAGE_LABEL[p.stage] || p.stage;
      set({
        stage: p.stage,
        progress: p.progress,
        progressMessage: message,
        errorMessage: p.stage === 'error' ? message : null,
        isLaunching: p.stage !== 'idle' && p.stage !== 'error' && p.stage !== 'running',
      });
    });
    set({
      unsubProgress: unsub,
      isLaunching: true,
      progress: 0,
      stage: 'resolving',
      progressMessage: STAGE_LABEL.resolving,
      errorMessage: null,
    });

    const result = await bridge.launcher.play({
      version: selectedVersion.id,
      loader: selectedVersion.loader as LoaderKind,
      username: 'Player',
      memory: 4096,
    });

    if (!result.ok) {
      set({
        isLaunching: false,
        stage: 'error',
        progressMessage: result.error ?? 'Ошибка запуска',
        errorMessage: result.error ?? 'Ошибка запуска',
      });
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
