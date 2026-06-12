import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  data: number[];
  color: string;
  delay?: number;
  trend?: number;
}

export function StatCard({ icon, label, value, hint, data, color, delay = 0, trend }: Props) {
  const computedTrend =
    typeof trend === 'number'
      ? trend
      : data.length > 1
        ? +(((data[data.length - 1] - data[0]) / Math.max(Math.abs(data[0]), 1)) * 100).toFixed(1)
        : 0;
  const up = computedTrend >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 0.8, 0.36, 1] }}
      whileHover={{ y: -6 }}
      style={{ ['--c' as string]: color }}
      className="group relative h-[168px] overflow-hidden rounded-[24px] p-[1px]"
    >
      {/* gradient hairline border */}
      <div
        className="absolute inset-0 rounded-[24px] opacity-60 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(150deg, ${color}55, transparent 38%, transparent 70%, ${color}22)`,
        }}
      />

      {/* card body — solid bg, no backdrop-filter: blurring the animated backdrop
          beneath 4 cards re-renders the blur every frame on weak GPUs */}
      <div className="relative h-full w-full overflow-hidden rounded-[23px] bg-[#0b0b0d]/95">
        {/* ambient corner light: pre-soft radial gradient instead of filter:blur —
            same look, zero per-frame filter cost; hover animates opacity only */}
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 opacity-30 transition-opacity duration-500 group-hover:opacity-60"
          style={{ background: `radial-gradient(circle, ${color}66, transparent 65%)` }}
        />
        {/* internal bottom glow */}
        <div
          className="pointer-events-none absolute inset-x-0 -bottom-16 h-32 opacity-30 transition-opacity duration-500 group-hover:opacity-50"
          style={{ background: `radial-gradient(60% 100% at 50% 100%, ${color}88, transparent 70%)` }}
        />

        {/* thin glowing top accent */}
        <span
          className="pointer-events-none absolute left-5 right-5 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />

        {/* content */}
        <div className="relative flex h-full flex-col p-5">
          <div className="flex items-start justify-between">
            <div
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ring-white/10 transition-transform duration-500 group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${color}26, ${color}05)`,
                color,
                boxShadow: `inset 0 0 18px ${color}26, 0 8px 20px -10px ${color}`,
              }}
            >
              {icon}
            </div>
            {computedTrend !== 0 && (
              <div
                className="flex items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums"
                style={{
                  color: up ? '#3DFF99' : '#FF6B81',
                  background: up ? 'rgba(0,255,127,0.10)' : 'rgba(255,107,129,0.10)',
                  boxShadow: `inset 0 0 0 1px ${up ? 'rgba(0,255,127,0.18)' : 'rgba(255,107,129,0.18)'}`,
                }}
              >
                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {up ? '+' : ''}
                {computedTrend}%
              </div>
            )}
          </div>

          <div className="mt-auto">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
              {label}
            </div>
            <div className="mt-1 font-display text-[34px] leading-none tracking-tight text-white tabular-nums [text-shadow:0_2px_18px_rgba(0,0,0,0.5)]">
              {value}
            </div>
            {hint && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/45">
                {hint}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
