import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AccountResult,
  AccountUser,
  BootstrapResult,
  Credentials,
  DiagnosticCheck,
  JavaInstallation,
  LauncherLog,
  LauncherSettings,
  LaunchProgress,
  LoginOutcome,
  NatuxAPI,
  NewsItem,
  PlayOptions,
  PlaytimeStats,
  ServerInfo,
  ServerStatus,
  UpdateEvent,
  UpdateInfo,
  User,
} from '../types/native';

type Listener<T> = (value: T) => void;

const eventListeners = {
  maximized: new Set<Listener<boolean>>(),
  progress: new Set<Listener<LaunchProgress>>(),
  logs: new Set<Listener<LauncherLog[]>>(),
  update: new Set<Listener<UpdateEvent>>(),
  ready: new Set<Listener<{ version: string }>>(),
  trayLaunch: new Set<Listener<void>>(),
};

let initializationPromise: Promise<void> | null = null;
let lastReadyPayload: { version: string } | null = null;

function publish<T>(listeners: Set<Listener<T>>, value: T): void {
  for (const listener of [...listeners]) listener(value);
}

function subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>): () => void {
  listeners.add(listener);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    listeners.delete(listener);
  };
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A native command failed, including when that command is not implemented by the host yet. */
export class TauriCommandError extends Error {
  readonly command: string;
  readonly originalError: unknown;

  constructor(command: string, originalError: unknown) {
    super(`Native command "${command}" is unavailable or failed: ${describeFailure(originalError)}`);
    this.name = 'TauriCommandError';
    this.command = command;
    this.originalError = originalError;
  }
}

export class TauriEventBusInitializationError extends Error {
  readonly originalError: unknown;

  constructor(originalError: unknown) {
    super(`Could not initialize Tauri event listeners: ${describeFailure(originalError)}`);
    this.name = 'TauriEventBusInitializationError';
    this.originalError = originalError;
  }
}

function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args).catch((error: unknown) => {
    throw new TauriCommandError(command, error);
  });
}

function releaseListeners(unlisteners: UnlistenFn[]): void {
  for (const unlisten of unlisteners.reverse()) {
    try {
      unlisten();
    } catch {
      // Continue cleaning the remaining listeners if one native unlisten fails.
    }
  }
}

async function registerEventBus(): Promise<void> {
  const registered: UnlistenFn[] = [];
  try {
    // Keep the event names aligned with the existing Electron bridge contract.
    // Register every listener before acknowledging app readiness or starting a game.
    registered.push(await listen<boolean>('window:maximized', ({ payload }) => {
      publish(eventListeners.maximized, payload);
    }));
    registered.push(await listen<LaunchProgress>('launcher:progress', ({ payload }) => {
      publish(eventListeners.progress, payload);
    }));
    registered.push(await listen<LauncherLog[]>('launcher:log', ({ payload }) => {
      publish(eventListeners.logs, payload);
    }));
    registered.push(await listen<UpdateEvent>('updater:event', ({ payload }) => {
      publish(eventListeners.update, payload);
    }));
    registered.push(await listen<{ version: string }>('app:ready', ({ payload }) => {
      lastReadyPayload = payload;
      publish(eventListeners.ready, payload);
    }));
    registered.push(await listen<void>('tray:launch-request', () => {
      publish(eventListeners.trayLaunch, undefined);
    }));
    await invokeCommand<void>('app_ready');
  } catch (error) {
    releaseListeners(registered);
    throw new TauriEventBusInitializationError(error);
  }
}

/**
 * Prepare the shared native event bus before rendering UI that subscribes to
 * progress, logs, update state, or window events. Repeated calls share one startup.
 */
export function initializeTauriBridge(): Promise<void> {
  if (initializationPromise) return initializationPromise;

  const pending = registerEventBus();
  initializationPromise = pending;
  void pending.catch(() => {
    if (initializationPromise === pending) initializationPromise = null;
  });
  return pending;
}

export function createTauriBridge(): NatuxAPI {
  return {
    getVersion: () => invokeCommand<string>('get_version'),
    window: {
      minimize: () => invokeCommand<void>('window_minimize'),
      maximize: () => invokeCommand<void>('window_maximize'),
      close: () => invokeCommand<void>('window_close'),
      isMaximized: () => invokeCommand<boolean>('window_is_maximized'),
      onMaximizedChange: (callback) => subscribe(eventListeners.maximized, callback),
    },
    launcher: {
      play: async (options: PlayOptions) => {
        await initializeTauriBridge();
        return invokeCommand<{ ok: boolean; error?: string }>('launcher_play', { options });
      },
      getStatus: () => invokeCommand<LaunchProgress>('launcher_get_status'),
      cancel: () => invokeCommand<void>('launcher_cancel'),
      onProgress: (callback) => subscribe(eventListeners.progress, callback),
      onLog: (callback) => subscribe(eventListeners.logs, callback),
    },
    auth: {
      login: (credentials: Credentials) => invokeCommand<User>('auth_login', { credentials }),
      logout: () => invokeCommand<void>('auth_logout'),
      getUser: () => invokeCommand<User | null>('auth_get_user'),
    },
    java: {
      detect: () => invokeCommand<JavaInstallation | null>('java_detect'),
      install: () => invokeCommand<JavaInstallation>('java_install'),
    },
    news: {
      getAll: () => invokeCommand<NewsItem[]>('news_get_all'),
    },
    server: {
      getStatus: () => invokeCommand<ServerStatus>('server_get_status'),
      getInfo: () => invokeCommand<ServerInfo>('server_get_info'),
    },
    settings: {
      get: () => invokeCommand<LauncherSettings>('settings_get'),
      set: (settings: Partial<LauncherSettings>) =>
        invokeCommand<LauncherSettings>('settings_set', { settings }),
      getSystemMemory: () => invokeCommand<number>('settings_get_system_memory'),
      reset: () => invokeCommand<LauncherSettings>('settings_reset'),
      pickJava: () => invokeCommand<string | null>('settings_pick_java'),
      verifyJava: (request: { path: string }) =>
        invokeCommand<{ ok: boolean; version?: string; error?: string }>('settings_verify_java', { request }),
    },
    updater: {
      check: () => invokeCommand<UpdateInfo>('updater_check'),
      install: () => invokeCommand<void>('updater_install'),
      onUpdate: (callback) => subscribe(eventListeners.update, callback),
    },
    shell: {
      openExternal: (url: string) => invokeCommand<void>('shell_open_external', { url }),
      openScreenshots: () => invokeCommand<{ ok: boolean; error?: string }>('shell_open_screenshots'),
      diagnosticsRun: () => invokeCommand<DiagnosticCheck[]>('shell_diagnostics_run'),
      playtimeGet: () => invokeCommand<PlaytimeStats>('shell_playtime_get'),
    },
    app: {
      onReady: (callback) => {
        const unsubscribe = subscribe(eventListeners.ready, callback);
        if (lastReadyPayload) callback(lastReadyPayload);
        return unsubscribe;
      },
      onTrayLaunchRequest: (callback) => subscribe(eventListeners.trayLaunch, callback),
    },
    account: {
      bootstrap: () => invokeCommand<BootstrapResult>('account_bootstrap'),
      register: (request: { username: string; email: string; password: string }) =>
        invokeCommand<AccountResult<void>>('account_register', { request }),
      verify: (request: { email: string; code: string }) =>
        invokeCommand<AccountResult<AccountUser>>('account_verify', { request }),
      resend: (request: { email: string }) =>
        invokeCommand<AccountResult<void>>('account_resend', { request }),
      login: (request: { login: string; password: string }) =>
        invokeCommand<AccountResult<LoginOutcome>>('account_login', { request }),
      login2fa: (request: { challenge: string; code: string }) =>
        invokeCommand<AccountResult<{ twoFactor: false; user: AccountUser }>>('account_login_2fa', { request }),
      twoFactorSetup: (request?: { code?: string }) =>
        invokeCommand<AccountResult<{ otpauthUri: string; qr: string }>>(
          'account_two_factor_setup',
          { request: request ?? {} },
        ),
      twoFactorEnable: (request: { code: string }) =>
        invokeCommand<AccountResult<{ ok: boolean; backupCodes: string[] }>>('account_two_factor_enable', { request }),
      logout: () => invokeCommand<{ ok: boolean; error?: string }>('account_logout'),
      logoutGlobal: () => invokeCommand<{ ok: boolean; error?: string }>('account_logout_global'),
    },
  };
}
