import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, CalendarClock, Camera } from 'lucide-react';
import { bridge } from '../services/electron-bridge';
import type { PlaytimeStats } from '../../electron/services/PlaytimeService';
import { useLang, pick } from '../i18n';

const ru = {
  title: 'Игровое время',
  total: 'Всего в игре',
  last: 'Последняя сессия',
  inGame: 'Сейчас в игре',
  never: 'Ещё не играли',
  screenshots: 'Скриншоты',
  hours: (h: string) => `${h} ч`,
  minutes: (m: string) => `${m} мин`,
};
const en: typeof ru = {
  title: 'Play time',
  total: 'Total played',
  last: 'Last session',
  inGame: 'In game now',
  never: 'Not played yet',
  screenshots: 'Screenshots',
  hours: (h: string) => `${h} h`,
  minutes: (m: string) => `${m} min`,
};
const TR = { ru, en };

function fmt(ms: number, t: typeof ru): string {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return t.minutes(String(totalMin));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${t.hours(String(h))} ${t.minutes(String(m))}` : t.hours(String(h));
}

export function PlaytimeCard() {
  const [stats, setStats] = useState<PlaytimeStats | null>(null);
  const t = pick(useLang(), TR);

  useEffect(() => {
    let alive = true;
    const load = () => {
      bridge.shell.playtimeGet().then((s) => { if (alive) setStats(s); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const openScreenshots = () => {
    bridge.shell.openScreenshots().catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="relative flex flex-col gap-3 rounded-2xl glass p-4 shadow-premium"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
            <Clock className="h-3.5 w-3.5" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">
            {t.title}
          </span>
        </div>
        <button
          onClick={openScreenshots}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/80 ring-1 ring-white/[0.06] hover:bg-white/[0.08]"
        >
          <Camera className="h-3.5 w-3.5" />
          {t.screenshots}
        </button>
      </div>
      {stats === null ? (
        <div className="text-sm text-muted">—</div>
      ) : stats.totalMs <= 0 ? (
        <div className="text-sm text-muted">{t.never}</div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl text-white">{fmt(stats.totalMs, t)}</span>
            <span className="text-[11px] uppercase tracking-wider text-muted">{t.total}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <CalendarClock className="h-3.5 w-3.5" />
            {stats.inGame
              ? <span className="text-success">{t.inGame}</span>
              : stats.lastSession
                ? <span>{t.last}: {fmt(stats.lastSession.end - stats.lastSession.start, t)}</span>
                : null}
          </div>
        </div>
      )}
    </motion.div>
  );
}
