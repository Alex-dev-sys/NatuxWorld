import { app, BrowserWindow, ipcMain, session, shell, Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers, updater, launcher, settings as settingsService } from './ipc/handlers';
import * as discordRpcModule from './services/DiscordRpcService';
import * as playtimeModule from './services/PlaytimeService';
import { BRAND } from '../brand.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

let mainWindow: BrowserWindow | null = null;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
let tray: Tray | null = null;
let trayReady = false;
let quitting = false;
const discord = discordRpcModule.discordRpc;
const playtime = playtimeModule.playtime;

/** Window icon as a nativeImage for tray/menu use (falls back to empty image). */
function appIcon(): Electron.NativeImage {
  try {
    return nativeImage.createFromPath(path.join(process.env.APP_ROOT ?? '', 'build', 'icon.png'));
  } catch {
    return nativeImage.createEmpty();
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  if (trayReady || process.platform === 'darwin') return;
  try {
    tray = new Tray(appIcon());
    tray.setToolTip(BRAND.name);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Открыть', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: 'Запустить игру',
        click: () => {
          showMainWindow();
          mainWindow?.webContents.send('tray:launch-request');
        },
      },
      { type: 'separator' },
      { label: 'Выход', click: () => app.quit() },
    ]));
    tray.on('double-click', () => showMainWindow());
    trayReady = true;
  } catch {
    // Tray is a nice-to-have; never block startup over it.
  }
}

function destroyTray(): void {
  tray?.destroy();
  tray = null;
  trayReady = false;
}

function applyLoginItem(enabled: boolean): void {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      // Windows: hide the window on autostart (it lives in the tray).
      args: enabled && process.platform === 'win32' ? ['--hidden'] : [],
    });
  } catch {
    /* store restrictions etc. */
  }
}

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
    title: BRAND.name,
    icon: path.join(process.env.APP_ROOT ?? '', 'build', 'icon.png'),
    show: !process.argv.includes('--hidden'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Preload only touches contextBridge/ipcRenderer, so the renderer can run fully
      // sandboxed — a compromised page then has no Node access at all.
      sandbox: true,
    },
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('app:ready', { version: app.getVersion() });
  });

  // Close-to-tray: with the option enabled, the X button hides the window and the
  // launcher keeps running in the tray (game downloads / updates continue).
  mainWindow.on('close', (event) => {
    if (!quitting && trayReady && !mainWindow?.isDestroyed()) {
      event.preventDefault();
      mainWindow?.hide();
    }
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

  // Block top-level navigation away from the app origin. The renderer ships a privileged
  // preload, so a stray window.location to a remote site must never load in-window —
  // external links go through setWindowOpenHandler/openExternal instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let isSameOrigin = false;
    try {
      const target = new URL(url);
      // Dev: same origin as the Vite dev server. Prod: the file:// app bundle.
      isSameOrigin = VITE_DEV_SERVER_URL
        ? target.origin === new URL(VITE_DEV_SERVER_URL).origin
        : target.protocol === 'file:';
    } catch {
      isSameOrigin = false;
    }
    if (!isSameOrigin) event.preventDefault();
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

// Connect endpoints the app legitimately talks to (auth backend, Mojang/Forge, GitHub).
const CONNECT_SRC = [
  "'self'",
  BRAND.siteOrigin,
  'https://*.mojang.com',
  'https://*.minecraftforge.net',
  'https://piston-meta.mojang.com',
  'https://resources.download.minecraft.net',
  'https://*.githubusercontent.com',
  'https://api.github.com',
].join(' ');

// Strict policy for the packaged (file://) build.
const PROD_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https:",
  `connect-src ${CONNECT_SRC}`,
  "script-src 'self'",
].join('; ');

// Vite HMR needs inline/eval scripts and a ws: channel in dev, so relax those two
// directives only when running against the dev server. Prod stays strict.
function buildCsp(): string {
  if (!VITE_DEV_SERVER_URL) return PROD_CSP;
  const devOrigin = new URL(VITE_DEV_SERVER_URL).origin;
  const wsOrigin = devOrigin.replace(/^http/, 'ws');
  return [
    `default-src 'self' ${devOrigin}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: https:",
    `connect-src ${CONNECT_SRC} ${devOrigin} ${wsOrigin}`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${devOrigin}`,
  ].join('; ');
}

app.whenReady().then(() => {
  // Apply CSP to every response in both dev and prod (no meta tag in index.html).
  const csp = buildCsp();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  ipcMain.handle('app:version', () => app.getVersion());
  registerIpcHandlers();

  // Live re-apply of OS-integration settings (tray + autostart) when they change.
  settingsService.onDidChange((s) => {
    if (s.minimizeToTray) createTray();
    else destroyTray();
    applyLoginItem(s.launchOnStartup === true);
  });

  createWindow();
  if (mainWindow) {
    updater.attach(mainWindow);
    launcher.attach(mainWindow);
    settingsService.get().then((s) => {
      if (s.minimizeToTray) createTray();
      applyLoginItem(s.launchOnStartup === true);
      if (s.autoUpdate) {
        setTimeout(() => { updater.check().catch(() => {}); }, 4000);
        updateCheckInterval = setInterval(() => { updater.check().catch(() => {}); }, 1000 * 60 * 30);
      }
    }).catch(() => {});
    // One-shot self-integrity check against the signed manifest (non-blocking).
    setTimeout(() => { updater.checkSelfIntegrity().catch(() => {}); }, 8000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (mainWindow) {
        updater.attach(mainWindow);
        launcher.attach(mainWindow);
      }
    }
  });
});

app.on('before-quit', () => {
  quitting = true;
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  // Close any open play session and drop Discord presence on exit.
  void playtime.endSession().catch(() => {});
  discord.destroy();
});

app.on('window-all-closed', () => {
  mainWindow = null;
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
