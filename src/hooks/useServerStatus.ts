import { useEffect, useState } from 'react';
import { bridge } from '../services/electron-bridge';
import type { ServerStatus, ServerInfo } from '../../electron/services/LauncherService';

export function useServerStatus(refreshMs = 30000): { status: ServerStatus | null; info: ServerInfo | null } {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [info, setInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [s, i] = await Promise.all([bridge.server.getStatus(), bridge.server.getInfo()]);
      if (!cancelled) {
        setStatus(s);
        setInfo(i);
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
