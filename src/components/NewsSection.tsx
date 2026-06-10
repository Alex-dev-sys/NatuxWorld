import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Newspaper, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNews } from '../hooks/useNews';
import { NewsCard } from './NewsCard';
import { NewsModal } from './NewsModal';
import type { NewsItem } from '../../electron/services/NewsService';
import { useLang, pick } from '../i18n';

const ru = { latest: 'Последние новости', all: 'Все новости' };
const en: typeof ru = { latest: 'Latest news', all: 'All news' };
const TR = { ru, en };

export function NewsSection() {
  const news = useNews();
  const navigate = useNavigate();
  const [active, setActive] = useState<NewsItem | null>(null);
  const t = pick(useLang(), TR);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="relative flex flex-col gap-3 rounded-2xl glass p-4 shadow-premium"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
              <Newspaper className="h-3.5 w-3.5" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">
              {t.latest}
            </span>
          </div>
          <button
            onClick={() => navigate('/news')}
            className="group flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary hover:text-primary-glow"
          >
            {t.all}
            <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {news.map((n, i) => (
            <NewsCard key={n.id} item={n} onClick={() => setActive(n)} delay={0.05 * i + 0.3} />
          ))}
        </div>
      </motion.div>
      <NewsModal item={active} onClose={() => setActive(null)} />
    </>
  );
}
