import { app } from 'electron';
import http from 'node:http';
import https from 'node:https';
import { SettingsService } from './SettingsService';
import { BRAND_URLS } from '../../brand.config';

export type TelemetryEvent =
  | 'install_ok'
  | 'install_fail'
  | 'launch_ok'
  | 'game_crash';

const ENDPOINT = `${BRAND_URLS.serverStatus.replace(/\/api\/server\/status$/, '')}/api/launcher-events`;

const ALLOWED_EVENTS = new Set<string>(['install_ok', 'install_fail', 'launch_ok', 'game_crash']);

/**
 * Strictly count-only, opt-in telemetry. The payload carries NO identifiers,
 * no nicknames, no logs — only which aggregate event happened, on which
 * platform, from which launcher version. Nothing is sent unless
 * settings.telemetryEnabled is true.
 */
export class TelemetryService {
  constructor(private readonly settings = new SettingsService()) {}

  async send(event: TelemetryEvent): Promise<void> {
    try {
      if ((await this.settings.get()).telemetryEnabled !== true) return;
    } catch {
      return;
    }
    if (!ALLOWED_EVENTS.has(event)) return;

    const payload = JSON.stringify({
      event,
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      ts: Date.now(),
    });

    await new Promise<void>((resolve) => {
      try {
        const endpoint = new URL(ENDPOINT);
        const transport = endpoint.protocol === 'http:' ? http : https;
        const req = transport.request(
          endpoint,
          {
            method: 'POST',
            timeout: 5000,
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
        req.on('error', () => resolve());
        req.on('timeout', () => {
          req.destroy();
          resolve();
        });
        req.write(payload);
        req.end();
      } catch {
        resolve();
      }
    });
  }
}
