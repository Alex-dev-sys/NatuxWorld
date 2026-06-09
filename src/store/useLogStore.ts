import { create } from 'zustand';
import { bridge } from '../services/electron-bridge';
import type { LauncherLog } from '../types/electron';

export interface LogLine {
  stream: string;
  line: string;
  ts: number;
}

const MAX_LINES = 5000;
let started = false;

interface LogState {
  lines: LogLine[];
  append: (l: LauncherLog) => void;
  clear: () => void;
  asText: () => string;
  startCapture: () => void;
}

export const useLogStore = create<LogState>((set, get) => ({
  lines: [],
  append: (l) =>
    set((s) => {
      const next = [...s.lines, { stream: l.stream, line: l.line, ts: Date.now() }];
      return { lines: next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next };
    }),
  clear: () => set({ lines: [] }),
  asText: () => get().lines.map((l) => `[${l.stream}] ${l.line}`).join('\n'),
  startCapture: () => {
    if (started) return;
    started = true;
    // Subscribe once for the whole app lifetime so crash output is captured
    // even when the Logs page isn't open.
    bridge.launcher.onLog((l) => get().append(l));
    // Mirror launcher errors / exit codes into the log so they end up in the report.
    bridge.launcher.onProgress((p) => {
      if (p.stage === 'error' || /упал|завершен/i.test(p.message)) {
        get().append({ stream: 'launcher', line: p.message });
      }
    });
  },
}));
