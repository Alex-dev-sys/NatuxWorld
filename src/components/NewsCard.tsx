import { motion } from 'framer-motion';
import { Sparkles, ShoppingBag, Hammer, Trash2 } from 'lucide-react';
import type { NewsItem } from '../../electron/services/NewsService';
import { cn } from '../utils/cn';

const iconMap = {
  wipe: Trash2,
  donate: ShoppingBag,
  update: Hammer,
  event: Sparkles,
};

const colorMap = {
  wipe: 'from-primary/30 to-primary/5 text-primary',
  donate: 'from-fuchsia-500/30 to-fuchsia-500/5 text-fuchsia-400',
  update: 'from-emerald-500/25 to-emerald-500/5 text-emerald-400',
  event: 'from-amber-500/25 to-amber-500/5 text-amber-400',
};

export function NewsCard({ item, onClick, delay }: { item: NewsItem; onClick: () => void; delay: number }) {
  const Icon = iconMap[item.category];
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      whileHover={{ x: 3 }}
      className="group flex w-full items-center gap-3 rounded-xl bg-white/[0.02] p-2 pr-3 text-left ring-1 ring-white/[0.04] hover:bg-white/[0.05] hover:ring-white/[0.1] transition"
    >
      <div
        className={cn(
          'relative grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br ring-1 ring-white/[0.06]',
          colorMap[item.category],
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(255,255,255,0.18)_0%,transparent_50%)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-white">{item.title}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">{item.date}</span>
        </div>
        <p className="truncate text-xs text-muted">{item.description}</p>
      </div>
    </motion.button>
  );
}
