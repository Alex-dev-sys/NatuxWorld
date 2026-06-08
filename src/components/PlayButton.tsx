import { Play, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLauncherStore } from '../store/useLauncherStore';

export function PlayButton() {
  const isLaunching = useLauncherStore((s) => s.isLaunching);
  const progress = useLauncherStore((s) => s.progress);
  const message = useLauncherStore((s) => s.progressMessage);
  const play = useLauncherStore((s) => s.play);

  return (
    <motion.button
      onClick={play}
      disabled={isLaunching}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="group relative w-full overflow-hidden rounded-2xl bg-play-gradient p-[1px] shadow-glow"
    >
      <span className="pointer-events-none absolute inset-0 animate-pulse-glow rounded-2xl" />
      <span className="relative flex h-[68px] w-full items-center justify-center gap-3 rounded-[15px] bg-gradient-to-b from-primary to-primary-glow">
        <span className="absolute inset-0 rounded-[15px] bg-[radial-gradient(120%_120%_at_50%_0%,rgba(255,255,255,0.25)_0%,transparent_50%)]" />
        <span className="absolute inset-x-0 top-0 h-px bg-white/40" />
        {isLaunching ? (
          <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow" />
        ) : (
          <Play className="h-6 w-6 fill-white text-white drop-shadow" />
        )}
        <span className="font-display text-2xl tracking-[0.18em] text-white drop-shadow">
          {isLaunching ? 'ЗАПУСК...' : 'ИГРАТЬ'}
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
      {isLaunching && (
        <span className="absolute -bottom-5 left-0 right-0 text-center text-[10px] uppercase tracking-widest text-muted">
          {message}
        </span>
      )}
    </motion.button>
  );
}
