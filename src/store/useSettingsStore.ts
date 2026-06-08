import { create } from 'zustand';
import { bridge } from '../services/electron-bridge';
import type { LauncherSettings } from '../../electron/services/SettingsService';

interface SettingsState {
  settings: LauncherSettings | null;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  load: () => Promise<void>;
  update: (patch: Partial<LauncherSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  load: async () => {
    const settings = await bridge.settings.get();
    set({ settings });
  },
  update: async (patch) => {
    const next = await bridge.settings.set(patch);
    set({ settings: next });
    const current = get().settings;
    if (current) set({ settings: { ...current, ...patch } });
  },
}));
