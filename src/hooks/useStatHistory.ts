import { useEffect, useRef, useState } from 'react';
import type { ServerStatus } from '../../electron/services/LauncherService';

export interface StatHistory {
  players: number[];
  tps: number[];
  ping: number[];
  online: number[];
}

const MAX_POINTS = 24;

function push(arr: number[], v: number): number[] {
  const next = [...arr, v];
  return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
}

/**
 * Accumulates a rolling window of real server stats over time.
 * Each new poll from useServerStatus appends one point per metric,
 * so the sparklines reflect actual history instead of random noise.
 */
export function useStatHistory(status: ServerStatus | null): StatHistory {
  const [history, setHistory] = useState<StatHistory>({
    players: [],
    tps: [],
    ping: [],
    online: [],
  });
  // Dedupe by poll identity (the status object reference), not the ping value:
  // useServerStatus hands us a fresh object every successful poll, so each poll
  // appends one point even when the ping happens to be identical between polls.
  const lastStatus = useRef<ServerStatus | null>(null);

  useEffect(() => {
    if (!status) return;
    if (lastStatus.current === status) return;
    lastStatus.current = status;
    setHistory((h) => ({
      players: push(h.players, status.players),
      tps: push(h.tps, status.tps),
      ping: push(h.ping, status.ping),
      online: push(h.online, status.online ? 1 : 0),
    }));
  }, [status]);

  return history;
}

/** Repeats a single value so a fresh chart renders a flat line instead of empty. */
export function seed(value: number, history: number[]): number[] {
  return history.length > 1 ? history : [value, value];
}
