import type { LaunchOptions } from './LauncherService';

export interface AssetManifest {
  version: string;
  assets: { name: string; url: string; size: number; hash: string }[];
}

export class MinecraftService {
  async fetchManifest(version: string): Promise<AssetManifest> {
    return {
      version,
      assets: [],
    };
  }

  async downloadAssets(_manifest: AssetManifest, _onProgress: (p: number) => void): Promise<void> {
    return;
  }

  async launch(_options: LaunchOptions, _javaPath: string): Promise<{ pid: number }> {
    return { pid: 0 };
  }

  getInstanceDir(version: string): string {
    return `instances/${version}`;
  }
}
