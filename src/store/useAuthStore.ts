import { create } from 'zustand';
import { bridge } from '../services/electron-bridge';

interface User {
  username: string;
  uuid: string;
  type?: 'offline' | 'microsoft';
  avatar?: string;
}

interface AuthState {
  user: User | null;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,

  login: async (username) => {
    const user = await bridge.auth.login({ username, type: 'offline' });
    set({ user });
  },

  logout: async () => {
    await bridge.auth.logout();
    set({ user: null });
  },

  refresh: async () => {
    const user = await bridge.auth.getUser();
    set({ user });
  },
}));
