import { contextBridge, ipcRenderer } from 'electron';

const api = {
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
    onProgress: (cb: (progress: unknown) => void) => {
      const listener = (_e: unknown, p: unknown) => cb(p);
      ipcRenderer.on('launcher:progress', listener);
      return () => ipcRenderer.removeListener('launcher:progress', listener);
    },
  },
  auth: {
    login: (credentials: unknown) => ipcRenderer.invoke('auth:login', credentials),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
  },
  java: {
    detect: () => ipcRenderer.invoke('java:detect'),
    install: (version: string) => ipcRenderer.invoke('java:install', version),
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
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onUpdate: (cb: (info: unknown) => void) => {
      const listener = (_e: unknown, info: unknown) => cb(info);
      ipcRenderer.on('updater:event', listener);
      return () => ipcRenderer.removeListener('updater:event', listener);
    },
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  app: {
    onReady: (cb: (data: { version: string }) => void) => {
      const listener = (_e: unknown, data: { version: string }) => cb(data);
      ipcRenderer.on('app:ready', listener);
      return () => ipcRenderer.removeListener('app:ready', listener);
    },
  },
};

contextBridge.exposeInMainWorld('natux', api);

export type NatuxAPI = typeof api;
