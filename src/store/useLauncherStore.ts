import { create } from 'zustand';
import type { LoaderKind, MinecraftVersion } from '../types';
import { bridge } from '../services/electron-bridge';

export const VERSIONS: MinecraftVersion[] = [
  { id: 'forge-1.21.6', label: 'Forge 1.21.6', loader: 'forge', recommended: true },
  { id: 'fabric-1.21.6', label: 'Fabric 1.21.6', loader: 'fabric' },
  { id: 'neoforge-1.21.6', label: 'NeoForge 1.21.6', loader: 'neoforge' },
  { id: 'forge-1.20.1', label: 'Forge 1.20.1', loader: 'forge' },
];

interface LauncherState {
  selectedVersion: MinecraftVersion;
  isLaunching: boolean;
  progress: number;
  progressMessage: string;
  appVersion: string;
  setVersion: (v: MinecraftVersion) => void;
  play: () => Promise<void>;
  setAppVersion: (v: string) => void;
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  selectedVersion: VERSIONS[0],
  isLaunching: false,
  progress: 0,
  progressMessage: 'Готов к запуску',
  appVersion: '1.2.3',

  setVersion: (v) => set({ selectedVersion: v }),
  setAppVersion: (v) => set({ appVersion: v }),

  play: async () => {
    const { selectedVersion, isLaunching } = get();
    if (isLaunching) return;
    set({ isLaunching: true, progress: 5, progressMessage: 'Подготовка окружения...' });

    try {
      await bridge.launcher.play({
        version: selectedVersion.id,
        loader: selectedVersion.loader as LoaderKind,
        username: 'Player',
        memory: 4096,
      });
    } catch {
      set({ isLaunching: false, progress: 0, progressMessage: 'Ошибка запуска' });
      return;
    }

    let p = 5;
    const interval = setInterval(() => {
      p += Math.random() * 10;
      if (p >= 100) {
        clearInterval(interval);
        set({ progress: 100, progressMessage: 'Запуск Minecraft...' });
        setTimeout(
          () => set({ isLaunching: false, progress: 0, progressMessage: 'Готов к запуску' }),
          800,
        );
      } else {
        set({
          progress: Math.round(p),
          progressMessage: p < 50 ? 'Загрузка ассетов...' : 'Проверка библиотек...',
        });
      }
    }, 220);
  },
}));
