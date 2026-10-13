import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bridge } from '../../services/native-bridge';
import { useAccountStore } from '../useAccountStore';

const user = { id: 'test-account', username: 'TestPlayer', email: 'player@example.test' };

beforeEach(() => {
  useAccountStore.setState(useAccountStore.getInitialState());
  vi.restoreAllMocks();
});

afterEach(() => {
  useAccountStore.setState(useAccountStore.getInitialState());
  vi.restoreAllMocks();
});

describe('account credential-store failures', () => {
  it('keeps the current login and exposes a restart sign-in warning when persistence fails', async () => {
    vi.spyOn(bridge.account, 'login').mockResolvedValue({
      ok: true,
      data: { twoFactor: false, user },
      sessionPersisted: false,
    });
    vi.spyOn(bridge.account, 'bootstrap').mockResolvedValue({
      status: 'authed',
      user,
      sessionPersisted: false,
    });

    expect(await useAccountStore.getState().login(user.username, 'not-a-real-credential')).toBe(true);
    expect(useAccountStore.getState().status).toBe('authed');
    expect(useAccountStore.getState().persistenceWarning).toBe(true);
  });

  it('keeps local account state when secure-store deletion fails on logout', async () => {
    useAccountStore.setState({ status: 'authed', user });
    vi.spyOn(bridge.account, 'logout').mockResolvedValue({
      ok: false,
      error: 'credential store unavailable',
    });

    expect(await useAccountStore.getState().logout()).toBe(false);
    expect(useAccountStore.getState().status).toBe('authed');
    expect(useAccountStore.getState().user).toEqual(user);
    expect(useAccountStore.getState().logoutFailed).toBe(true);
  });

  it('keeps local account state when secure-store deletion fails after global logout', async () => {
    useAccountStore.setState({ status: 'authed', user });
    vi.spyOn(bridge.account, 'logoutGlobal').mockResolvedValue({
      ok: false,
      error: 'credential store unavailable',
    });

    expect(await useAccountStore.getState().logoutGlobal()).toBe(false);
    expect(useAccountStore.getState().status).toBe('authed');
    expect(useAccountStore.getState().user).toEqual(user);
    expect(useAccountStore.getState().logoutFailed).toBe(true);
  });
});
