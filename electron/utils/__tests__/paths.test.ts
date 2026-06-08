import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:\\Users\\Test\\AppData\\Roaming\\NATUX WORLD') },
}));

beforeEach(() => {
  vi.resetModules();
});

describe('paths', () => {
  it('getMinecraftDir returns userData/minecraft', async () => {
    const { getMinecraftDir } = await import('../paths');
    expect(getMinecraftDir()).toMatch(/minecraft$/);
  });

  it('getVersionDir composes version subdir', async () => {
    const { getVersionDir } = await import('../paths');
    expect(getVersionDir('1.21.6')).toMatch(/minecraft[\\/]versions[\\/]1\.21\.6$/);
  });

  it('getVersionJsonPath ends with <id>.json', async () => {
    const { getVersionJsonPath } = await import('../paths');
    expect(getVersionJsonPath('1.21.6')).toMatch(/1\.21\.6[\\/]1\.21\.6\.json$/);
  });

  it('getLibraryPath resolves a Maven name', async () => {
    const { getLibraryPath } = await import('../paths');
    const p = getLibraryPath('com.mojang:authlib:6.0.54');
    expect(p).toMatch(/libraries[\\/]com[\\/]mojang[\\/]authlib[\\/]6\.0\.54[\\/]authlib-6\.0\.54\.jar$/);
  });

  it('getLibraryPath honors classifier', async () => {
    const { getLibraryPath } = await import('../paths');
    const p = getLibraryPath('org.lwjgl:lwjgl:3.3.3:natives-windows');
    expect(p).toMatch(/lwjgl-3\.3\.3-natives-windows\.jar$/);
  });

  it('getAssetObjectPath splits by 2-char prefix', async () => {
    const { getAssetObjectPath } = await import('../paths');
    expect(getAssetObjectPath('abcdef1234567890')).toMatch(/objects[\\/]ab[\\/]abcdef1234567890$/);
  });

  it('getJrePath ends with platform java exe', async () => {
    const { getJrePath } = await import('../paths');
    const p = getJrePath();
    const expected = process.platform === 'win32' ? 'javaw.exe' : 'java';
    expect(p.endsWith(expected)).toBe(true);
  });

  it('getAuthPath ends with auth.json', async () => {
    const { getAuthPath } = await import('../paths');
    expect(getAuthPath()).toMatch(/auth\.json$/);
  });
});
