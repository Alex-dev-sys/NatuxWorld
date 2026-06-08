import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNews } from '../hooks/useNews';
import { NewsCard } from '../components/NewsCard';
import { NewsModal } from '../components/NewsModal';
import type { NewsItem } from '../../electron/services/NewsService';

export function NewsPage() {
  const news = useNews();
  const [active, setActive] = useState<NewsItem | null>(null);
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4"
      >
        <h1 className="font-display text-4xl tracking-wide">НОВОСТИ</h1>
        <div className="grid grid-cols-2 gap-3">
          {news.map((n, i) => (
            <NewsCard key={n.id} item={n} onClick={() => setActive(n)} delay={i * 0.05} />
          ))}
        </div>
      </motion.div>
      <NewsModal item={active} onClose={() => setActive(null)} />
    </>
  );
}
