import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers, updater, launcher, settings as settingsService } from './ipc/handlers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

let mainWindow: BrowserWindow | null = null;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
let lastUpdateCheck = 0;

// Window-focus can fire often; one update check per 15 min is plenty and keeps us
// from hammering the update feed when the user alt-tabs back and forth.
const UPDATE_CHECK_THROTTLE_MS = 15 * 60 * 1000;

function runUpdateCheck(): void {
  const now = Date.now();
  if (now - lastUpdateCheck < UPDATE_CHECK_THROTTLE_MS) return;
  lastUpdateCheck = now;
  updater.check().catch(() => {});
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
  'https://vibestudy.ru',
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
  createWindow();
  if (mainWindow) {
    updater.attach(mainWindow);
    launcher.attach(mainWindow);
    settingsService.get().then((s) => {
      if (!s.autoUpdate) return;
      setTimeout(() => { runUpdateCheck(); }, 4000);
      updateCheckInterval = setInterval(() => { runUpdateCheck(); }, 1000 * 60 * 30);
      // Re-check when the launcher regains focus — e.g. after the game closes and the
      // user returns — so a freshly published build is caught without waiting up to
      // 30 min for the next interval. runUpdateCheck throttles repeated focus events.
      mainWindow?.on('focus', () => runUpdateCheck());
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
