import http from 'node:http';
import https from 'node:https';
import { BRAND } from '../../brand.config';
import { readHttpResponse, waitForHttpResponse } from '../utils/http-response';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  body: string;
  image: string;
  date: string;
  category: 'update' | 'event' | 'donate' | 'wipe';
}

// Bundled fallback: shown when the site is unreachable (offline / DNS down),
// so the news tab never goes blank.
const FALLBACK: NewsItem[] = [
  {
    id: 'welcome',
    title: 'Добро пожаловать!',
    description: 'Лаунчер установлен и готов к игре.',
    body: 'Нажмите ИГРАТЬ — лаунчер сам скачает Java и все файлы. Новости с сервера подгружаются отсюда автоматически.',
    image: '/news/welcome.jpg',
    date: '',
    category: 'update',
  },
];

const NEWS_ENDPOINT = `${BRAND.siteOrigin}/api/news`;
const MAX_ITEMS = 20;
const MAX_FIELD = 2000;

function sanitizeItem(raw: unknown): NewsItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const it = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const id = str(it.id, 80);
  const title = str(it.title, 200);
  if (!id || !title) return null;
  const categories = ['update', 'event', 'donate', 'wipe'];
  const category = categories.includes(str(it.category, 20)) ? (str(it.category, 20) as NewsItem['category']) : 'update';
  return {
    id,
    title,
    description: str(it.description, 300),
    body: str(it.body, MAX_FIELD),
    image: str(it.image, 300),
    date: str(it.date, 60),
    category,
  };
}

export class NewsService {
  private cache: { items: NewsItem[]; fetchedAt: number } | null = null;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  async getAll(): Promise<NewsItem[]> {
    // Short cache so switching tabs doesn't re-hit the network every time.
    if (this.cache && Date.now() - this.cache.fetchedAt < NewsService.CACHE_TTL_MS) {
      return this.cache.items;
    }
    const fresh = await this.fetchFromSite();
    if (fresh) {
      this.cache = { items: fresh, fetchedAt: Date.now() };
      return fresh;
    }
    return this.cache?.items ?? FALLBACK;
  }

  private async fetchFromSite(): Promise<NewsItem[] | null> {
    try {
      const url = new URL(NEWS_ENDPOINT);
      const transport = url.protocol === 'http:' ? http : https;
      const req = transport.request(url, { method: 'GET', headers: { Accept: 'application/json' } });
      const response = waitForHttpResponse(req, 6000, 'Timeout', async (res) => {
        if (res.statusCode !== 200) {
          res.destroy();
          throw new Error(`HTTP ${res.statusCode}`);
        }
        return (await readHttpResponse(res, 512 * 1024)).toString('utf-8');
      });
      req.end();
      const raw = await response;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const items = parsed.slice(0, MAX_ITEMS)
        .map(sanitizeItem)
        .filter((it): it is NewsItem => it !== null);
      return items.length > 0 ? items : null;
    } catch {
      return null;
    }
  }
}
