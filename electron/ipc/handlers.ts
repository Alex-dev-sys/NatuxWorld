import { ipcMain, shell, dialog } from 'electron';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { IPC } from './channels';
import { LauncherService } from '../services/LauncherService';
import { JavaService } from '../services/JavaService';
import { AuthService } from '../services/AuthService';
import { NewsService } from '../services/NewsService';
import { SettingsService } from '../services/SettingsService';
import { UpdateService } from '../services/UpdateService';

export const launcher = new LauncherService();
const java = new JavaService();
const auth = new AuthService();
const news = new NewsService();
export const settings = new SettingsService();
export const updater = new UpdateService();

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.LAUNCHER.PLAY, (_e, options) => launcher.play(options));
  ipcMain.handle(IPC.LAUNCHER.GET_STATUS, () => launcher.getStatus());
  ipcMain.handle(IPC.LAUNCHER.CANCEL, () => launcher.cancel());

  ipcMain.handle(IPC.AUTH.LOGIN, (_e, creds) => auth.login(creds));
  ipcMain.handle(IPC.AUTH.LOGOUT, () => auth.logout());
  ipcMain.handle(IPC.AUTH.GET_USER, () => auth.getUser());

  ipcMain.handle(IPC.JAVA.DETECT, () => java.detect());
  ipcMain.handle(IPC.JAVA.INSTALL, () => java.install());

  ipcMain.handle(IPC.NEWS.GET_ALL, () => news.getAll());

  ipcMain.handle(IPC.SERVER.GET_STATUS, () => launcher.getServerStatus());
  ipcMain.handle(IPC.SERVER.GET_INFO, () => launcher.getServerInfo());

  ipcMain.handle(IPC.SETTINGS.GET, () => settings.get());
  ipcMain.handle(IPC.SETTINGS.SET, (_e, s) => settings.set(s));
  ipcMain.handle(IPC.SETTINGS.GET_SYSTEM_MEMORY, () => Math.floor(os.totalmem() / (1024 * 1024)));
  ipcMain.handle(IPC.SETTINGS.RESET, () => settings.reset());
  ipcMain.handle(IPC.SETTINGS.PICK_JAVA, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], title: 'Выберите java(w).exe' });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle(IPC.SETTINGS.VERIFY_JAVA, (_e, p: { path: string }) =>
    new Promise<{ ok: boolean; version?: string; error?: string }>((resolve) => {
      const proc = spawn(p.path, ['-version']);
      let out = '';
      proc.stderr.on('data', (d) => (out += d.toString()));
      proc.on('close', () => {
        if (JavaService.isJava21Plus(out)) {
          resolve({ ok: true, version: out.match(/version "([^"]+)"/)?.[1] ?? '21+' });
        } else {
          resolve({ ok: false, error: 'Не Java 21+ или неверный путь' });
        }
      });
      proc.on('error', () => resolve({ ok: false, error: 'Файл не запускается' }));
    }));

  ipcMain.handle(IPC.UPDATER.CHECK, () => updater.check());
  ipcMain.handle(IPC.UPDATER.INSTALL, () => updater.installNow());

  ipcMain.handle(IPC.SHELL.OPEN_EXTERNAL, (_e, url: string) => shell.openExternal(url));
}
