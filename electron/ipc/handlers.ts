import { ipcMain, shell, dialog } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { IPC } from './channels';
import { LauncherService } from '../services/LauncherService';
import { JavaService } from '../services/JavaService';
import { AuthService } from '../services/AuthService';
import { NewsService } from '../services/NewsService';
import { SettingsService } from '../services/SettingsService';
import { UpdateService } from '../services/UpdateService';
import { AccountService, AccountApiError } from '../services/AccountService';

export const launcher = new LauncherService();
const java = new JavaService();
const auth = new AuthService();
const news = new NewsService();
export const settings = new SettingsService();
export const updater = new UpdateService();
export const account = new AccountService();

/** Coerce arbitrary IPC input into a sane integer MiB value for JVM heap flags. */
function clampMemory(value: unknown): number {
  return Math.max(512, Math.min(65536, Math.floor(Number(value) || 4096)));
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.LAUNCHER.PLAY, (_e, options) => {
    if (!options || typeof options !== 'object') {
      return { ok: false, error: 'Некорректные параметры запуска' };
    }
    const o = options as Record<string, unknown>;
    const sanitized = {
      ...o,
      username: typeof o.username === 'string' ? o.username : 'Player',
      memory: clampMemory(o.memory),
    };
    return launcher.play(sanitized as Parameters<typeof launcher.play>[0]);
  });
  ipcMain.handle(IPC.LAUNCHER.GET_STATUS, () => launcher.getStatus());
  ipcMain.handle(IPC.LAUNCHER.CANCEL, () => launcher.cancel());

  ipcMain.handle(IPC.AUTH.LOGIN, (_e, creds) => {
    const username = typeof creds === 'string'
      ? creds
      : creds && typeof creds === 'object' && typeof (creds as { username?: unknown }).username === 'string'
        ? (creds as { username: string }).username
        : 'Player';
    return auth.login(username);
  });
  ipcMain.handle(IPC.AUTH.LOGOUT, () => auth.logout());
  ipcMain.handle(IPC.AUTH.GET_USER, () => auth.getUser());

  ipcMain.handle(IPC.JAVA.DETECT, () => java.detect());
  ipcMain.handle(IPC.JAVA.INSTALL, () => java.install());

  ipcMain.handle(IPC.NEWS.GET_ALL, () => news.getAll());

  ipcMain.handle(IPC.SERVER.GET_STATUS, () => launcher.getServerStatus());
  ipcMain.handle(IPC.SERVER.GET_INFO, () => launcher.getServerInfo());

  ipcMain.handle(IPC.SETTINGS.GET, () => settings.get());
  ipcMain.handle(IPC.SETTINGS.SET, (_e, s) => {
    if (!s || typeof s !== 'object') return settings.get();
    const obj = s as Record<string, unknown>;
    if ('memory' in obj) obj.memory = clampMemory(obj.memory);
    return settings.set(obj as Parameters<typeof settings.set>[0]);
  });
  ipcMain.handle(IPC.SETTINGS.GET_SYSTEM_MEMORY, () => Math.floor(os.totalmem() / (1024 * 1024)));
  ipcMain.handle(IPC.SETTINGS.RESET, () => settings.reset());
  ipcMain.handle(IPC.SETTINGS.PICK_JAVA, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Выберите java(w).exe' });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle(IPC.SETTINGS.VERIFY_JAVA, (_e, p: { path?: unknown }) =>
    new Promise<{ ok: boolean; version?: string; error?: string }>((resolve) => {
      if (!p || typeof p.path !== 'string') {
        resolve({ ok: false, error: 'Некорректный путь' });
        return;
      }
      const base = path.basename(p.path).toLowerCase();
      if (!['java', 'javaw', 'java.exe', 'javaw.exe'].includes(base)) {
        resolve({ ok: false, error: 'Путь должен указывать на java(w)' });
        return;
      }
      const proc = spawn(p.path, ['-version']);
      let out = '';
      let settled = false;
      const finish = (r: { ok: boolean; version?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(r);
      };
      const timer = setTimeout(() => {
        proc.kill();
        finish({ ok: false, error: 'Проверка Java зависла (таймаут)' });
      }, 10000);
      proc.stderr.on('data', (d) => (out += d.toString()));
      proc.on('close', () => {
        if (JavaService.isJava21Plus(out)) {
          finish({ ok: true, version: out.match(/version "([^"]+)"/)?.[1] ?? '21+' });
        } else {
          finish({ ok: false, error: 'Не Java 21+ или неверный путь' });
        }
      });
      proc.on('error', () => finish({ ok: false, error: 'Файл не запускается' }));
    }));

  ipcMain.handle(IPC.UPDATER.CHECK, () => updater.check());
  ipcMain.handle(IPC.UPDATER.INSTALL, () => updater.installNow());

  ipcMain.handle(IPC.SHELL.OPEN_EXTERNAL, (_e, url: string) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') return shell.openExternal(url);
    } catch {
      /* ignore invalid url */
    }
  });

  ipcMain.handle('account:bootstrap', async () => {
    const stored = await account.loadStored();
    if (!stored) return { status: 'guest' as const };
    try {
      const user = await account.me(stored.token);
      await account.saveStored({ token: stored.token, user });
      return { status: 'authed' as const, user };
    } catch {
      await account.clearStored();
      return { status: 'guest' as const };
    }
  });

  const accountWrap = async (fn: () => Promise<unknown>) => {
    try { return { ok: true as const, data: await fn() }; }
    catch (e) {
      const err = e instanceof AccountApiError
        ? { code: e.code, message: e.message }
        : { code: 'unknown', message: 'Ошибка' };
      return { ok: false as const, error: err };
    }
  };

  ipcMain.handle('account:register', (_e, p: { username: string; email: string; password: string }) =>
    accountWrap(() => account.register(p.username, p.email, p.password)));

  ipcMain.handle('account:verify', (_e, p: { email: string; code: string }) =>
    accountWrap(async () => {
      const session = await account.verifyEmail(p.email, p.code);
      await account.saveStored(session);
      return session.user;
    }));

  ipcMain.handle('account:resend', (_e, p: { email: string }) => accountWrap(() => account.resendCode(p.email)));

  ipcMain.handle('account:login', (_e, p: { login: string; password: string }) =>
    accountWrap(async () => {
      const session = await account.login(p.login, p.password);
      await account.saveStored(session);
      return session.user;
    }));

  ipcMain.handle('account:logout', async () => { await account.clearStored(); return { ok: true as const }; });
}
