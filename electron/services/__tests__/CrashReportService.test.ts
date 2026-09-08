import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('electron', () => ({
  app: { getVersion: () => '9.9.9', getPath: () => '/tmp/natux-test' },
}));

// Capture https.request calls without hitting the network.
const requests: Array<{ body: string }> = [];
vi.mock('node:https', () => ({
  default: {
    request: (_url: string, _opts: unknown, cb: (res: EventEmitter) => void) => {
      const res = Object.assign(new EventEmitter(), { resume() {} });
      const req = Object.assign(new EventEmitter(), {
        _body: '',
        write(chunk: string) {
          this._body += chunk;
        },
        end() {
          requests.push({ body: this._body });
          cb(res);
          // Simulate a 200 with no payload.
          res.emit('end');
        },
        destroy() {},
      });
      return req;
    },
  },
}));

import { CrashReportService } from '../CrashReportService';
import type { SettingsService } from '../SettingsService';

function fakeSettings(crashReports: boolean): SettingsService {
  return { get: async () => ({ crashReports }) } as unknown as SettingsService;
}

const sample = {
  kind: 'game-crash' as const,
  stage: 'running',
  message: 'boom',
  exitCode: 1,
  logs: ['[stderr] crash line'],
};

afterEach(() => {
  requests.length = 0;
});

describe('CrashReportService consent gating', () => {
  it('does NOT send when crashReports is disabled', async () => {
    await new CrashReportService(fakeSettings(false)).report(sample);
    expect(requests).toHaveLength(0);
  });

  it('sends an anonymous payload when enabled', async () => {
    await new CrashReportService(fakeSettings(true)).report(sample);
    expect(requests).toHaveLength(1);
    const body = JSON.parse(requests[0].body);
    expect(body.kind).toBe('game-crash');
    expect(body.exitCode).toBe(1);
    expect(body.version).toBe('9.9.9');
    expect(body.logs).toEqual(['[stderr] crash line']);
    // No account token / user identity in the payload.
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('user');
  });

  it('strips the player identity the onboarding screen promised not to send', async () => {
    const logs = [
      '[Client thread/INFO]: Setting user: Alice',
      '[Server thread/INFO]: [CHAT] <Alice> hello there',
      'profile username="Alice" loaded',
      'Alice joined the game',
      String.raw`Loading C:\Users\Alice\AppData\Roaming\.minecraft`,
      'accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefghijklmnop',
      'uuid 069a79f4-44e9-4726-a5be-fca90e38aaf5',
    ];

    await new CrashReportService(fakeSettings(true)).report({
      ...sample,
      message: 'crash for Alice',
      logs,
      username: 'Alice',
    });

    const body = JSON.parse(requests[0].body);
    const blob = JSON.stringify(body);
    expect(blob).not.toMatch(/Alice/i);
    expect(blob).not.toContain('069a79f4-44e9-4726-a5be-fca90e38aaf5');
    expect(blob).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    // The username is used only for redaction, never transmitted.
    expect(body).not.toHaveProperty('username');
    // Still diagnostic: the stage and the shape of the path survive.
    expect(body.stage).toBe('running');
    expect(blob).toContain('.minecraft');
  });

  it('keeps JVM frames readable while redacting nicknames', async () => {
    await new CrashReportService(fakeSettings(true)).report({
      ...sample,
      logs: ['at java.lang.Object.<init>(Object.java:37)'],
    });
    const body = JSON.parse(requests[0].body);
    expect(body.logs[0]).toContain('<init>');
  });

  it('caps logs to the last 300 lines', async () => {
    const logs = Array.from({ length: 500 }, (_, i) => `line ${i}`);
    await new CrashReportService(fakeSettings(true)).report({ ...sample, logs });
    const body = JSON.parse(requests[0].body);
    expect(body.logs).toHaveLength(300);
    expect(body.logs[0]).toBe('line 200');
    expect(body.logs[299]).toBe('line 499');
  });
});
