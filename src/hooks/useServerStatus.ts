import { useEffect } from 'react';
import { create } from 'zustand';
import { bridge } from '../services/electron-bridge';
import type { ServerStatus, ServerInfo } from '../../electron/services/LauncherService';

interface ServerStatusState {
  status: ServerStatus | null;
  info: ServerInfo | null;
}

// Single shared store + one global poller. Sidebar, StatsCards and ServerInfo all use
// this hook; per-component intervals meant 3 components × 2 HTTP requests every 30s.
const useServerStatusStore = create<ServerStatusState>(() => ({ status: null, info: null }));

let pollerStarted = false;

async function poll(): Promise<void> {
  try {
    const [status, info] = await Promise.all([bridge.server.getStatus(), bridge.server.getInfo()]);
    useServerStatusStore.setState({ status, info });
  } catch {
    // Server unreachable: surface an offline status instead of letting the
    // rejection bubble up as an unhandled promise rejection every poll.
    useServerStatusStore.setState({ status: { online: false, players: 0, maxPlayers: 0, ping: 0, tps: 0 } });
  }
}

function ensurePoller(refreshMs: number): void {
  if (pollerStarted) return;
  pollerStarted = true;
  poll();
  setInterval(poll, refreshMs);
}

export function useServerStatus(refreshMs = 30000): ServerStatusState {
  useEffect(() => ensurePoller(refreshMs), [refreshMs]);
  return useServerStatusStore();
}
