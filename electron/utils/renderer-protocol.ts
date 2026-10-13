import path from 'node:path';

const APP_SCHEME = 'app:';
const APP_HOST = 'launcher';

/** Resolve only files beneath the packaged renderer root for the app:// origin. */
export function resolveRendererFile(rootDirectory: string, requestUrl: string): string | null {
  let target: URL;
  let requestedPath: string;
  try {
    target = new URL(requestUrl);
    requestedPath = decodeURIComponent(target.pathname);
  } catch {
    return null;
  }
  if (target.protocol !== APP_SCHEME || target.hostname !== APP_HOST) return null;
  if (requestedPath.includes('\0') || requestedPath.includes('\\')) return null;

  const root = path.resolve(rootDirectory);
  const filePath = path.resolve(root, requestedPath.replace(/^\/+/, '') || 'index.html');
  const relative = path.relative(root, filePath);
  if (
    relative !== '' &&
    (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
  ) {
    return null;
  }
  return filePath;
}

export function rendererContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.ico': return 'image/x-icon';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}
