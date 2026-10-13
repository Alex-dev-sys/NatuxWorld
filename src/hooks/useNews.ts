import { useEffect, useState } from 'react';
import { bridge } from '../services/native-bridge';
import type { NewsItem } from '../types/native';

export function useNews(): NewsItem[] {
  const [news, setNews] = useState<NewsItem[]>([]);
  useEffect(() => {
    bridge.news.getAll().then(setNews);
  }, []);
  return news;
}
