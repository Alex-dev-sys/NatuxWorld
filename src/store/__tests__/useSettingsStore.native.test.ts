import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bridge } from '../../services/native-bridge';
import { useSettingsStore } from '../useSettingsStore';
import type { LauncherSettings } from '../../types/native';

describe('settings errors from the native host', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.setState({ settings: null, saving: false, error: null });
  });

  it('shows an OS error and returns to the persisted startup state instead of pretending success', async () => {
    const saved = { launchOnStartup: false, memory: 4096 } as LauncherSettings;
    useSettingsStore.setState({ settings: saved });
    vi.spyOn(bridge.settings, 'set').mockRejectedValueOnce(new Error('Startup registration belongs to another installation'));
    vi.spyOn(bridge.settings, 'get').mockResolvedValueOnce(saved);
    await useSettingsStore.getState().update({ launchOnStartup: true });
    expect(useSettingsStore.getState().settings?.launchOnStartup).toBe(false);
    expect(useSettingsStore.getState().saving).toBe(false);
    expect(useSettingsStore.getState().error).toContain('another installation');
  });

  it('keeps confirmed settings if the failed save cannot be refreshed', async () => {
    const saved = { memory: 4096 } as LauncherSettings;
    useSettingsStore.setState({ settings: saved });
    vi.spyOn(bridge.settings, 'set').mockRejectedValueOnce(new Error('Storage unavailable'));
    vi.spyOn(bridge.settings, 'get').mockRejectedValueOnce(new Error('Storage unavailable'));
    await useSettingsStore.getState().update({ memory: 8192 });
    expect(useSettingsStore.getState().settings?.memory).toBe(4096);
    expect(useSettingsStore.getState().error).toBe('Storage unavailable');
  });
});
