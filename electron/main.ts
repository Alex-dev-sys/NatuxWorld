import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell, Menu, Tray, nativeImage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { failClosedOnLockLoss, NativeLockService, type NativeLockLease } from './services/NativeLockService';
import { rendererContentType, resolveRendererFile } from './utils/renderer-protocol';
import { BRAND } from '../brand.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
const APP_SCHEME = 'app';
const APP_HOST = 'launcher';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const APP_INDEX_URL = `${APP_ORIGIN}/index.html`;
const nativeLocks = new NativeLockService();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

type IpcModule = typeof import('./ipc/handlers');
type PlaytimeModule = typeof import('./services/PlaytimeService');
type DiscordModule = typeof import('./services/DiscordRpcService');
let startupServices: (Pick<IpcModule, 'registerIpcHandlers' | 'updater' | 'launcher' | 'settings'> & {
  playtime: PlaytimeModule['playtime'];
  discordRpc: DiscordModule['discordRpc'];
}) | null = null;
let profileLock: NativeLockLease | null = null;
let stopProfileLockLossWatch: (() => void) | null = null;
let profileReleaseStarted = false;
let shutdownServicesClosed = false;
let startupReady = false;
let pendingSecondInstance = false;

// Register before app readiness so the packaged renderer gets a secure,
// standard origin while the file protocol remains without extra privileges.
protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

let mainWindow: BrowserWindow | null = null;
let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
let tray: Tray | null = null;
let trayReady = false;
let quitting = false;

/** Window icon as a nativeImage for tray/menu use (falls back to empty image). */
function appIcon(): Electron.NativeImage {
  try {
    return nativeImage.createFromPath(path.join(process.env.APP_ROOT ?? '', 'build', 'icon.png'));
  } catch {
    return nativeImage.createEmpty();
  }
}

async function serveRendererRequest(request: Request): Promise<Response> {
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  const filePath = resolveRendererFile(RENDERER_DIST, request.url);
  if (!filePath) return new Response('Not Found', { status: 404 });
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return new Response('Not Found', { status: 404 });
    // Read through Electron's patched fs layer so files inside app.asar are
    // served without granting renderer-side file:// privileges.
    const body = await fs.readFile(filePath);
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': rendererContentType(filePath),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
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

function applyLoginItem(enabled: boolean, minimizeToTray: boolean): void {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      // Windows: start hidden ONLY when the tray icon will exist to bring the
      // window back. Without the tray (the default) a hidden window left the
      // launcher running with no way to reach it.
      args: enabled && minimizeToTray && process.platform === 'win32' ? ['--hidden'] : [],
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
      // Dev: same origin as the Vite dev server. Prod: the packaged app:// origin.
      isSameOrigin = VITE_DEV_SERVER_URL
        ? target.origin === new URL(VITE_DEV_SERVER_URL).origin
        : target.protocol === `${APP_SCHEME}:` && target.hostname === APP_HOST &&
          target.port === '' && target.username === '' && target.password === '';
    } catch {
      isSameOrigin = false;
    }
    if (!isSameOrigin) event.preventDefault();
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(APP_INDEX_URL);
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

// Strict policy for the packaged app:// build.
const PROD_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
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
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src ${CONNECT_SRC} ${devOrigin} ${wsOrigin}`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${devOrigin}`,
  ].join('; ');
}

app.on('second-instance', () => {
  if (startupReady) showMainWindow();
  else pendingSecondInstance = true;
});
if (!hasSingleInstanceLock) app.quit();

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;

  // This must be the first application-owned service operation: SettingsService,
  // auth, game services, and IPC are imported only after the shared profile lock.
  try {
    profileLock = await nativeLocks.acquire('profile');
    stopProfileLockLossWatch = failClosedOnLockLoss(profileLock, (error) => {
      console.error('Natux profile lock was lost; exiting immediately to prevent concurrent profile access:', error);
      // Do not run shutdown hooks: services cannot safely write profile state
      // after another process may have acquired the lock.
      app.exit(1);
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!quitting) dialog.showErrorBox(BRAND.name, `Не удалось безопасно открыть профиль лаунчера.\n\n${detail}`);
    app.quit();
    return;
  }

  if (quitting) {
    await profileLock.release().catch(() => undefined);
    stopProfileLockLossWatch?.();
    stopProfileLockLossWatch = null;
    profileLock = null;
    return;
  }

  try {
    const [ipcServices, playtimeModule, discordRpcModule] = await Promise.all([
      import('./ipc/handlers'),
      import('./services/PlaytimeService'),
      import('./services/DiscordRpcService'),
    ]);
    startupServices = {
      registerIpcHandlers: ipcServices.registerIpcHandlers,
      updater: ipcServices.updater,
      launcher: ipcServices.launcher,
      settings: ipcServices.settings,
      playtime: playtimeModule.playtime,
      discordRpc: discordRpcModule.discordRpc,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(BRAND.name, `Не удалось загрузить службы лаунчера.\n\n${detail}`);
    app.quit();
    return;
  }
  const services = startupServices;
  if (!services) {
    app.quit();
    return;
  }

  if (!VITE_DEV_SERVER_URL) protocol.handle(APP_SCHEME, serveRendererRequest);

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
  services.registerIpcHandlers();

  // Live re-apply of OS-integration settings (tray + autostart) when they change.
  services.settings.onDidChange((s) => {
    if (s.minimizeToTray) createTray();
    else destroyTray();
    applyLoginItem(s.launchOnStartup === true, s.minimizeToTray === true && trayReady);
  });

  createWindow();
  startupReady = true;
  if (pendingSecondInstance) {
    pendingSecondInstance = false;
    showMainWindow();
  }
  if (mainWindow) {
    services.updater.attach(mainWindow);
    services.launcher.attach(mainWindow);
    services.settings.get().then((s) => {
      if (s.minimizeToTray) createTray();
      // Tray creation can fail (Linux without a system tray, policy). Pass what
      // actually happened, not what was requested.
      applyLoginItem(s.launchOnStartup === true, s.minimizeToTray === true && trayReady);
      // Started with --hidden but no tray to restore from: show the window
      // rather than leaving an unreachable background process.
      if (!trayReady && process.argv.includes('--hidden')) showMainWindow();
      if (s.autoUpdate) {
        setTimeout(() => { services.updater.check().catch(() => {}); }, 4000);
        updateCheckInterval = setInterval(() => { services.updater.check().catch(() => {}); }, 1000 * 60 * 30);
      }
    }).catch(() => {});
    // One-shot self-integrity check against the signed manifest (non-blocking).
    setTimeout(() => { services.updater.checkSelfIntegrity().catch(() => {}); }, 8000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (mainWindow) {
        startupServices?.updater.attach(mainWindow);
        startupServices?.launcher.attach(mainWindow);
      }
    }
  });
});

app.on('before-quit', (event) => {
  quitting = true;
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  // Keep the profile locked until Electron has stopped using its settings and
  // services. Re-enter quit only after the helper confirms the OS lock is free.
  if (profileLock) {
    event.preventDefault();
    if (!profileReleaseStarted) {
      profileReleaseStarted = true;
      const lease = profileLock;
      const services = startupServices;
      void (async () => {
        if (!shutdownServicesClosed) {
          shutdownServicesClosed = true;
          await services?.playtime.endSession().catch(() => {});
          services?.discordRpc.destroy();
        }
        await lease.release().catch((error) => {
          console.error('Failed to release Natux profile lock:', error);
        });
        stopProfileLockLossWatch?.();
        stopProfileLockLossWatch = null;
        profileLock = null;
        app.quit();
      })();
    }
    return;
  }

  // Startup can fail before the lock helper is acquired; still close any
  // services that were already initialized before quitting.
  if (!shutdownServicesClosed) {
    shutdownServicesClosed = true;
    void startupServices?.playtime.endSession().catch(() => {});
    startupServices?.discordRpc.destroy();
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
