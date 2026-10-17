import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { bridge } from '../../services/native-bridge';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { DiagnosticCheck } from '../../types/native';

const originalSettings = bridge.settings.get;
const checks: DiagnosticCheck[] = [
  { id: 'java', label: 'Java 21+', ok: true },
  { id: 'disk', label: 'Место на диске', ok: true },
  { id: 'site', label: 'Сайт и авторизация', ok: true },
  {
    id: 'updates',
    label: 'Канал обновлений',
    ok: true,
    detail: 'Манифест и подпись доступны (1 мс)',
  },
  { id: 'memory', label: 'Память', ok: true },
];

afterEach(() => {
  cleanup();
  useSettingsStore.setState(useSettingsStore.getInitialState());
  vi.restoreAllMocks();
});

describe('DiagnosticsPanel', () => {
  it.each([
    {
      language: 'ru' as const,
      hint: 'Java, место на диске, связь с сайтом, подписанный канал обновлений и память',
      button: 'Проверить систему',
    },
    {
      language: 'en' as const,
      hint: 'Java, disk space, website reachability, signed update channel and memory',
      button: 'Run system check',
    },
  ])('describes and displays the signed update check in $language', async ({ language, hint, button }) => {
    const settings = await originalSettings();
    useSettingsStore.setState({
      ...useSettingsStore.getInitialState(),
      settings: { ...settings, language },
    });
    const diagnosticsRun = vi.spyOn(bridge.shell, 'diagnosticsRun').mockResolvedValue(checks);

    render(<DiagnosticsPanel />);
    expect(screen.getByText(hint)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: button }));

    expect(await screen.findByText('Канал обновлений')).toBeTruthy();
    expect(screen.getByText('Манифест и подпись доступны (1 мс)')).toBeTruthy();
    expect(diagnosticsRun).toHaveBeenCalledTimes(1);
  });
});
