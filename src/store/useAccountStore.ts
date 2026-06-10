import { create } from 'zustand';
import { bridge } from '../services/electron-bridge';
import type { AccountUser } from '../../electron/services/AccountService';

type Status = 'checking' | 'guest' | 'authed';

interface AccountState {
  status: Status;
  user: AccountUser | null;
  error: string | null;
  pendingEmail: string | null;
  bootstrap: () => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  verify: (code: string) => Promise<boolean>;
  resend: () => Promise<void>;
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  status: 'checking',
  user: null,
  error: null,
  pendingEmail: null,

  bootstrap: async () => {
    const res = await bridge.account.bootstrap();
    if (res.status === 'authed') set({ status: 'authed', user: res.user });
    else set({ status: 'guest', user: null });
  },

  register: async (username, email, password) => {
    set({ error: null });
    const res = await bridge.account.register({ username, email, password });
    if (res.ok) { set({ pendingEmail: email }); return true; }
    set({ error: res.error.message });
    return false;
  },

  verify: async (code) => {
    const email = get().pendingEmail;
    if (!email) return false;
    set({ error: null });
    const res = await bridge.account.verify({ email, code });
    if (res.ok) { set({ status: 'authed', user: res.data, pendingEmail: null }); return true; }
    set({ error: res.error.message });
    return false;
  },

  resend: async () => {
    const email = get().pendingEmail;
    if (email) await bridge.account.resend({ email });
  },

  login: async (login, password) => {
    set({ error: null });
    const res = await bridge.account.login({ login, password });
    if (res.ok) { set({ status: 'authed', user: res.data }); return true; }
    if (res.error.code === 'email_unverified') set({ pendingEmail: login.includes('@') ? login : null });
    set({ error: res.error.message });
    return false;
  },

  logout: async () => {
    await bridge.account.logout();
    set({ status: 'guest', user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
