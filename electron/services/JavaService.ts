import { spawn } from 'node:child_process';

export interface JavaInstallation {
  version: string;
  path: string;
  vendor: string;
}

export class JavaService {
  async detect(): Promise<JavaInstallation | null> {
    return new Promise((resolve) => {
      const proc = spawn('java', ['-version']);
      let out = '';
      proc.stderr.on('data', (d) => (out += d.toString()));
      proc.on('close', () => {
        const match = out.match(/version "([^"]+)"/);
        if (match) {
          resolve({ version: match[1], path: 'java', vendor: out.split('\n')[0] ?? 'unknown' });
        } else {
          resolve(null);
        }
      });
      proc.on('error', () => resolve(null));
    });
  }

  async install(version: string): Promise<{ ok: boolean; path?: string }> {
    return { ok: true, path: `/runtime/java-${version}` };
  }
}
