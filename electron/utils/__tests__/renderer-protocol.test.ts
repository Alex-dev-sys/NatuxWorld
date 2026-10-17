import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rendererContentType, resolveRendererFile } from '../renderer-protocol';

describe('app renderer protocol paths', () => {
  const root = path.resolve('dist-renderer');

  it('resolves the app origin into the renderer root', () => {
    expect(resolveRendererFile(root, 'app://launcher/index.html')).toBe(path.join(root, 'index.html'));
    expect(resolveRendererFile(root, 'app://launcher/assets/main.js?cache=1')).toBe(
      path.join(root, 'assets', 'main.js'),
    );
  });

  it('rejects another origin and encoded path traversal', () => {
    expect(resolveRendererFile(root, 'app://attacker/index.html')).toBeNull();
    expect(resolveRendererFile(root, 'app://launcher/%2e%2e%2foutside.txt')).toBeNull();
    expect(resolveRendererFile(root, 'app://launcher/%00secret')).toBeNull();
  });

  it('returns renderer content types needed by scripts, styles, and fonts', () => {
    expect(rendererContentType('index.html')).toBe('text/html; charset=utf-8');
    expect(rendererContentType('assets/main.js')).toBe('text/javascript; charset=utf-8');
    expect(rendererContentType('assets/main.css')).toBe('text/css; charset=utf-8');
    expect(rendererContentType('assets/font.woff2')).toBe('font/woff2');
    expect(rendererContentType('assets/unknown.bin')).toBe('application/octet-stream');
  });
});
