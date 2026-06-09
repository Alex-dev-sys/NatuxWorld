import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { bridge } from '../services/electron-bridge';

const SHOP_URL = 'https://vibestudy.ru/shop';

export function StorePage() {
  const openShop = () => bridge.shell.openExternal(SHOP_URL);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl tracking-wide">ДОНАТ-МАГАЗИН</h1>
        <p className="mt-1 text-sm text-muted">15 рангов · Автовыдача за 1–2 мин · Оплата картой и СБП</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 rounded-2xl glass p-10 text-center">
        <div className="text-5xl">🛒</div>
        <div>
          <div className="text-xl font-semibold text-white">Магазин открыт на сайте</div>
          <div className="mt-1 text-sm text-muted">
            Выбери ранг, введи ник и оплати — ранг выдастся автоматически
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={openShop}
          className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Открыть магазин
        </motion.button>
        <span className="text-xs text-muted opacity-60">{SHOP_URL}</span>
      </div>
    </motion.div>
  );
}
