import { describe, expect, it, vi } from 'vitest';
import { LauncherService, parseVersionId } from '../LauncherService';
import type { Library } from '../MojangService';

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\Users\\Test\\AppData\\Roaming\\NATUX WORLD' },
}));

describe('selectNativeLibs', () => {
  // Real shape from the 1.21.1 manifest: rules carry os.name only, arch lives in the name.
  const osx = [{ action: 'allow' as const, os: { name: 'osx' as const } }];
  const win = [{ action: 'allow' as const, os: { name: 'windows' as const } }];
  const lib = (name: string, rules: Library['rules']): Library => ({ name, rules });
  const libraries: Library[] = [
    lib('org.lwjgl:lwjgl:3.3.3:natives-macos', osx),
    lib('org.lwjgl:lwjgl:3.3.3:natives-macos-arm64', osx),
    lib('org.lwjgl:lwjgl-freetype:3.3.3:natives-macos-patch', osx),
    lib('org.lwjgl:lwjgl:3.3.3:natives-windows', win),
    lib('org.lwjgl:lwjgl:3.3.3:natives-windows-arm64', win),
    lib('org.lwjgl:lwjgl:3.3.3:natives-windows-x86', win),
    lib('org.lwjgl:lwjgl:3.3.3:natives-linux', [{ action: 'allow', os: { name: 'linux' } }]),
  ];

  it('Apple Silicon gets arm64 natives, not x64', () => {
    const names = LauncherService.selectNativeLibs(libraries, 'osx', 'arm64').map((l) => l.name);
    expect(names).toContain('org.lwjgl:lwjgl:3.3.3:natives-macos-arm64');
    expect(names).not.toContain('org.lwjgl:lwjgl:3.3.3:natives-macos');
  });

  it('arm64 keeps unsuffixed variants that have no arm64 twin (freetype patch)', () => {
    const names = LauncherService.selectNativeLibs(libraries, 'osx', 'arm64').map((l) => l.name);
    expect(names).toContain('org.lwjgl:lwjgl-freetype:3.3.3:natives-macos-patch');
  });

  it('Intel mac gets x64 natives only', () => {
    const names = LauncherService.selectNativeLibs(libraries, 'osx', 'x64').map((l) => l.name);
    expect(names).toContain('org.lwjgl:lwjgl:3.3.3:natives-macos');
    expect(names).not.toContain('org.lwjgl:lwjgl:3.3.3:natives-macos-arm64');
  });

  it('Windows x64 excludes x86 and arm64 variants (no dll overwrite)', () => {
    const names = LauncherService.selectNativeLibs(libraries, 'windows', 'x64').map((l) => l.name);
    expect(names).toEqual(['org.lwjgl:lwjgl:3.3.3:natives-windows']);
  });

  it('never selects natives of another OS', () => {
    const names = LauncherService.selectNativeLibs(libraries, 'osx', 'arm64').map((l) => l.name);
    expect(names.some((n) => n.includes('windows') || n.includes('linux'))).toBe(false);
  });
});

describe('parseVersionId', () => {
  it('forge-1.21.6 → forge loader, 1.21.6 mc', () => {
    expect(parseVersionId('forge-1.21.6')).toEqual({ loader: 'forge', mcVersion: '1.21.6' });
  });

  it('fabric-1.21.6 → fabric loader', () => {
    expect(parseVersionId('fabric-1.21.6')).toEqual({ loader: 'fabric', mcVersion: '1.21.6' });
  });

  it('neoforge-1.21.6 → neoforge loader', () => {
    expect(parseVersionId('neoforge-1.21.6')).toEqual({ loader: 'neoforge', mcVersion: '1.21.6' });
  });

  it('forge-1.20.1 → 1.20.1 mc', () => {
    expect(parseVersionId('forge-1.20.1')).toEqual({ loader: 'forge', mcVersion: '1.20.1' });
  });

  it('plain version (no prefix) → vanilla', () => {
    expect(parseVersionId('1.21.6')).toEqual({ loader: 'vanilla', mcVersion: '1.21.6' });
  });
});
