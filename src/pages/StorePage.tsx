import { motion } from 'framer-motion';
import { ShoppingBag, Sparkles, Crown, Zap } from 'lucide-react';
import { Tooltip } from '../components/ui/Tooltip';

const items = [
  { name: 'VIP', price: '299₽', perk: 'Привилегии и киты', icon: Sparkles, color: '#FF8A00' },
  { name: 'PREMIUM', price: '599₽', perk: 'Расширенные права', icon: Zap, color: '#FF2B4F' },
  { name: 'DELUXE', price: '999₽', perk: 'Косметика и эффекты', icon: ShoppingBag, color: '#5865F2' },
  { name: 'ULTIMATE', price: '1499₽', perk: 'Полный доступ', icon: Crown, color: '#00FF7F' },
];

export function StorePage() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <h1 className="font-display text-4xl tracking-wide">ДОНАТ-МАГАЗИН</h1>
      <div className="grid grid-cols-4 gap-4">
        {items.map((item, i) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            className="relative overflow-hidden rounded-2xl glass p-5 shadow-premium"
          >
            <div
              className="absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl"
              style={{ background: item.color, opacity: 0.25 }}
            />
            <item.icon className="h-7 w-7" style={{ color: item.color }} />
            <div className="mt-4 font-display text-3xl tracking-wider">{item.name}</div>
            <div className="text-sm text-muted">{item.perk}</div>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-2xl font-bold">{item.price}</span>
              <span className="text-xs text-muted">/ навсегда</span>
            </div>
            <Tooltip label="Скоро доступно">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="mt-4 w-full cursor-not-allowed rounded-xl py-2 text-sm font-semibold opacity-50 ring-1 ring-white/10"
                style={{ color: item.color }}
              >
                Купить
              </button>
            </Tooltip>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
