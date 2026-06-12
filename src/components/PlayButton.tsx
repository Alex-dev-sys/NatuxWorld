import { Play, Loader2, X, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLauncherStore } from '../store/useLauncherStore';
import { useLang, pick } from '../i18n';

const ru = {
  retry: 'ПОВТОРИТЬ', launching: 'ЗАПУСК...', play: 'ИГРАТЬ', cancelLaunch: 'Отменить запуск',
};
const en: typeof ru = {
  retry: 'RETRY', launching: 'LAUNCHING...', play: 'PLAY', cancelLaunch: 'Cancel launch',
};
const TR = { ru, en };

export function PlayButton() {
  const t = pick(useLang(), TR);
  const isLaunching = useLauncherStore((s) => s.isLaunching);
  const progress = useLauncherStore((s) => s.progress);
  const message = useLauncherStore((s) => s.progressMessage);
  const stage = useLauncherStore((s) => s.stage);
  const errorMessage = useLauncherStore((s) => s.errorMessage);
  const play = useLauncherStore((s) => s.play);
  const cancel = useLauncherStore((s) => s.cancel);

  const showCancel = isLaunching && stage !== 'spawn' && stage !== 'running';
  const isError = stage === 'error' && !!errorMessage;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex items-stretch gap-1.5">
        <motion.button
          onClick={play}
          disabled={isLaunching}
          whileHover={{ scale: isLaunching ? 1 : 1.02 }}
          whileTap={{ scale: isLaunching ? 1 : 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="group relative flex-1 overflow-hidden rounded-2xl bg-play-gradient p-[1px] shadow-glow"
        >
          <span className="pulse-glow-soft pointer-events-none absolute inset-0 rounded-2xl" />
          <span className="relative flex h-[68px] w-full items-center justify-center gap-3 rounded-[15px] bg-gradient-to-b from-primary to-primary-glow">
            <span className="absolute inset-0 rounded-[15px] bg-[radial-gradient(120%_120%_at_50%_0%,rgba(255,255,255,0.25)_0%,transparent_50%)]" />
            <span className="absolute inset-x-0 top-0 h-px bg-white/40" />
            {isError ? (
              <AlertTriangle className="h-6 w-6 text-white drop-shadow" />
            ) : isLaunching ? (
              <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow" />
            ) : (
              <Play className="h-6 w-6 fill-white text-white drop-shadow" />
            )}
            <span className="font-display text-2xl tracking-[0.18em] text-white drop-shadow">
              {isError ? t.retry : isLaunching ? t.launching : t.play}
            </span>
          </span>
          {isLaunching && (
            <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-black/30">
              <motion.span
                className="block h-full bg-white"
                style={{ width: `${progress}%` }}
                transition={{ ease: 'easeOut' }}
              />
            </span>
          )}
        </motion.button>

        {showCancel && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={cancel}
            title={t.cancelLaunch}
            className="grid w-12 place-items-center rounded-2xl bg-white/[0.06] text-white/80 ring-1 ring-white/[0.08] hover:bg-white/[0.1] hover:text-white"
          >
            <X className="h-5 w-5" />
          </motion.button>
        )}
      </div>

      <div
        className={`text-center text-[10px] uppercase tracking-widest ${
          isError ? 'text-primary' : 'text-muted'
        }`}
      >
        {isError ? errorMessage : message}
      </div>
    </div>
  );
}
