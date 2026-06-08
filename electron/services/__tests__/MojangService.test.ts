import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { filterByOsRules, evaluateRules, substitutePlaceholders } from '../MojangService';

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const versionMeta = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'version-meta.json'), 'utf-8'));
const versionFull = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'version-full.json'), 'utf-8'));

describe('Mojang fixtures', () => {
  it('captured 1.21.6 manifest', () => {
    expect(versionMeta.id).toBe('1.21.6');
    expect(versionFull.id).toBe('1.21.6');
  });

  it('has more than 60 libraries', () => {
    expect(versionFull.libraries.length).toBeGreaterThan(60);
  });

  it('declares assetIndex 26 (or similar)', () => {
    expect(versionFull.assetIndex.id).toBeDefined();
    expect(versionFull.assetIndex.url).toMatch(/^https:\/\//);
    expect(versionFull.assetIndex.sha1).toMatch(/^[a-f0-9]{40}$/);
  });

  it('has client jar download with sha1', () => {
    expect(versionFull.downloads.client.url).toMatch(/^https:\/\//);
    expect(versionFull.downloads.client.sha1).toMatch(/^[a-f0-9]{40}$/);
  });

  it('declares java majorVersion >= 21', () => {
    expect(versionFull.javaVersion?.majorVersion).toBeGreaterThanOrEqual(21);
  });
});

describe('evaluateRules', () => {
  it('returns true when no rules', () => {
    expect(evaluateRules([], 'windows')).toBe(false); // default deny when no rule matches
  });

  it('returns true for blanket allow', () => {
    expect(evaluateRules([{ action: 'allow' }], 'windows')).toBe(true);
  });

  it('respects os.name match', () => {
    const rules = [
      { action: 'allow' as const },
      { action: 'disallow' as const, os: { name: 'osx' as const } },
    ];
    expect(evaluateRules(rules, 'osx')).toBe(false);
    expect(evaluateRules(rules, 'windows')).toBe(true);
  });

  it('latest matching rule wins', () => {
    const rules = [
      { action: 'disallow' as const },
      { action: 'allow' as const, os: { name: 'windows' as const } },
    ];
    expect(evaluateRules(rules, 'windows')).toBe(true);
    expect(evaluateRules(rules, 'linux')).toBe(false);
  });
});

describe('filterByOsRules', () => {
  it('keeps libraries with no rules', () => {
    const items: Array<{ name: string; rules?: never }> = [{ name: 'foo' }, { name: 'bar' }];
    expect(filterByOsRules(items, 'windows')).toHaveLength(2);
  });

  it('drops libraries explicitly disallowed for this OS', () => {
    type Item = { name: string; rules?: { action: 'allow' | 'disallow'; os?: { name?: 'windows' | 'osx' | 'linux' } }[] };
    const items: Item[] = [
      { name: 'foo' },
      { name: 'osx-only', rules: [{ action: 'allow', os: { name: 'osx' } }] },
    ];
    expect(filterByOsRules(items, 'windows').map((x) => x.name)).toEqual(['foo']);
    expect(filterByOsRules(items, 'osx').map((x) => x.name)).toEqual(['foo', 'osx-only']);
  });
});

describe('substitutePlaceholders', () => {
  it('replaces ${name} tokens', () => {
    expect(substitutePlaceholders('--username ${auth_player_name}', { auth_player_name: 'Notch' })).toBe(
      '--username Notch',
    );
  });

  it('leaves unknown tokens empty', () => {
    expect(substitutePlaceholders('${a}-${b}', { a: 'x' })).toBe('x-');
  });
});
