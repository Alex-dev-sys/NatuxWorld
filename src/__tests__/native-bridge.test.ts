import { describe, expect, it, vi } from 'vitest';
import { createUnavailableBridge, NativeHostUnavailableError } from '../services/native-bridge';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));

describe('native bridge without a desktop host', () => {
  it('rejects commands instead of reporting fake success', async () => {
    const bridge = createUnavailableBridge();

    await expect(bridge.launcher.play({
      version: '1.21.1', username: 'Player', memory: 4096,
    })).rejects.toMatchObject({
      name: 'NativeHostUnavailableError',
      apiPath: 'launcher.play',
    } satisfies Partial<NativeHostUnavailableError>);
    await expect(bridge.server.getStatus()).rejects.toBeInstanceOf(NativeHostUnavailableError);
    await expect(bridge.auth.login({ username: 'Player', type: 'offline' }))
      .rejects.toBeInstanceOf(NativeHostUnavailableError);
  });

  it('keeps event unsubscriptions synchronous and harmless', () => {
    const bridge = createUnavailableBridge();
    const unsubscribe = bridge.launcher.onProgress(() => undefined);

    expect(unsubscribe).toBeTypeOf('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});
