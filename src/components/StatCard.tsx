import { motion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
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
  const chartData = data.map((v, i) => ({ i, v }));
  const id = `g-${label.replace(/\s+/g, '')}`;
  const computedTrend =
    typeof trend === 'number'
      ? trend
      : data.length > 1
        ? +(((data[data.length - 1] - data[0]) / Math.max(Math.abs(data[0]), 1)) * 100).toFixed(1)
        : 0;
  const up = computedTrend >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      whileHover={{ y: -4 }}
      style={{ ['--card-color' as string]: color }}
      className="group relative h-[148px] overflow-hidden rounded-2xl glass shadow-premium transition hover:border-white/[0.12] hover:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6),0_0_36px_-4px_var(--card-color)]"
    >
      <span
        className="pointer-events-none absolute -top-px left-4 right-4 h-px opacity-60"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 opacity-70 transition group-hover:opacity-90">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${id})`}
              isAnimationActive
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl transition group-hover:opacity-50"
        style={{ background: color }}
      />

      <div className="relative flex h-full flex-col p-4">
        <div className="flex items-start gap-3">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-white/10"
            style={{
              background: `linear-gradient(135deg, ${color}22, ${color}08)`,
              color,
              boxShadow: `inset 0 0 16px ${color}22`,
            }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {label}
              </div>
              {computedTrend !== 0 && (
                <div
                  className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    color: up ? '#00FF7F' : '#FF6B81',
                    background: up ? 'rgba(0,255,127,0.08)' : 'rgba(255,107,129,0.08)',
                  }}
                >
                  {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {up ? '+' : ''}
                  {computedTrend}%
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 font-display text-[32px] leading-none tracking-wide text-white">
          {value}
        </div>
        {hint && (
          <div className="mt-1 text-[11px] font-medium text-muted">{hint}</div>
        )}
      </div>
    </motion.div>
  );
}
