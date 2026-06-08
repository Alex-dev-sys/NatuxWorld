import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, type MouseEvent } from 'react';

export function HeroSection() {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const tx = useTransform(mx, [0, 1], [-12, 12]);
  const ty = useTransform(my, [0, 1], [-8, 8]);

  useEffect(() => {
    mx.set(0.5);
    my.set(0.5);
  }, [mx, my]);

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width);
    my.set((e.clientY - rect.top) / rect.height);
  }

  return (
    <motion.div
      onMouseMove={onMove}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative h-[340px] w-full overflow-hidden rounded-2xl glass shadow-premium"
    >
      <motion.div style={{ x: tx, y: ty }} className="absolute inset-0 -z-0 will-change-transform">
        <HeroBackground />
      </motion.div>

      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,0,55,0.45),transparent_60%)]" />

      <Particles />

      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="relative z-10 flex h-full flex-col justify-center gap-3 px-10"
      >
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-glow" />
          Сезон 7 · Анархия
        </span>
        <h1 className="font-display text-[88px] leading-[0.85] tracking-[0.02em] text-white drop-shadow-[0_8px_32px_rgba(255,0,55,0.45)]">
          NATUX
          <br />
          <span className="text-gradient-red">WORLD</span>
        </h1>
        <div className="mt-1 flex items-center gap-3 text-[13px] font-medium text-white/85">
          <span>Анархия</span>
          <span className="h-1 w-1 rounded-full bg-primary" />
          <span>PvP</span>
          <span className="h-1 w-1 rounded-full bg-primary" />
          <span>mcMMO</span>
        </div>
        <p className="text-sm text-white/60">Выживай или умри</p>
      </motion.div>

      <div className="absolute right-10 top-1/2 z-10 -translate-y-1/2">
        <HeroBadge />
      </div>
    </motion.div>
  );
}

function HeroBackground() {
  return (
    <svg viewBox="0 0 800 340" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="sun" cx="78%" cy="38%" r="22%">
          <stop offset="0%" stopColor="#FF2B4F" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#7a0020" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1a0006" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b0008" />
          <stop offset="60%" stopColor="#10000a" />
          <stop offset="100%" stopColor="#070707" />
        </linearGradient>
        <linearGradient id="mountain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a0005" />
          <stop offset="100%" stopColor="#070000" />
        </linearGradient>
      </defs>
      <rect width="800" height="340" fill="url(#sky)" />
      <circle cx="620" cy="120" r="120" fill="url(#sun)" />
      <path
        d="M0 220 L80 180 L140 210 L200 170 L260 200 L320 160 L400 210 L460 175 L540 215 L620 180 L700 220 L800 195 L800 340 L0 340 Z"
        fill="url(#mountain)"
        opacity="0.95"
      />
      <path
        d="M0 260 L60 240 L130 270 L200 235 L290 270 L360 245 L450 280 L520 255 L610 285 L680 260 L760 290 L800 270 L800 340 L0 340 Z"
        fill="#000"
        opacity="0.85"
      />
      <g opacity="0.55">
        <rect x="380" y="240" width="8" height="40" fill="#000" />
        <rect x="392" y="220" width="10" height="60" fill="#000" />
        <rect x="406" y="200" width="14" height="80" fill="#000" />
        <rect x="424" y="230" width="9" height="50" fill="#000" />
        <rect x="437" y="215" width="11" height="65" fill="#000" />
      </g>
    </svg>
  );
}

function Particles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 18 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-primary/60 shadow-[0_0_8px_rgba(255,0,55,0.8)]"
          style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 100}%` }}
          animate={{ y: [0, -30, 0], opacity: [0, 0.9, 0] }}
          transition={{ duration: 6 + (i % 4), repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
    </div>
  );
}

function HeroBadge() {
  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      className="relative grid h-20 w-20 place-items-center"
    >
      <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping-ring" />
      <span className="absolute inset-0 rounded-full border border-primary/60" />
      <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/15 ring-2 ring-primary/40 backdrop-blur">
        <span className="h-5 w-5 rounded-sm bg-primary shadow-glow" />
      </span>
    </motion.div>
  );
}
