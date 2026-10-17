import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileMenu } from '../../ProfileMenu';
import { TwoFactorSetup } from '../TwoFactorSetup';
import { bridge } from '../../../services/native-bridge';
import { useAccountStore } from '../../../store/useAccountStore';
import { useAuthStore } from '../../../store/useAuthStore';

const setupResponse = {
  ok: true as const,
  data: {
    otpauthUri: 'otpauth://totp/Natux?secret=ABCDEF234567',
    qr: 'data:image/png;base64,qr',
  },
};

beforeEach(() => {
  useAccountStore.setState(useAccountStore.getInitialState());
  useAuthStore.setState(useAuthStore.getInitialState());
});

afterEach(() => {
  cleanup();
  useAccountStore.setState(useAccountStore.getInitialState());
  useAuthStore.setState(useAuthStore.getInitialState());
  vi.restoreAllMocks();
});

describe('TOTP enrollment and replacement', () => {
  it('keeps initial enrollment free of an existing-factor prompt', async () => {
    const setup = vi.spyOn(bridge.account, 'twoFactorSetup').mockResolvedValue(setupResponse);

    render(<TwoFactorSetup onClose={() => undefined} />);

    expect(await screen.findByRole('img', { name: 'QR' })).toBeTruthy();
    expect(setup).toHaveBeenCalledWith();
    expect(screen.queryByPlaceholderText('Текущий код или резервный код')).toBeNull();
  });

  it('requires the current factor before creating a replacement and then verifies the new app', async () => {
    const setup = vi.spyOn(bridge.account, 'twoFactorSetup')
      .mockResolvedValueOnce({ ok: false, error: { code: 'bad_credentials', message: 'Неверный код' } })
      .mockResolvedValueOnce(setupResponse);
    const enable = vi.spyOn(bridge.account, 'twoFactorEnable').mockResolvedValue({
      ok: true,
      data: { ok: true, backupCodes: ['backup-one', 'backup-two'] },
    });
    const onClose = vi.fn();

    render(<TwoFactorSetup reconfigure onClose={onClose} />);

    const currentCode = screen.getByPlaceholderText('Текущий код или резервный код');
    expect(setup).not.toHaveBeenCalled();
    fireEvent.change(currentCode, { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'ПРОДОЛЖИТЬ' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Неверный код');
    expect(setup).toHaveBeenLastCalledWith({ code: '111111' });

    fireEvent.change(currentCode, { target: { value: '222222' } });
    fireEvent.click(screen.getByRole('button', { name: 'ПРОДОЛЖИТЬ' }));
    expect(await screen.findByRole('img', { name: 'QR' })).toBeTruthy();
    expect(setup).toHaveBeenLastCalledWith({ code: '222222' });

    fireEvent.change(screen.getByPlaceholderText('Код нового приложения'), { target: { value: '333333' } });
    fireEvent.click(screen.getByRole('button', { name: 'ЗАМЕНИТЬ' }));
    expect(await screen.findByText('Приложение 2FA заменено.')).toBeTruthy();
    expect(enable).toHaveBeenCalledWith({ code: '333333' });
    expect(screen.getByText('backup-one')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ГОТОВО (войти заново)' }));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('offers replacement only when the active factor is TOTP', async () => {
    useAccountStore.setState({
      status: 'authed',
      user: {
        id: 'account-1',
        username: 'Natux',
        email: 'natux@example.test',
        twoFactorEnabled: true,
        twoFactorMethod: 'totp',
      },
    });
    const setup = vi.spyOn(bridge.account, 'twoFactorSetup').mockResolvedValue(setupResponse);

    render(<ProfileMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Natux' }));
    fireEvent.click(screen.getByRole('button', { name: 'Заменить приложение 2FA' }));

    expect(await screen.findByPlaceholderText('Текущий код или резервный код')).toBeTruthy();
    expect(setup).not.toHaveBeenCalled();
  });

  it('does not offer TOTP replacement for an email factor', () => {
    useAccountStore.setState({
      status: 'authed',
      user: {
        id: 'account-1',
        username: 'Natux',
        email: 'natux@example.test',
        twoFactorEnabled: true,
        twoFactorMethod: 'email',
      },
    });

    render(<ProfileMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Natux' }));

    expect(screen.queryByRole('button', { name: 'Заменить приложение 2FA' })).toBeNull();
  });
});
