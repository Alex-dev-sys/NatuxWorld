import { create } from 'zustand';
import { bridge } from '../services/native-bridge';
import type { AccountUser } from '../types/native';

type Status = 'checking' | 'guest' | 'authed';

interface AccountState {
  status: Status;
  user: AccountUser | null;
  error: string | null;
  persistenceWarning: boolean;
  logoutFailed: boolean;
  pendingEmail: string | null;
  /** Set when /login returned a 2FA challenge — the login UI then asks for the code. */
  twoFactorChallenge: string | null;
  twoFactorMethod: string | null;
  bootstrap: () => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  verify: (code: string) => Promise<boolean>;
  resend: () => Promise<void>;
  login: (login: string, password: string) => Promise<boolean>;
  /** Complete login by submitting the TOTP / email / backup code. */
  submitTwoFactor: (code: string) => Promise<boolean>;
  cancelTwoFactor: () => void;
  logout: () => Promise<boolean>;
  /** Revoke every session on every device (bumps tokenVersion server-side). */
  logoutGlobal: () => Promise<boolean>;
  clearError: () => void;
  /** Abandon the email-verification step and return to the login/register form. */
  cancelVerify: () => void;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  status: 'checking',
  user: null,
  error: null,
  persistenceWarning: false,
  logoutFailed: false,
  pendingEmail: null,
  twoFactorChallenge: null,
  twoFactorMethod: null,

  bootstrap: async () => {
    try {
      const res = await bridge.account.bootstrap();
      if (res.status === 'authed') {
        set({
          status: 'authed', user: res.user, error: null,
          persistenceWarning: res.sessionPersisted === false,
        });
      }
      // Offline: the stored session was never rejected, only unverifiable. Stay
      // signed in and surface the reason instead of forcing a new login.
      else if (res.status === 'offline') {
        set({
          status: 'authed', user: res.user, error: res.error,
          persistenceWarning: res.sessionPersisted === false,
        });
      } else set({ status: 'guest', user: null, persistenceWarning: false });
    } catch {
      set({ status: 'guest', user: null, persistenceWarning: false });
    }
  },

  register: async (username, email, password) => {
    set({ error: null, persistenceWarning: false, logoutFailed: false });
    try {
      const res = await bridge.account.register({ username, email, password });
      if (res.ok) { set({ pendingEmail: email }); return true; }
      set({ error: res.error.message });
      return false;
    } catch {
      set({ error: 'Ошибка сети' });
      return false;
    }
  },

  verify: async (code) => {
    const email = get().pendingEmail;
    if (!email) return false;
    set({ error: null, persistenceWarning: false });
    try {
      const res = await bridge.account.verify({ email, code });
      if (res.ok) {
        set({
          status: 'authed', user: res.data, pendingEmail: null,
          persistenceWarning: res.sessionPersisted === false,
        });
        return true;
      }
      set({ error: res.error.message });
      return false;
    } catch {
      set({ error: 'Ошибка сети' });
      return false;
    }
  },

  resend: async () => {
    const email = get().pendingEmail;
    if (!email) return;
    try {
      const res = await bridge.account.resend({ email });
      if (!res.ok) set({ error: res.error.message });
    } catch {
      set({ error: 'Ошибка сети' });
    }
  },

  login: async (login, password) => {
    set({ error: null, persistenceWarning: false, logoutFailed: false });
    try {
      const res = await bridge.account.login({ login, password });
      if (res.ok) {
        if (res.data.twoFactor) {
          set({ twoFactorChallenge: res.data.challenge, twoFactorMethod: res.data.method ?? null });
          return true;
        }
        set({
          status: 'authed', user: res.data.user,
          persistenceWarning: res.sessionPersisted === false,
        });
        await get().bootstrap(); // refresh full user (incl. twoFactorEnabled) from /me
        return true;
      }
      if (res.error.code === 'email_unverified') set({ pendingEmail: login.includes('@') ? login : null });
      set({ error: res.error.message });
      return false;
    } catch {
      set({ error: 'Ошибка сети' });
      return false;
    }
  },

  submitTwoFactor: async (code) => {
    const challenge = get().twoFactorChallenge;
    if (!challenge) return false;
    set({ error: null, persistenceWarning: false, logoutFailed: false });
    try {
      const res = await bridge.account.login2fa({ challenge, code });
      if (res.ok && !res.data.twoFactor) {
        set({
          status: 'authed', user: res.data.user, twoFactorChallenge: null, twoFactorMethod: null,
          persistenceWarning: res.sessionPersisted === false,
        });
        await get().bootstrap(); // refresh full user (incl. twoFactorEnabled) from /me
        return true;
      }
      set({ error: res.ok ? 'Ошибка' : res.error.message });
      return false;
    } catch {
      set({ error: 'Ошибка сети' });
      return false;
    }
  },

  cancelTwoFactor: () => set({ twoFactorChallenge: null, twoFactorMethod: null, error: null }),

  logout: async () => {
    set({ logoutFailed: false });
    try {
      const result = await bridge.account.logout();
      if (!result.ok) {
        set({ logoutFailed: true });
        return false;
      }
    } catch {
      set({ logoutFailed: true });
      return false;
    }
    set({
      status: 'guest', user: null, error: null,
      persistenceWarning: false, logoutFailed: false,
    });
    return true;
  },

  logoutGlobal: async () => {
    set({ logoutFailed: false });
    try {
      const result = await bridge.account.logoutGlobal();
      if (!result.ok) {
        set({ logoutFailed: true });
        return false;
      }
    } catch {
      set({ logoutFailed: true });
      return false;
    }
    set({
      status: 'guest', user: null, error: null,
      persistenceWarning: false, logoutFailed: false,
    });
    return true;
  },

  clearError: () => set({ error: null, logoutFailed: false }),

  cancelVerify: () => set({ pendingEmail: null, error: null }),
}));
