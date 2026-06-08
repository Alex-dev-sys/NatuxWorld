import { describe, expect, it } from 'vitest';
import { AuthService } from '../AuthService';

describe('AuthService.offlineUuid', () => {
  it('matches Mojang reference for "Notch"', () => {
    // Java: UUID.nameUUIDFromBytes(("OfflinePlayer:Notch").getBytes(UTF_8))
    expect(AuthService.offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
  });

  it('is deterministic — same name → same UUID', () => {
    expect(AuthService.offlineUuid('Player_123')).toBe(AuthService.offlineUuid('Player_123'));
  });

  it('produces 8-4-4-4-12 hex format', () => {
    const uuid = AuthService.offlineUuid('Steve');
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('encodes UUID version 3 in the third group', () => {
    const uuid = AuthService.offlineUuid('TestPlayer');
    const third = uuid.split('-')[2];
    expect(third[0]).toBe('3');
  });

  it('encodes IETF variant in the fourth group', () => {
    const uuid = AuthService.offlineUuid('TestPlayer');
    const fourth = uuid.split('-')[3];
    // High two bits of the first char must be 10 → first hex digit ∈ {8,9,a,b}
    expect(['8', '9', 'a', 'b']).toContain(fourth[0]);
  });

  it('different names produce different UUIDs', () => {
    expect(AuthService.offlineUuid('Alice')).not.toBe(AuthService.offlineUuid('Bob'));
  });
});
