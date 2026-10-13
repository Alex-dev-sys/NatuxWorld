import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TestEventHandler = (event: { payload: unknown }) => void;

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  handlers: new Map<string, TestEventHandler>(),
  unlisten: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: tauri.listen }));

function allowEventSubscriptions() {
  tauri.invoke.mockResolvedValue(undefined);
  tauri.listen.mockImplementation(async (name: string, handler: TestEventHandler) => {
    tauri.handlers.set(name, handler);
    return tauri.unlisten;
  });
}

async function loadBridge() {
  vi.resetModules();
  return import('../services/tauri-bridge');
}

describe('Tauri renderer bridge', () => {
  beforeEach(() => {
    tauri.handlers.clear();
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
    tauri.unlisten.mockReset();
    tauri.unlisten.mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('maps settings calls to native commands and rejects unavailable commands', async () => {
    const { createTauriBridge, TauriCommandError } = await loadBridge();
    const bridge = createTauriBridge();
    tauri.invoke.mockResolvedValueOnce({ memory: 4096 }).mockResolvedValueOnce([]);

    await bridge.settings.set({ memory: 4096 });
    await bridge.shell.diagnosticsRun();

    expect(tauri.invoke).toHaveBeenCalledWith('settings_set', { settings: { memory: 4096 } });
    expect(tauri.invoke).toHaveBeenCalledWith('shell_diagnostics_run', undefined);
    tauri.invoke.mockRejectedValueOnce('unimplemented by native host');
    await expect(bridge.java.detect()).rejects.toBeInstanceOf(TauriCommandError);
  });

  it('maps account flows to native commands without exposing session tokens', async () => {
    const { createTauriBridge } = await loadBridge();
    const bridge = createTauriBridge();
    tauri.invoke.mockResolvedValue({ ok: true, data: {} });

    await bridge.account.bootstrap();
    await bridge.account.register({ username: 'Player', email: 'player@example.test', password: 'secret' });
    await bridge.account.verify({ email: 'player@example.test', code: '123456' });
    await bridge.account.resend({ email: 'player@example.test' });
    await bridge.account.login({ login: 'Player', password: 'secret' });
    await bridge.account.login2fa({ challenge: 'challenge', code: '123456' });
    await bridge.account.twoFactorSetup();
    await bridge.account.twoFactorSetup({ code: '654321' });
    await bridge.account.twoFactorEnable({ code: '123456' });
    await bridge.account.logout();
    await bridge.account.logoutGlobal();

    expect(tauri.invoke.mock.calls).toEqual([
      ['account_bootstrap', undefined],
      ['account_register', { request: { username: 'Player', email: 'player@example.test', password: 'secret' } }],
      ['account_verify', { request: { email: 'player@example.test', code: '123456' } }],
      ['account_resend', { request: { email: 'player@example.test' } }],
      ['account_login', { request: { login: 'Player', password: 'secret' } }],
      ['account_login_2fa', { request: { challenge: 'challenge', code: '123456' } }],
      ['account_two_factor_setup', { request: {} }],
      ['account_two_factor_setup', { request: { code: '654321' } }],
      ['account_two_factor_enable', { request: { code: '123456' } }],
      ['account_logout', undefined],
      ['account_logout_global', undefined],
    ]);
    expect(JSON.stringify(tauri.invoke.mock.calls)).not.toContain('accessToken');
  });

  it('maps offline profile login and persistence to native commands', async () => {
    const { createTauriBridge } = await loadBridge();
    const bridge = createTauriBridge();
    tauri.invoke.mockResolvedValue({ uuid: 'profile-id', username: 'Player', type: 'offline' });

    await bridge.auth.login({ username: 'Player', type: 'offline' });
    await bridge.auth.getUser();
    await bridge.auth.logout();

    expect(tauri.invoke.mock.calls).toEqual([
      ['auth_login', { credentials: { username: 'Player', type: 'offline' } }],
      ['auth_get_user', undefined],
      ['auth_logout', undefined],
    ]);
  });

  it('registers progress events before play and reuses the initialized event bus', async () => {
    const { createTauriBridge } = await loadBridge();
    const bridge = createTauriBridge();
    allowEventSubscriptions();
    const registrationCountsAtPlay: number[] = [];
    tauri.invoke.mockImplementation(async (command: string) => {
      if (command === 'launcher_play') registrationCountsAtPlay.push(tauri.listen.mock.calls.length);
      return { ok: true };
    });

    await bridge.launcher.play({
      username: 'Player', memory: 4096, server: 'localhost', version: '1.21.1', loader: 'forge',
    });
    await bridge.launcher.play({
      username: 'Player', memory: 4096, server: 'localhost', version: '1.21.1', loader: 'forge',
    });

    expect(registrationCountsAtPlay).toEqual([6, 6]);
    expect(tauri.listen).toHaveBeenCalledTimes(6);
    expect(tauri.invoke).toHaveBeenCalledTimes(3);
  });

  it('replays app readiness that arrives before UI subscribers', async () => {
    const { createTauriBridge, initializeTauriBridge } = await loadBridge();
    const bridge = createTauriBridge();
    allowEventSubscriptions();
    tauri.invoke.mockImplementation(async (command: string) => {
      if (command === 'app_ready') {
        tauri.handlers.get('app:ready')?.({ payload: { version: '1.9.15' } });
      }
      return undefined;
    });
    await initializeTauriBridge();

    const onReady = vi.fn();
    const unsubscribe = bridge.app.onReady(onReady);
    expect(onReady).toHaveBeenCalledWith({ version: '1.9.15' });
    expect(tauri.invoke).toHaveBeenCalledWith('app_ready', undefined);
    unsubscribe();
  });

  it('releases partially registered event listeners and allows initialization to retry', async () => {
    const { initializeTauriBridge, TauriEventBusInitializationError } = await loadBridge();
    tauri.listen.mockImplementationOnce(async (_name: string, handler: TestEventHandler) => {
      tauri.handlers.set('window:maximized', handler);
      return tauri.unlisten;
    }).mockRejectedValueOnce(new Error('event registration failed'));

    await expect(initializeTauriBridge()).rejects.toBeInstanceOf(TauriEventBusInitializationError);
    expect(tauri.unlisten).toHaveBeenCalledTimes(1);

    allowEventSubscriptions();
    await expect(initializeTauriBridge()).resolves.toBeUndefined();
    expect(tauri.listen).toHaveBeenCalledTimes(8);
  });
});
