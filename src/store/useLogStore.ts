import { create } from 'zustand';
import { bridge } from '../services/electron-bridge';
import type { LauncherLog } from '../types/electron';

export interface LogLine {
  id: number;
  stream: string;
  line: string;
  ts: number;
}

const MAX_LINES = 5000;
let started = false;
// Monotonic counter for stable React keys — survives the sliding-window trim
// so rows aren't re-rendered when old lines drop off the top.
let nextId = 0;

interface LogState {
  lines: LogLine[];
  appendMany: (batch: LauncherLog[]) => void;
  clear: () => void;
  asText: () => string;
  startCapture: () => void;
}

export const useLogStore = create<LogState>((set, get) => ({
  lines: [],
  // One setState per batch (not per line) — Minecraft floods thousands of lines.
  appendMany: (batch) =>
    set((s) => {
      if (!batch.length) return s;
      const ts = Date.now();
      const next = [...s.lines, ...batch.map((l) => ({ id: nextId++, stream: l.stream, line: l.line, ts }))];
      return { lines: next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next };
    }),
  clear: () => set({ lines: [] }),
  asText: () => get().lines.map((l) => `[${l.stream}] ${l.line}`).join('\n'),
  startCapture: () => {
    if (started) return;
    started = true;
    // Subscribe once for the whole app lifetime so crash output is captured
    // even when the Logs page isn't open.
    bridge.launcher.onLog((batch) => get().appendMany(batch));
    // Mirror launcher errors / exit codes into the log so they end up in the report.
    bridge.launcher.onProgress((p) => {
      if (p.stage === 'error' || /упал|завершен/i.test(p.message)) {
        get().appendMany([{ stream: 'launcher', line: p.message }]);
      }
    });
  },
}));
