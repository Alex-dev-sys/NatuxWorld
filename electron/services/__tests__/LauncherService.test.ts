import { describe, expect, it, vi } from 'vitest';
import { parseVersionId } from '../LauncherService';

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\Users\\Test\\AppData\\Roaming\\NATUX WORLD' },
}));

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
