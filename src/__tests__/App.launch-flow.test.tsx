import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { bridge } from '../services/native-bridge';
import { useAccountStore } from '../store/useAccountStore';
import { useLauncherStore } from '../store/useLauncherStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { BRAND } from '../../brand.config';
import type { LaunchProgress } from '../types/native';

// Exercise the real App, auth/launch components and Zustand actions. Only the
// native bridge boundary is simulated; no network, game downloads or process.
const user = { id: 'test-account', username: 'TestPlayer', email: 'player@example.test' };
const originalSettings = bridge.settings.get;
const listeners = new Set<(progress: LaunchProgress) => void>();
let finishLaunch: (result: { ok: boolean; error?: string }) => void;

function emit(stage: LaunchProgress['stage'], progress: number, message: string) {
  act(() => listeners.forEach((listener) => listener({ stage, progress, message })));
}

async function login() {
  render(<MemoryRouter><App /></MemoryRouter>);
  fireEvent.change(await screen.findByPlaceholderText('Ник или email'), { target: { value: user.username } });
  fireEvent.change(screen.getByPlaceholderText('Пароль'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'ВОЙТИ' }));
}

beforeEach(async () => {
  vi.restoreAllMocks();
  listeners.clear();
  useAccountStore.setState(useAccountStore.getInitialState());
  useLauncherStore.setState(useLauncherStore.getInitialState());
  useSettingsStore.setState(useSettingsStore.getInitialState());
  vi.spyOn(bridge.settings, 'get').mockResolvedValue({
    ...await originalSettings(), memory: 6144, onboardingCompleted: true,
  });
  vi.spyOn(bridge.news, 'getAll').mockResolvedValue([]);
  vi.spyOn(bridge.account, 'bootstrap').mockResolvedValueOnce({ status: 'guest' })
    .mockResolvedValue({ status: 'authed', user });
  vi.spyOn(bridge.account, 'login').mockResolvedValue({ ok: true, data: { twoFactor: false, user } });
  vi.spyOn(bridge.launcher, 'play').mockImplementation(() => new Promise((resolve) => { finishLaunch = resolve; }));
  vi.spyOn(bridge.launcher, 'cancel').mockResolvedValue();
  vi.spyOn(bridge.launcher, 'onProgress').mockImplementation((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  });
});

afterEach(() => {
  cleanup();
  useLauncherStore.getState().unsubProgress?.();
  vi.restoreAllMocks();
});

describe('launcher renderer journey', () => {
  it('signs in, installs, starts with the configured server and unlocks play after exit', async () => {
    await login();
    const play = await screen.findByRole('button', { name: 'ИГРАТЬ' });
    expect(bridge.account.login).toHaveBeenCalledWith({ login: user.username, password: 'test-password' });
    fireEvent.click(play);
    expect(bridge.launcher.play).toHaveBeenCalledWith({
      username: user.username, memory: 6144, server: BRAND.serverHost,
      version: 'forge-1.21.1', loader: 'forge',
    });
    emit('assets', 45, 'Загрузка ресурсов: 45%');
    expect(screen.getByText('Загрузка ресурсов: 45%')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'ЗАПУСК...' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTitle('Отменить запуск')).toBeTruthy();
    emit('spawn', 95, 'Запуск Minecraft...');
    expect(screen.queryByTitle('Отменить запуск')).toBeNull();
    emit('running', 100, 'Игра запущена');
    await act(async () => finishLaunch({ ok: true }));
    const running = screen.getByRole('button', { name: 'ИГРА ИДЁТ' });
    expect((running as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(running);
    expect(bridge.launcher.play).toHaveBeenCalledTimes(1);
    // The listener must survive play() resolving, or game exit never unlocks UI.
    emit('idle', 0, 'Игра завершена');
    expect((screen.getByRole('button', { name: 'ИГРАТЬ' }) as HTMLButtonElement).disabled).toBe(false);
    expect(useLauncherStore.getState().unsubProgress).toBeNull();
  });

  it('shows an installation failure and lets the user retry', async () => {
    await login();
    fireEvent.click(await screen.findByRole('button', { name: 'ИГРАТЬ' }));
    await act(async () => finishLaunch({ ok: false, error: 'Недостаточно места на диске' }));
    expect(screen.getByText('Недостаточно места на диске')).toBeTruthy();
    expect(useLauncherStore.getState().unsubProgress).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ПОВТОРИТЬ' }));
    expect(bridge.launcher.play).toHaveBeenCalledTimes(2);
    emit('running', 100, 'Игра запущена');
    await act(async () => finishLaunch({ ok: true }));
  });

  it('cancels an installation through the native bridge and restores play', async () => {
    await login();
    fireEvent.click(await screen.findByRole('button', { name: 'ИГРАТЬ' }));
    emit('assets', 20, 'Загрузка ресурсов...');
    fireEvent.click(screen.getByTitle('Отменить запуск'));
    await waitFor(() => expect(bridge.launcher.cancel).toHaveBeenCalledTimes(1));
    await act(async () => finishLaunch({ ok: true }));
    expect((screen.getByRole('button', { name: 'ИГРАТЬ' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTitle('Отменить запуск')).toBeNull();
    expect(useLauncherStore.getState().unsubProgress).toBeNull();
  });

  it('keeps play inaccessible until the second factor succeeds', async () => {
    vi.mocked(bridge.account.login).mockResolvedValue({
      ok: true, data: { twoFactor: true, challenge: 'test-challenge', method: 'totp' },
    });
    vi.spyOn(bridge.account, 'login2fa')
      .mockResolvedValueOnce({ ok: false, error: { code: 'invalid_code', message: 'Неверный код' } })
      .mockResolvedValue({ ok: true, data: { twoFactor: false, user } });
    await login();
    const code = await screen.findByPlaceholderText('Код или резервный код');
    expect(screen.queryByRole('button', { name: 'ИГРАТЬ' })).toBeNull();
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'ПОДТВЕРДИТЬ' }));
    expect(await screen.findByText('Неверный код')).toBeTruthy();
    expect(bridge.launcher.play).not.toHaveBeenCalled();
    fireEvent.change(code, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'ПОДТВЕРДИТЬ' }));
    expect(await screen.findByRole('button', { name: 'ИГРАТЬ' })).toBeTruthy();
    expect(bridge.account.login2fa).toHaveBeenLastCalledWith({ challenge: 'test-challenge', code: '654321' });
  });
});
