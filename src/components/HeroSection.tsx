import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, type MouseEvent } from 'react';
import { Swords, Skull, Flame } from 'lucide-react';

export function HeroSection() {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const tx = useTransform(mx, [0, 1], [-14, 14]);
  const ty = useTransform(my, [0, 1], [-10, 10]);
  const glowX = useTransform(mx, [0, 1], ['25%', '75%']);
  const glowY = useTransform(my, [0, 1], ['25%', '75%']);

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
      transition={{ duration: 0.6 }}
      className="relative h-[360px] w-full overflow-hidden rounded-3xl glass-strong shadow-premium"
    >
      <motion.div style={{ x: tx, y: ty }} className="absolute inset-0 -z-0 will-change-transform">
        <HeroBackground />
      </motion.div>

      <DotField />

      <motion.div
        className="absolute inset-0 -z-0 mix-blend-screen"
        style={{
          background: useTransform(
            [glowX, glowY],
            ([x, y]) =>
              `radial-gradient(600px circle at ${x} ${y}, rgba(255,43,79,0.35), transparent 55%)`,
          ),
        }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,0,55,0.5),transparent_55%)]" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      <Particles />

      <div className="absolute inset-0 bg-[linear-gradient(transparent_95%,rgba(255,0,55,0.08)_100%)] bg-[length:100%_3px] opacity-30 mix-blend-overlay" />

      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="relative z-10 flex h-full flex-col justify-center gap-4 px-12"
      >
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary backdrop-blur-md">
          <span className="relative grid h-1.5 w-1.5 place-items-center">
            <span className="absolute h-1.5 w-1.5 rounded-full bg-primary animate-ping-ring" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-glow" />
          </span>
          Сезон 7 · Анархия
        </span>

        <h1 className="font-display text-[96px] leading-[0.82] tracking-[0.02em] text-white drop-shadow-[0_8px_32px_rgba(255,0,55,0.55)]">
          <span className="block">NATUX</span>
          <span className="block text-gradient-red">WORLD</span>
        </h1>

        <div className="mt-1 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.18em] text-white/85">
          <Tag icon={<Swords className="h-3 w-3" />}>Анархия</Tag>
          <Tag icon={<Skull className="h-3 w-3" />}>PvP</Tag>
          <Tag icon={<Flame className="h-3 w-3" />}>mcMMO</Tag>
        </div>

        <p className="text-sm text-white/55">Выживай или умри</p>
      </motion.div>

      <div className="absolute right-12 top-1/2 z-10 -translate-y-1/2">
        <HeroLogo />
      </div>
    </motion.div>
  );
}

function Tag({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] backdrop-blur-sm">
      <span className="text-primary">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

function HeroBackground() {
  return (
    <svg viewBox="0 0 800 360" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="hero-sun" cx="78%" cy="32%" r="28%">
          <stop offset="0%" stopColor="#FF2B4F" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#7a0020" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1a0006" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b0008" />
          <stop offset="55%" stopColor="#10000a" />
          <stop offset="100%" stopColor="#070707" />
        </linearGradient>
        <linearGradient id="hero-mountain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a0005" />
          <stop offset="100%" stopColor="#070000" />
        </linearGradient>
        <linearGradient id="hero-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a0005" stopOpacity="0" />
          <stop offset="100%" stopColor="#FF0037" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect width="800" height="360" fill="url(#hero-sky)" />
      <circle cx="620" cy="120" r="160" fill="url(#hero-sun)" />
      <path
        d="M0 230 L80 190 L140 220 L200 175 L260 210 L320 165 L400 220 L460 180 L540 225 L620 185 L700 230 L800 200 L800 360 L0 360 Z"
        fill="url(#hero-mountain)"
        opacity="0.95"
      />
      <path
        d="M0 270 L60 250 L130 280 L200 245 L290 280 L360 255 L450 290 L520 265 L610 295 L680 270 L760 300 L800 280 L800 360 L0 360 Z"
        fill="#000"
        opacity="0.85"
      />
      <g opacity="0.6">
        <rect x="360" y="240" width="8" height="50" fill="#000" />
        <rect x="372" y="220" width="10" height="70" fill="#000" />
        <rect x="386" y="200" width="14" height="90" fill="#000" />
        <rect x="404" y="230" width="9" height="60" fill="#000" />
        <rect x="417" y="215" width="11" height="75" fill="#000" />
        <rect x="430" y="195" width="16" height="95" fill="#000" />
        <rect x="450" y="225" width="10" height="65" fill="#000" />
      </g>
      <rect width="800" height="360" fill="url(#hero-fog)" />
    </svg>
  );
}

function DotField() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.18]"
      style={{
        backgroundImage:
          'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        maskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)',
      }}
    />
  );
}

function Particles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 26 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-primary/70 shadow-[0_0_10px_rgba(255,0,55,0.9)]"
          style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 100}%` }}
          animate={{ y: [0, -40, 0], opacity: [0, 0.95, 0] }}
          transition={{ duration: 5 + (i % 5), repeat: Infinity, delay: i * 0.25 }}
        />
      ))}
    </div>
  );
}

function HeroLogo() {
  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      className="relative grid place-items-center"
    >
      <span className="absolute h-44 w-44 rounded-full border border-primary/25 animate-ping-ring" />
      <span className="absolute h-36 w-36 rounded-full border border-primary/40" />
      <span className="absolute h-28 w-28 rounded-full border border-primary/60 shadow-[inset_0_0_40px_rgba(255,0,55,0.4)]" />

      <div className="relative grid h-24 w-24 place-items-center rounded-2xl bg-gradient-to-br from-primary via-primary-glow to-[#8a0020] shadow-[0_0_60px_rgba(255,0,55,0.7)] ring-1 ring-white/10">
        <span className="absolute inset-0 rounded-2xl bg-[radial-gradient(120%_100%_at_50%_0%,rgba(255,255,255,0.45)_0%,transparent_55%)]" />
        <span className="absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,transparent_50%,rgba(0,0,0,0.35)_100%)]" />
        <span className="relative font-display text-5xl tracking-wider text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
          N
        </span>
      </div>
    </motion.div>
  );
}
