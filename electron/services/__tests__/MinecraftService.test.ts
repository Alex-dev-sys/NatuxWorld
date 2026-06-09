import { describe, expect, it, vi } from 'vitest';
import {
  buildClasspath,
  classpathSeparator,
  resolveLibraryPaths,
  buildGameValues,
  MinecraftService,
} from '../MinecraftService';
import type { Library } from '../MojangService';

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\Users\\Test\\AppData\\Roaming\\NATUX WORLD' },
}));

describe('toArgFile', () => {
  it('quotes each arg and escapes backslashes for Java @argfile', () => {
    const out = MinecraftService.toArgFile(['-cp', 'C:\\libs\\a.jar;C:\\libs\\b.jar', 'Main']);
    expect(out).toBe('"-cp"\n"C:\\\\libs\\\\a.jar;C:\\\\libs\\\\b.jar"\n"Main"');
  });

  it('escapes embedded quotes', () => {
    expect(MinecraftService.toArgFile(['a"b'])).toBe('"a\\"b"');
  });
});

describe('classpathSeparator', () => {
  it(': on unix, ; on windows', () => {
    expect(classpathSeparator('win32')).toBe(';');
    expect(classpathSeparator('linux')).toBe(':');
    expect(classpathSeparator('darwin')).toBe(':');
  });
});

describe('buildClasspath', () => {
  it('joins libs + client jar with platform separator', () => {
    const cp = buildClasspath(['/libs/a.jar', '/libs/b.jar'], '/versions/1.21.6/1.21.6.jar', 'win32');
    expect(cp).toBe('/libs/a.jar;/libs/b.jar;/versions/1.21.6/1.21.6.jar');
  });

  it('linux uses colon', () => {
    const cp = buildClasspath(['/libs/a.jar'], '/c.jar', 'linux');
    expect(cp).toBe('/libs/a.jar:/c.jar');
  });
});

describe('resolveLibraryPaths', () => {
  it('skips libraries without artifact + no os classifier', () => {
    const libs: Library[] = [{ name: 'foo:bar:1.0' }];
    expect(resolveLibraryPaths(libs, 'windows')).toEqual([]);
  });

  it('returns absolute paths for artifacts', () => {
    const libs: Library[] = [
      {
        name: 'com.mojang:authlib:6.0.54',
        downloads: {
          artifact: {
            path: 'com/mojang/authlib/6.0.54/authlib-6.0.54.jar',
            url: 'https://x',
            sha1: 'a',
            size: 1,
          },
        },
      },
    ];
    const paths = resolveLibraryPaths(libs, 'windows');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/authlib-6\.0\.54\.jar$/);
  });

  it('respects OS rules', () => {
    const libs: Library[] = [
      {
        name: 'osx-only:lib:1.0',
        rules: [{ action: 'allow', os: { name: 'osx' } }],
        downloads: {
          artifact: { path: 'osx-only/lib/1.0/lib-1.0.jar', url: 'https://x', sha1: 'a', size: 1 },
        },
      },
    ];
    expect(resolveLibraryPaths(libs, 'windows')).toHaveLength(0);
    expect(resolveLibraryPaths(libs, 'osx')).toHaveLength(1);
  });
});

describe('buildGameValues', () => {
  it('substitutes standard Mojang placeholders', () => {
    const values = buildGameValues({
      username: 'Notch',
      uuid: 'b50ad385-829d-3141-a216-7e7d7539ba7f',
      accessToken: '0',
      versionId: '1.21.6',
      versionType: 'release',
      gameDir: '/game',
      assetsDir: '/assets',
      assetIndex: '26',
      nativesDir: '/natives',
    });
    expect(values.auth_player_name).toBe('Notch');
    expect(values.auth_uuid).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
    expect(values.auth_access_token).toBe('0');
    expect(values.version_name).toBe('1.21.6');
    expect(values.version_type).toBe('release');
    expect(values.game_directory).toBe('/game');
    expect(values.assets_root).toBe('/assets');
    expect(values.assets_index_name).toBe('26');
    expect(values.user_type).toBe('msa');
    expect(values.natives_directory).toBe('/natives');
  });
});
