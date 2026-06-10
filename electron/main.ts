import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers, updater, launcher, settings as settingsService } from './ipc/handlers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

let mainWindow: BrowserWindow | null = null;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1140,
    minHeight: 720,
    frame: false,
    transparent: false,
    resizable: true,
    backgroundColor: '#070707',
    title: 'NATUX WORLD',
    icon: path.join(process.env.APP_ROOT ?? '', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('app:ready', { version: app.getVersion() });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') shell.openExternal(url);
    } catch {
      /* ignore invalid url */
    }
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  registerWindowControls(mainWindow);
}

let windowControlsRegistered = false;

function registerWindowControls(win: BrowserWindow): void {
  if (!windowControlsRegistered) {
    const resolve = (e: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
      BrowserWindow.fromWebContents(e.sender);

    ipcMain.handle('window:minimize', (e) => resolve(e)?.minimize());
    ipcMain.handle('window:maximize', (e) => {
      const w = resolve(e);
      if (!w) return;
      if (w.isMaximized()) w.unmaximize();
      else w.maximize();
    });
    ipcMain.handle('window:close', (e) => resolve(e)?.close());
    ipcMain.handle('window:isMaximized', (e) => resolve(e)?.isMaximized() ?? false);
    windowControlsRegistered = true;
  }

  win.on('maximize', () => win.webContents.send('window:maximized', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized', false));
}

app.whenReady().then(() => {
  ipcMain.handle('app:version', () => app.getVersion());
  registerIpcHandlers();
  createWindow();
  if (mainWindow) {
    updater.attach(mainWindow);
    launcher.attach(mainWindow);
    settingsService.get().then((s) => {
      if (s.autoUpdate) {
        setTimeout(() => { updater.check().catch(() => {}); }, 4000);
        updateCheckInterval = setInterval(() => { updater.check().catch(() => {}); }, 1000 * 60 * 30);
      }
    }).catch(() => {});
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
});

app.on('window-all-closed', () => {
  mainWindow = null;
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
