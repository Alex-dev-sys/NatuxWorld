import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Download, RefreshCw, X } from 'lucide-react';
import { bridge } from '../services/electron-bridge';
import type { UpdateEvent } from '../../electron/services/UpdateService';
import { useLang, pick } from '../i18n';

const ru = {
  update: 'Обновление',
  available: (v: string) => `v${v} доступна`,
  downloading: (v: string) => `Загрузка v${v}…`,
  ready: (v: string) => `v${v} готова к установке`,
  error: (message: string) => `Не удалось проверить обновление: ${message}`,
  install: 'Перезапустить и установить',
  download: 'Скачать с сайта',
};
const en: typeof ru = {
  update: 'Update',
  available: (v: string) => `v${v} available`,
  downloading: (v: string) => `Downloading v${v}…`,
  ready: (v: string) => `v${v} ready to install`,
  error: (message: string) => `Could not check for updates: ${message}`,
  install: 'Restart and install',
  download: 'Download from site',
};
const TR = { ru, en };

type State =
  | { phase: 'idle' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string }
  // macOS remains manual until Developer ID signing/notarization is configured.
  | { phase: 'manual'; version: string; url: string };

export function UpdateToast() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const t = pick(useLang(), TR);

  useEffect(() => {
    return bridge.updater.onUpdate((raw) => {
      const event = raw as UpdateEvent;
      setState((prev) => {
        switch (event.type) {
          case 'available':
            return { phase: 'available', version: event.version };
          case 'manual':
            setDismissed(false);
            return { phase: 'manual', version: event.version, url: event.url };
          case 'progress':
            return {
              phase: 'downloading',
              version: prev.phase === 'idle' ? '' : (prev as { version: string }).version,
              percent: Math.round(event.percent),
            };
          case 'downloaded':
            // Re-show the toast for the "ready to install" notification even if the
            // earlier "available" toast was dismissed this session.
            setDismissed(false);
            return { phase: 'ready', version: event.version };
          case 'error':
            setDismissed(false);
            return { phase: 'error', message: event.message };
          case 'not-available':
            return { phase: 'idle' };
          default:
            return prev;
        }
      });
    });
  }, []);

  if (dismissed || state.phase === 'idle') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ duration: 0.3, ease: [0.22, 0.8, 0.36, 1] }}
        className="fixed bottom-16 right-5 z-50 w-[320px] overflow-hidden rounded-2xl glass-strong shadow-premium"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

        <div className="flex items-start gap-3 p-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
            {state.phase === 'downloading' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : state.phase === 'error' ? (
              <AlertTriangle className="h-4 w-4 text-red-400" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {t.update}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white">
              {state.phase === 'available' && t.available(state.version)}
              {state.phase === 'downloading' && t.downloading(state.version)}
              {state.phase === 'ready' && t.ready(state.version)}
              {state.phase === 'manual' && t.available(state.version)}
              {state.phase === 'error' && t.error(state.message)}
            </div>
            {state.phase === 'downloading' && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full bg-play-gradient shadow-glow"
                  initial={{ width: 0 }}
                  animate={{ width: `${state.percent}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            )}
            {state.phase === 'ready' && (
              <button
                onClick={() => bridge.updater.install()}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-play-gradient px-3 text-xs font-semibold text-white shadow-glow hover:shadow-glow-strong transition"
              >
                {t.install}
              </button>
            )}
            {state.phase === 'manual' && (
              <button
                onClick={() => bridge.shell.openExternal(state.url)}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-play-gradient px-3 text-xs font-semibold text-white shadow-glow hover:shadow-glow-strong transition"
              >
                {t.download}
              </button>
            )}
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
