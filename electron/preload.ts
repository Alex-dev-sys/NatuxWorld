import { contextBridge, ipcRenderer } from 'electron';
import type { LaunchProgress, LauncherLog, NatuxAPI, UpdateEvent } from '../src/types/native';

const api: NatuxAPI = {
  getVersion: () => ipcRenderer.invoke('app:version'),
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (cb: (isMaximized: boolean) => void) => {
      const listener = (_e: unknown, val: boolean) => cb(val);
      ipcRenderer.on('window:maximized', listener);
      return () => ipcRenderer.removeListener('window:maximized', listener);
    },
  },
  launcher: {
    play: (options: unknown) => ipcRenderer.invoke('launcher:play', options),
    getStatus: () => ipcRenderer.invoke('launcher:getStatus'),
    cancel: () => ipcRenderer.invoke('launcher:cancel'),
    onProgress: (cb) => {
      const listener = (_e: unknown, p: LaunchProgress) => cb(p);
      ipcRenderer.on('launcher:progress', listener);
      return () => ipcRenderer.removeListener('launcher:progress', listener);
    },
    onLog: (cb) => {
      const listener = (_e: unknown, lines: LauncherLog[]) => cb(lines);
      ipcRenderer.on('launcher:log', listener);
      return () => ipcRenderer.removeListener('launcher:log', listener);
    },
  },
  auth: {
    login: (credentials: unknown) => ipcRenderer.invoke('auth:login', credentials),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
  },
  java: {
    detect: () => ipcRenderer.invoke('java:detect'),
    install: () => ipcRenderer.invoke('java:install'),
  },
  news: {
    getAll: () => ipcRenderer.invoke('news:getAll'),
  },
  server: {
    getStatus: () => ipcRenderer.invoke('server:getStatus'),
    getInfo: () => ipcRenderer.invoke('server:getInfo'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings: unknown) => ipcRenderer.invoke('settings:set', settings),
    getSystemMemory: () => ipcRenderer.invoke('settings:getSystemMemory'),
    reset: () => ipcRenderer.invoke('settings:reset'),
    pickJava: () => ipcRenderer.invoke('settings:pickJava'),
    verifyJava: (p: { path: string }) => ipcRenderer.invoke('settings:verifyJava', p),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onUpdate: (cb) => {
      const listener = (_e: unknown, info: UpdateEvent) => cb(info);
      ipcRenderer.on('updater:event', listener);
      return () => ipcRenderer.removeListener('updater:event', listener);
    },
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    openScreenshots: () => ipcRenderer.invoke('shell:openScreenshots'),
    diagnosticsRun: () => ipcRenderer.invoke('diagnostics:run'),
    playtimeGet: () => ipcRenderer.invoke('playtime:get'),
  },
  account: {
    bootstrap: () => ipcRenderer.invoke('account:bootstrap'),
    register: (p: unknown) => ipcRenderer.invoke('account:register', p),
    verify: (p: unknown) => ipcRenderer.invoke('account:verify', p),
    resend: (p: unknown) => ipcRenderer.invoke('account:resend', p),
    login: (p: unknown) => ipcRenderer.invoke('account:login', p),
    login2fa: (p: unknown) => ipcRenderer.invoke('account:login2fa', p),
    twoFactorSetup: (p?: unknown) => ipcRenderer.invoke('account:2faSetup', p),
    twoFactorEnable: (p: unknown) => ipcRenderer.invoke('account:2faEnable', p),
    logout: () => ipcRenderer.invoke('account:logout'),
    logoutGlobal: () => ipcRenderer.invoke('account:logoutGlobal'),
  },
  app: {
    onReady: (cb: (data: { version: string }) => void) => {
      const listener = (_e: unknown, data: { version: string }) => cb(data);
      ipcRenderer.on('app:ready', listener);
      return () => ipcRenderer.removeListener('app:ready', listener);
    },
    onTrayLaunchRequest: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('tray:launch-request', listener);
      return () => ipcRenderer.removeListener('tray:launch-request', listener);
    },
  },
};

contextBridge.exposeInMainWorld('natux', api);

export type { NatuxAPI };
