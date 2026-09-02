import os from 'node:os';
import fs from 'node:fs/promises';
import { app } from 'electron';
import { JavaService } from './JavaService';
import { getMinecraftDir } from '../utils/paths';
import { BRAND_URLS } from '../../brand.config';
import { UPDATE_MANIFEST_URL } from './UpdateTrust';

export interface DiagnosticCheck {
  id: string;
  label: string;
  ok: boolean;
  /** Optional detail line (version, latency, free space...). */
  detail?: string;
}

const MIN_FREE_BYTES = 1.5 * 1024 * 1024 * 1024; // ~1.5 GB for libs + assets + client

async function fetchLatency(url: string, timeoutMs = 6000): Promise<number | null> {
  const t0 = Date.now();
  try {
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    return Date.now() - t0;
  } catch {
    return null;
  }
}

/**
 * "Doctor" diagnostics: everything the support flow asks for, in one button —
 * Java, disk space, reachability of the site and the update feed, and a
 * settings sanity check. Read-only; never mutates anything.
 */
export class DiagnosticsService {
  private readonly java = new JavaService();

  async run(): Promise<DiagnosticCheck[]> {
    const checks = await Promise.all([this.checkJava(), this.checkDisk(), this.checkSite(), this.checkUpdates()]);
    return [...checks, this.checkMemory()];
  }

  private async checkJava(): Promise<DiagnosticCheck> {
    const found = await this.java.detect();
    return found
      ? { id: 'java', label: 'Java 21+', ok: true, detail: `${found.version} (${found.vendor})` }
      : { id: 'java', label: 'Java 21+', ok: false, detail: 'Не найдена — будет установлена автоматически при запуске' };
  }

  private async checkDisk(): Promise<DiagnosticCheck> {
    try {
      await fs.mkdir(getMinecraftDir(), { recursive: true });
      const stats = await fs.statfs(getMinecraftDir());
      const free = Number(stats.bavail) * Number(stats.bsize);
      const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
      return free >= MIN_FREE_BYTES
        ? { id: 'disk', label: 'Место на диске', ok: true, detail: `Свободно ${gb(free)}` }
        : { id: 'disk', label: 'Место на диске', ok: false, detail: `Свободно ${gb(free)}, для игры нужно ~${gb(MIN_FREE_BYTES)}` };
    } catch {
      return { id: 'disk', label: 'Место на диске', ok: false, detail: 'Не удалось проверить' };
    }
  }

  private async checkSite(): Promise<DiagnosticCheck> {
    const latency = await fetchLatency(BRAND_URLS.serverStatus);
    return latency !== null
      ? { id: 'site', label: 'Сайт и авторизация', ok: true, detail: `Ответ за ${latency} мс` }
      : { id: 'site', label: 'Сайт и авторизация', ok: false, detail: 'Не отвечает — проверьте интернет' };
  }

  private async checkUpdates(): Promise<DiagnosticCheck> {
    const latency = await fetchLatency(UPDATE_MANIFEST_URL);
    return latency !== null
      ? { id: 'updates', label: 'Канал обновлений', ok: true, detail: `Доступен (${latency} мс)` }
      : { id: 'updates', label: 'Канал обновлений', ok: false, detail: 'GitHub недоступен — авто-обновления не сработают' };
  }

  private checkMemory(): DiagnosticCheck {
    const totalMb = Math.floor(os.totalmem() / (1024 * 1024));
    return {
      id: 'memory',
      label: 'Память',
      ok: totalMb >= 4096,
      detail: `${(totalMb / 1024).toFixed(1)} GB · ${app.getVersion()} · ${process.platform}/${process.arch}`,
    };
  }
}
