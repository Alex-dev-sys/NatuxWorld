import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, type MouseEvent } from 'react';
import { Swords, Skull, Flame } from 'lucide-react';
import { useLang, pick } from '../i18n';

const ru = {
  season: 'Сезон 7 · Анархия', anarchy: 'Анархия', tagline: 'Выживай или умри',
};
const en: typeof ru = {
  season: 'Season 7 · Anarchy', anarchy: 'Anarchy', tagline: 'Survive or die',
};
const TR = { ru, en };

export function HeroSection() {
  const t = pick(useLang(), TR);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const tx = useTransform(mx, [0, 1], [-14, 14]);
  const ty = useTransform(my, [0, 1], [-10, 10]);
  // Glow follows the cursor via transform (compositor-only). Regenerating a
  // radial-gradient string per mousemove repaints the whole hero on weak GPUs.
  const glowX = useTransform(mx, [0, 1], [-260, 260]);
  const glowY = useTransform(my, [0, 1], [-160, 160]);

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
      <motion.div
        style={{ x: tx, y: ty }}
        className="absolute inset-0 -z-0 will-change-transform"
      >
        <img
          src="./icon.png"
          alt=""
          draggable={false}
          className="h-full w-full object-cover object-center select-none"
          style={{
            transform: 'scale(1.08)',
            filter: 'saturate(1.15) contrast(1.05)',
          }}
        />
      </motion.div>

      <DotField />

      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden mix-blend-screen">
        <motion.div
          style={{ x: glowX, y: glowY }}
          className="absolute left-1/2 top-1/2 -ml-[300px] -mt-[300px] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(255,43,79,0.35),transparent_55%)] will-change-transform"
        />
      </div>

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
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
          <span className="relative grid h-1.5 w-1.5 place-items-center">
            <span className="absolute h-1.5 w-1.5 rounded-full bg-primary animate-ping-ring" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-glow" />
          </span>
          {t.season}
        </span>

        <h1 className="font-display text-[96px] leading-[0.82] tracking-[0.02em] text-white drop-shadow-[0_8px_32px_rgba(255,0,55,0.55)]">
          <span className="block">NATUX</span>
          <span className="block text-gradient-red">WORLD</span>
        </h1>

        <div className="mt-1 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.18em] text-white/85">
          <Tag icon={<Swords className="h-3 w-3" />}>{t.anarchy}</Tag>
          <Tag icon={<Skull className="h-3 w-3" />}>PvP</Tag>
          <Tag icon={<Flame className="h-3 w-3" />}>mcMMO</Tag>
        </div>

        <p className="text-sm text-white/55">{t.tagline}</p>
      </motion.div>
    </motion.div>
  );
}

function Tag({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.07] px-2 py-1 text-[10px]">
      <span className="text-primary">{icon}</span>
      <span>{children}</span>
    </span>
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

// CSS keyframes instead of framer-motion: 26 JS-driven infinite animations kept the main
// thread busy every frame while the home page was open. CSS transform/opacity runs on
// the compositor for ~free.
function Particles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="hero-particle absolute h-1 w-1 rounded-full bg-primary/70 shadow-[0_0_10px_rgba(255,0,55,0.9)]"
          style={{
            left: `${(i * 53) % 100}%`,
            top: `${(i * 37) % 100}%`,
            animationDuration: `${5 + (i % 5)}s`,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
}

