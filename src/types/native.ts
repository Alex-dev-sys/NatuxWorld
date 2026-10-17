/**
 * Renderer-facing contract shared by the UI and whichever native shell hosts it.
 * Keep this file independent from Electron and service implementation modules.
 */

export interface ServerStatus {
  online: boolean;
  players: number;
  maxPlayers: number;
  ping: number;
  tps: number;
}

export interface ServerInfo {
  ip: string;
  version: string;
  mode: string;
  map: string;
  difficulty: string;
  whitelist: boolean;
  tps: number;
  ping: number;
}

export type Stage =
  | 'idle'
  | 'resolving'
  | 'java-check'
  | 'libraries'
  | 'assets'
  | 'natives-extract'
  | 'forge-install'
  | 'spawn'
  | 'running'
  | 'error';

export interface LaunchProgress {
  stage: Stage;
  progress: number;
  message: string;
  detail?: string;
}

/** Options the renderer may send to the host when it starts Minecraft. */
export interface PlayOptions {
  version: string;
  loader?: 'forge' | 'fabric' | 'neoforge' | 'vanilla';
  username: string;
  memory: number;
  /** When set, the game connects straight to this server on launch (quick play). */
  server?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  body: string;
  image: string;
  date: string;
  category: 'update' | 'event' | 'donate' | 'wipe';
}

export interface User {
  uuid: string;
  username: string;
  accessToken: string;
  type: 'offline';
}

export interface Credentials {
  username: string;
  type?: 'offline' | 'microsoft';
}

export interface JavaInstallation {
  version: string;
  vendor: 'Temurin' | 'system';
  path: string;
}

export interface LauncherSettings {
  memory: number;
  fullscreen: boolean;
  closeOnLaunch: boolean;
  language: 'ru' | 'en';
  javaPath?: string;
  jvmArgs: string;
  resolution: { width: number; height: number };
  javaMode: 'bundled' | 'custom';
  autoUpdate: boolean;
  autoLaunch: boolean;
  crashReports: boolean;
  onboardingCompleted: boolean;
  minimizeToTray: boolean;
  launchOnStartup: boolean;
  /** Host capability; portable distributions do not register OS startup. */
  startupSupported?: boolean;
  updateChannel: 'stable' | 'beta';
  telemetryEnabled: boolean;
  installId: string;
}

export interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  url?: string;
  error?: string;
}

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; notes?: string }
  | { type: 'tauri-migration'; version: string; url: string }
  | { type: 'manual'; version: string; notes?: string; url: string }
  | { type: 'not-available'; version: string }
  | { type: 'progress'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string };

export interface AccountUser {
  id: string;
  username: string;
  email: string;
  twoFactorEnabled?: boolean;
  twoFactorMethod?: string | null;
}

export interface DiagnosticCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface PlaytimeSession {
  start: number;
  end: number;
}

export interface PlaytimeStats {
  totalMs: number;
  sessions: PlaytimeSession[];
  lastSession: PlaytimeSession | null;
  inGame: boolean;
}

export type AccountResult<T> =
  | { ok: true; data: T; sessionPersisted?: false }
  | { ok: false; error: { code: string; message: string } };

export type BootstrapResult =
  | { status: 'guest' }
  | { status: 'authed'; user: AccountUser; sessionPersisted?: false }
  // Session kept, server unreachable — retryable, NOT a sign-out.
  | { status: 'offline'; user: AccountUser; error: string; sessionPersisted?: false };

export type LoginOutcome =
  | { twoFactor: false; user: AccountUser }
  | { twoFactor: true; method: string | null; challenge: string };

export interface LauncherLog {
  stream: string;
  line: string;
}

export interface NatuxAPI {
  getVersion: () => Promise<string>;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (cb: (val: boolean) => void) => () => void;
  };
  launcher: {
    play: (options: PlayOptions) => Promise<{ ok: boolean; error?: string }>;
    getStatus: () => Promise<LaunchProgress>;
    cancel: () => Promise<void>;
    onProgress: (cb: (progress: LaunchProgress) => void) => () => void;
    onLog: (cb: (lines: LauncherLog[]) => void) => () => void;
  };
  auth: {
    login: (credentials: Credentials) => Promise<User>;
    logout: () => Promise<void>;
    getUser: () => Promise<User | null>;
  };
  java: {
    detect: () => Promise<JavaInstallation | null>;
    install: () => Promise<JavaInstallation>;
  };
  news: {
    getAll: () => Promise<NewsItem[]>;
  };
  server: {
    getStatus: () => Promise<ServerStatus>;
    getInfo: () => Promise<ServerInfo>;
  };
  settings: {
    get: () => Promise<LauncherSettings>;
    set: (settings: Partial<LauncherSettings>) => Promise<LauncherSettings>;
    getSystemMemory: () => Promise<number>;
    reset: () => Promise<LauncherSettings>;
    pickJava: () => Promise<string | null>;
    verifyJava: (request: { path: string }) => Promise<{ ok: boolean; version?: string; error?: string }>;
  };
  updater: {
    check: () => Promise<UpdateInfo>;
    install: () => Promise<void>;
    onUpdate: (cb: (event: UpdateEvent) => void) => () => void;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    openScreenshots: () => Promise<{ ok: boolean; error?: string }>;
    diagnosticsRun: () => Promise<DiagnosticCheck[]>;
    playtimeGet: () => Promise<PlaytimeStats>;
  };
  app: {
    onReady: (cb: (data: { version: string }) => void) => () => void;
    onTrayLaunchRequest: (cb: () => void) => () => void;
  };
  account: {
    bootstrap: () => Promise<BootstrapResult>;
    register: (request: { username: string; email: string; password: string }) => Promise<AccountResult<void>>;
    verify: (request: { email: string; code: string }) => Promise<AccountResult<AccountUser>>;
    resend: (request: { email: string }) => Promise<AccountResult<void>>;
    login: (request: { login: string; password: string }) => Promise<AccountResult<LoginOutcome>>;
    login2fa: (request: { challenge: string; code: string }) =>
      Promise<AccountResult<{ twoFactor: false; user: AccountUser }>>;
    twoFactorSetup: (request?: { code?: string }) => Promise<AccountResult<{ otpauthUri: string; qr: string }>>;
    twoFactorEnable: (request: { code: string }) =>
      Promise<AccountResult<{ ok: boolean; backupCodes: string[] }>>;
    logout: () => Promise<{ ok: boolean; error?: string }>;
    logoutGlobal: () => Promise<{ ok: boolean; error?: string }>;
  };
}
