import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { bridge } from '../services/electron-bridge';
import { useLang, pick } from '../i18n';

const SHOP_URL = 'https://vibestudy.ru/shop';

const ru = {
  title: 'ДОНАТ-МАГАЗИН',
  subtitle: '15 рангов · Автовыдача за 1–2 мин · Оплата картой и СБП',
  cardTitle: 'Магазин открыт на сайте',
  cardDesc: 'Выбери ранг, введи ник и оплати — ранг выдастся автоматически',
  openShop: 'Открыть магазин',
};
const en: typeof ru = {
  title: 'DONATE STORE',
  subtitle: '15 ranks · Auto-delivery in 1–2 min · Card & SBP payments',
  cardTitle: 'The store is open on the website',
  cardDesc: 'Pick a rank, enter your nickname and pay — the rank is granted automatically',
  openShop: 'Open store',
};
const TR = { ru, en };

export function StorePage() {
  const t = pick(useLang(), TR);
  const openShop = () => bridge.shell.openExternal(SHOP_URL);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl tracking-wide">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 rounded-2xl glass p-10 text-center">
        <div className="text-5xl">🛒</div>
        <div>
          <div className="text-xl font-semibold text-white">{t.cardTitle}</div>
          <div className="mt-1 text-sm text-muted">
            {t.cardDesc}
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={openShop}
          className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          {t.openShop}
        </motion.button>
        <span className="text-xs text-muted opacity-60">{SHOP_URL}</span>
      </div>
    </motion.div>
  );
}
