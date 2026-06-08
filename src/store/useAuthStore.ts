import { create } from 'zustand';
import { bridge } from '../services/electron-bridge';

interface User {
  id: string;
  username: string;
  uuid: string;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,

  login: async (username) => {
    set({ isLoading: true });
    const user = await bridge.auth.login({ username, type: 'offline' });
    set({ user, isLoading: false });
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
