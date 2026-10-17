import { create } from 'zustand';
import { bridge } from '../services/native-bridge';
import type { LauncherSettings } from '../types/native';

interface SettingsState {
  settings: LauncherSettings | null;
  systemMemoryMb: number;
  isOpen: boolean;
  saving: boolean;
  error: string | null;
  open: () => void;
  close: () => void;
  load: () => Promise<void>;
  loadSystem: () => Promise<void>;
  update: (patch: Partial<LauncherSettings>) => Promise<void>;
  reset: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  systemMemoryMb: 8192,
  isOpen: false,
  saving: false,
  error: null,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  load: async () => {
    const settings = await bridge.settings.get();
    set({ settings });
  },
  loadSystem: async () => {
    const mb = await bridge.settings.getSystemMemory();
    set({ systemMemoryMb: mb });
    const s = get().settings;
    if (s && s.memory > mb) await get().update({ memory: Math.floor(mb / 512) * 512 });
  },
  reset: async () => {
    set({ saving: true, error: null });
    try {
      const next = await bridge.settings.reset();
      set({ settings: next });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      try { set({ settings: await bridge.settings.get() }); } catch { /* Keep the last confirmed settings. */ }
    } finally {
      set({ saving: false });
    }
  },
  update: async (patch) => {
    const current = get().settings;
    if (current) set({ settings: { ...current, ...patch } });
    set({ saving: true, error: null });
    try {
      const next = await bridge.settings.set(patch);
      set({ settings: next });
    } catch (error) {
      set({ settings: current, error: error instanceof Error ? error.message : String(error) });
      try { set({ settings: await bridge.settings.get() }); } catch { /* Keep the last confirmed settings. */ }
    } finally {
      set({ saving: false });
    }
  },
}));
