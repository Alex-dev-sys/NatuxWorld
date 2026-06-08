import { describe, expect, it } from 'vitest';
import { JavaService } from '../JavaService';

describe('JavaService static helpers', () => {
  it('adoptiumUrl composes windows/x64 URL correctly', () => {
    const url = JavaService.adoptiumUrl('windows', 'x64', 21);
    expect(url).toBe(
      'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse',
    );
  });

  it('adoptiumUrl composes mac/aarch64 URL correctly', () => {
    const url = JavaService.adoptiumUrl('mac', 'aarch64', 21);
    expect(url).toBe(
      'https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jre/hotspot/normal/eclipse',
    );
  });

  it('isJava21Plus accepts version 21.x', () => {
    expect(JavaService.isJava21Plus('java version "21.0.5"\nOpenJDK Runtime')).toBe(true);
  });

  it('isJava21Plus accepts version 22.x', () => {
    expect(JavaService.isJava21Plus('openjdk version "22.0.1"')).toBe(true);
  });

  it('isJava21Plus rejects version 17.x', () => {
    expect(JavaService.isJava21Plus('openjdk version "17.0.10"')).toBe(false);
  });

  it('isJava21Plus rejects malformed output', () => {
    expect(JavaService.isJava21Plus('not a java version string')).toBe(false);
  });

  it('parseVersion extracts version string', () => {
    expect(JavaService.parseVersion('openjdk version "21.0.5"\nfoo')).toBe('21.0.5');
    expect(JavaService.parseVersion('no match')).toBeNull();
  });

  it('platformOs maps process.platform to Adoptium os name', () => {
    expect(JavaService.platformOs('win32')).toBe('windows');
    expect(JavaService.platformOs('darwin')).toBe('mac');
    expect(JavaService.platformOs('linux')).toBe('linux');
  });

  it('platformArch maps process.arch to Adoptium arch name', () => {
    expect(JavaService.platformArch('x64')).toBe('x64');
    expect(JavaService.platformArch('arm64')).toBe('aarch64');
  });
});
