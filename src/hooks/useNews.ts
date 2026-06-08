import { useEffect, useState } from 'react';
import { bridge } from '../services/electron-bridge';
import type { NewsItem } from '../../electron/services/NewsService';

export function useNews(): NewsItem[] {
  const [news, setNews] = useState<NewsItem[]>([]);
  useEffect(() => {
    bridge.news.getAll().then(setNews);
  }, []);
  return news;
}
