import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { bridge } from '../../services/native-bridge';
import { ProfileMenu } from '../ProfileMenu';
import { useAccountStore } from '../../store/useAccountStore';

const user = { id: 'test-account', username: 'TestPlayer', email: 'player@example.test' };

beforeEach(() => {
  useAccountStore.setState(useAccountStore.getInitialState());
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  useAccountStore.setState(useAccountStore.getInitialState());
  vi.restoreAllMocks();
});

describe('ProfileMenu credential warnings', () => {
  it('shows that a RAM-only session will require a new sign-in after restart', () => {
    useAccountStore.setState({
      status: 'authed',
      user,
      persistenceWarning: true,
    });

    render(<ProfileMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'TestPlayer' }));

    expect(screen.getByRole('status').textContent).toContain('после перезапуска потребуется войти снова');
  });

  it('keeps the account menu and offline profile intact when secure-store clear fails', async () => {
    useAccountStore.setState({ status: 'authed', user });
    const offlineLogout = vi.spyOn(bridge.auth, 'logout').mockResolvedValue();
    vi.spyOn(bridge.account, 'logout').mockResolvedValue({ ok: false, error: 'credential store unavailable' });

    render(<ProfileMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'TestPlayer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выйти (это устройство)' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Выход не подтверждён; повторите попытку.');
    await waitFor(() => expect(useAccountStore.getState().status).toBe('authed'));
    expect(useAccountStore.getState().user).toEqual(user);
    expect(offlineLogout).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Выйти (это устройство)' })).toBeTruthy();
  });
});
