import { ipcMain, shell } from 'electron';
import { IPC } from './channels';
import { LauncherService } from '../services/LauncherService';
import { JavaService } from '../services/JavaService';
import { AuthService } from '../services/AuthService';
import { NewsService } from '../services/NewsService';
import { SettingsService } from '../services/SettingsService';
import { UpdateService } from '../services/UpdateService';

const launcher = new LauncherService();
const java = new JavaService();
const auth = new AuthService();
const news = new NewsService();
const settings = new SettingsService();
const updater = new UpdateService();

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.LAUNCHER.PLAY, (_e, options) => launcher.play(options));
  ipcMain.handle(IPC.LAUNCHER.GET_STATUS, () => launcher.getStatus());

  ipcMain.handle(IPC.AUTH.LOGIN, (_e, creds) => auth.login(creds));
  ipcMain.handle(IPC.AUTH.LOGOUT, () => auth.logout());
  ipcMain.handle(IPC.AUTH.GET_USER, () => auth.getUser());

  ipcMain.handle(IPC.JAVA.DETECT, () => java.detect());
  ipcMain.handle(IPC.JAVA.INSTALL, (_e, version) => java.install(version));

  ipcMain.handle(IPC.NEWS.GET_ALL, () => news.getAll());

  ipcMain.handle(IPC.SERVER.GET_STATUS, () => launcher.getServerStatus());
  ipcMain.handle(IPC.SERVER.GET_INFO, () => launcher.getServerInfo());

  ipcMain.handle(IPC.SETTINGS.GET, () => settings.get());
  ipcMain.handle(IPC.SETTINGS.SET, (_e, s) => settings.set(s));

  ipcMain.handle(IPC.UPDATER.CHECK, () => updater.check());

  ipcMain.handle(IPC.SHELL.OPEN_EXTERNAL, (_e, url: string) => shell.openExternal(url));
}
