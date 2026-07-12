import { app } from 'electron';
import https from 'node:https';
import { SettingsService } from './SettingsService';
import { BRAND_URLS } from '../../brand.config';

export type CrashKind = 'launch-error' | 'game-crash';

export interface CrashReport {
  kind: CrashKind;
  /** Pipeline stage where it happened (resolving/libraries/forge-install/running…). */
  stage: string;
  message: string;
  /** Game process exit code, when the kind is 'game-crash'. */
  exitCode?: number;
  /** Tail of recent launcher + game log lines (already trimmed by the caller). */
  logs: string[];
}

const ENDPOINT = BRAND_URLS.crashReport;

/**
 * Sends anonymous crash reports to the backend, but ONLY when the user has opted in
 * via settings.crashReports. Fire-and-forget: a failure to report never affects the
 * launcher, and nothing is sent without consent. No account token is attached.
 */
export class CrashReportService {
  constructor(private readonly settings = new SettingsService()) {}

  async report(input: CrashReport): Promise<void> {
    let enabled = false;
    try {
      enabled = (await this.settings.get()).crashReports === true;
    } catch {
      return;
    }
    if (!enabled) return;

    const payload = JSON.stringify({
      kind: input.kind,
      stage: input.stage,
      message: input.message.slice(0, 2000),
      exitCode: input.exitCode,
      // Cap the body so a multi-thousand-line game log can't produce a huge POST.
      logs: input.logs.slice(-300).map((l) => l.slice(0, 2000)),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      ts: Date.now(),
    });

    await new Promise<void>((resolve) => {
      const req = https.request(
        ENDPOINT,
        {
          method: 'POST',
          timeout: 6000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'NatuxWorldLauncher',
            'Content-Length': String(Buffer.byteLength(payload)),
          },
        },
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      // Never throw — reporting is best-effort and must not surface to the user.
      req.on('error', () => resolve());
      req.on('timeout', () => {
        req.destroy();
        resolve();
      });
      req.write(payload);
      req.end();
    });
  }
}
