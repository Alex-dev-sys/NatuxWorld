import { app } from 'electron';
import http from 'node:http';
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
  /**
   * The player's nickname, when the caller knows it. Redaction by pattern alone
   * cannot catch every shape a nick appears in (`[CHAT] <Alice> hi`), so the
   * literal value is scrubbed too. It is never sent — only used to remove it.
   */
  username?: string;
}

const ENDPOINT = BRAND_URLS.crashReport;

/**
 * The onboarding screen promises "Ник, пароль и токен аккаунта не отправляются",
 * but log lines routinely carry all three (`Setting user: <nick>`, access
 * tokens, `C:\Users\<name>\…` paths). Redact before sending so the report
 * matches what the user was told.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A key's value, quoted or bare — `username="Alice"` as well as `user: Alice`. */
const VALUE = String.raw`(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)`;

// `<init>` / `<clinit>` are JVM frames, not nicknames — keep them readable.
const JVM_PSEUDO_METHODS = /^<(?:init|clinit)>$/;

function redact(text: string, username?: string): string {
  let out = text
    // Home directories: keep the shape of the path, drop the account name.
    .replace(/([A-Za-z]:\\Users\\)[^\\\r\n"']+/gi, '$1<user>')
    .replace(/(\/(?:home|Users)\/)[^/\r\n"']+/g, '$1<user>')
    // Explicit nickname/username announcements from the launcher and the game.
    .replace(
      new RegExp(String.raw`\b(Setting user|username|user|player|nick(?:name)?)\s*[:=]\s*${VALUE}`, 'gi'),
      '$1: <redacted>',
    )
    // Chat and join/leave lines name the player in angle brackets or brackets:
    // `[CHAT] <Alice> hi`, `<Alice> hi`, `[Alice: Set own game mode]`.
    .replace(/<[A-Za-z0-9_]{3,16}>/g, (match) =>
      JVM_PSEUDO_METHODS.test(match) ? match : '<nick>',
    )
    // Long opaque values (tokens, session ids, hashes) — never diagnostic.
    .replace(/\b[A-Za-z0-9._-]{32,}\b/g, '<redacted>')
    // UUIDs identify the account just as well as the nickname does.
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    // Anything shaped like an access-token assignment.
    .replace(new RegExp(String.raw`\b(accessToken|token|session|password|apiKey)\s*[:=]\s*${VALUE}`, 'gi'), '$1: <redacted>');

  // Finally remove the known nickname wherever it still appears — the patterns
  // above cannot enumerate every log format the game and its mods produce.
  if (username && username.length >= 3) {
    out = out.replace(new RegExp(escapeRegExp(username), 'gi'), '<nick>');
  }
  return out;
}

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
      message: redact(input.message, input.username).slice(0, 2000),
      exitCode: input.exitCode,
      // Cap the body so a multi-thousand-line game log can't produce a huge POST.
      logs: input.logs.slice(-300).map((l) => redact(l, input.username).slice(0, 2000)),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      ts: Date.now(),
    });

    await new Promise<void>((resolve) => {
      const endpoint = new URL(ENDPOINT);
      const transport = endpoint.protocol === 'http:' ? http : https;
      const req = transport.request(
        endpoint,
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
