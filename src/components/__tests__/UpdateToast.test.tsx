import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateToast } from '../UpdateToast';
import { bridge } from '../../services/native-bridge';
import type { UpdateEvent } from '../../types/native';

let emitUpdate: ((event: UpdateEvent) => void) | undefined;

afterEach(() => {
  cleanup();
  emitUpdate = undefined;
  vi.restoreAllMocks();
});

describe('Electron-to-Tauri migration notice', () => {
  it('offers the signed-release installer and preserves the Electron updater notice after dismissal', () => {
    vi.spyOn(bridge.updater, 'onUpdate').mockImplementation((callback) => {
      emitUpdate = callback;
      return () => undefined;
    });
    const openExternal = vi.spyOn(bridge.shell, 'openExternal').mockResolvedValue(undefined);

    render(<UpdateToast />);
    act(() => {
      emitUpdate?.({
        type: 'tauri-migration',
        version: '1.9.15',
        url: 'https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v1.9.15/NatuxWorld-1.9.15-x64-setup.exe',
      });
      emitUpdate?.({ type: 'available', version: '1.9.16' });
    });

    expect(screen.getByText('Переход на Tauri 2')).toBeTruthy();
    expect(screen.getByText('Настройки и игровые файлы сохранятся. Закройте лаунчер перед установкой, затем войдите в аккаунт заново.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Скачать Tauri' }));
    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/Alex-dev-sys/NatuxWorld/releases/download/v1.9.15/NatuxWorld-1.9.15-x64-setup.exe',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.getByText('v1.9.16 доступна')).toBeTruthy();
  });
});

describe('manual desktop updates', () => {
  it('shows an error reported by a background updater check', () => {
    vi.spyOn(bridge.updater, 'onUpdate').mockImplementation((callback) => {
      emitUpdate = callback;
      return () => undefined;
    });

    render(<UpdateToast />);
    act(() => {
      emitUpdate?.({ type: 'checking' });
      emitUpdate?.({ type: 'error', message: 'The update feed could not be reached' });
    });

    expect(screen.getByText('Не удалось проверить обновление: The update feed could not be reached')).toBeTruthy();
  });

  it('opens the exact GitHub release page supplied by the native updater', () => {
    vi.spyOn(bridge.updater, 'onUpdate').mockImplementation((callback) => {
      emitUpdate = callback;
      return () => undefined;
    });
    const openExternal = vi.spyOn(bridge.shell, 'openExternal').mockResolvedValue(undefined);

    render(<UpdateToast />);
    act(() => {
      emitUpdate?.({
        type: 'manual',
        version: '1.9.16',
        url: 'https://github.com/Alex-dev-sys/NatuxWorld/releases/tag/v1.9.16',
      });
    });

    expect(screen.getByText('v1.9.16 доступна')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Скачать с сайта' }));
    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/Alex-dev-sys/NatuxWorld/releases/tag/v1.9.16',
    );
  });
});
