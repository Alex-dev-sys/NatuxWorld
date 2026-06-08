import { motion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

interface Props {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  data: number[];
  color: string;
  delay?: number;
}

export function StatCard({ icon, label, value, data, color, delay = 0 }: Props) {
  const chartData = data.map((v, i) => ({ i, v }));
  const id = `g-${label.replace(/\s+/g, '')}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-2xl glass p-4 shadow-premium hover:border-white/[0.12] transition"
    >
      <div className="absolute inset-x-0 bottom-0 h-16 opacity-70 transition group-hover:opacity-100">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.6} />
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

      <div className="relative flex items-start gap-3">
        <div
          className={cn(
            'grid h-9 w-9 place-items-center rounded-xl ring-1 ring-white/10',
          )}
          style={{ background: `${color}1a`, color }}
        >
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {label}
          </div>
          <div className="mt-1 font-display text-3xl tracking-wide text-white">
            {value}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
