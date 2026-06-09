import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  FORGE_VERSIONS,
  forgeVersionId,
  installerUrl,
  mergeVersions,
} from '../ForgeService';
import type { VanillaVersion } from '../MojangService';

const fixtures = path.join(__dirname, 'fixtures');
const forgeJson = JSON.parse(
  readFileSync(path.join(fixtures, 'forge-version-1.21.6.json'), 'utf-8'),
);
const installProfile = JSON.parse(
  readFileSync(path.join(fixtures, 'install_profile-forge-1.21.6.json'), 'utf-8'),
);

describe('ForgeService URLs + version ids', () => {
  it('pins a build for 1.21.6 and 1.20.1', () => {
    expect(FORGE_VERSIONS['1.21.6']).toBe('56.0.4');
    expect(FORGE_VERSIONS['1.20.1']).toBeTruthy();
  });

  it('composes the maven installer URL', () => {
    expect(installerUrl('1.21.6', '56.0.4')).toBe(
      'https://maven.minecraftforge.net/net/minecraftforge/forge/1.21.6-56.0.4/forge-1.21.6-56.0.4-installer.jar',
    );
  });

  it('builds the forge version id', () => {
    expect(forgeVersionId('1.21.6', '56.0.4')).toBe('1.21.6-forge-56.0.4');
  });
});

describe('install_profile fixture sanity', () => {
  it('is spec 1 for minecraft 1.21.6 with processors and libraries', () => {
    expect(installProfile.spec).toBe(1);
    expect(installProfile.minecraft).toBe('1.21.6');
    expect(installProfile.processors.length).toBeGreaterThan(0);
    expect(installProfile.libraries.length).toBeGreaterThan(0);
  });
});

describe('mergeVersions', () => {
  const vanilla: VanillaVersion = {
    id: '1.21.6',
    type: 'release',
    mainClass: 'net.minecraft.client.main.Main',
    assetIndex: { id: '26', url: 'http://x', sha1: 'a', size: 1, totalSize: 1 },
    libraries: [
      { name: 'com.mojang:authlib:6.0.54', downloads: { artifact: { path: 'p', url: 'u', sha1: 's', size: 1 } } },
      { name: 'org.lwjgl:lwjgl:3.3.3', downloads: { artifact: { path: 'p', url: 'u', sha1: 's', size: 1 } } },
    ],
    downloads: { client: { url: 'u', sha1: 's', size: 1 } },
    arguments: { game: ['--username', '${auth_player_name}'], jvm: ['-cp', '${classpath}'] },
  };

  it('overrides id and mainClass from forge', () => {
    const merged = mergeVersions(vanilla, forgeJson);
    expect(merged.id).toBe('1.21.6-forge-56.0.4');
    expect(merged.mainClass).toBe('net.minecraftforge.bootstrap.ForgeBootstrap');
  });

  it('keeps vanilla assetIndex and downloads', () => {
    const merged = mergeVersions(vanilla, forgeJson);
    expect(merged.assetIndex.id).toBe('26');
    expect(merged.downloads.client.url).toBe('u');
  });

  it('unions libraries, forge winning on conflict (no duplicate group:artifact)', () => {
    const merged = mergeVersions(vanilla, forgeJson);
    const keys = merged.libraries.map((l) => {
      const [g, a, , c] = l.name.split(':');
      return c ? `${g}:${a}:${c}` : `${g}:${a}`;
    });
    expect(new Set(keys).size).toBe(keys.length); // no dupes (forge json itself lists some libs twice)
    expect(merged.libraries.some((l) => l.name.startsWith('net.minecraftforge:forge:'))).toBe(true);
    expect(merged.libraries.some((l) => l.name.startsWith('com.mojang:authlib'))).toBe(true);
  });

  it('appends forge arguments after vanilla', () => {
    const merged = mergeVersions(vanilla, forgeJson);
    expect(merged.arguments?.game.slice(0, 2)).toEqual(['--username', '${auth_player_name}']);
    expect(merged.arguments?.game).toContain('forge_client');
  });
});
