import { useEffect, useState } from 'react';
import { bridge } from '../services/electron-bridge';
import type { ServerStatus, ServerInfo } from '../../electron/services/LauncherService';

export function useServerStatus(refreshMs = 30000): { status: ServerStatus | null; info: ServerInfo | null } {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [info, setInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, i] = await Promise.all([bridge.server.getStatus(), bridge.server.getInfo()]);
        if (!cancelled) {
          setStatus(s);
          setInfo(i);
        }
      } catch {
        // Server unreachable: surface an offline status instead of letting the
        // rejection bubble up as an unhandled promise rejection every poll.
        if (!cancelled) {
          setStatus({ online: false, players: 0, maxPlayers: 0, ping: 0, tps: 0 });
        }
      }
    };
    load();
    const id = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshMs]);

  return { status, info };
}
