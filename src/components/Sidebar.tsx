import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home,
  Newspaper,
  ShoppingCart,
  ScrollText,
  LifeBuoy,
  MessagesSquare,
  Send,
  Users,
  Activity,
  Gauge,
  Terminal,
} from 'lucide-react';
import { PlayButton } from './PlayButton';
import { useServerStatus } from '../hooks/useServerStatus';
import { bridge } from '../services/electron-bridge';
import { cn } from '../utils/cn';
import { useLang, pick } from '../i18n';

const ru = {
  navHome: 'Главная', navNews: 'Новости', navStore: 'Донат-магазин',
  navRules: 'Правила', navSupport: 'Поддержка', navLogs: 'Логи',
  online: (n: number) => `${n} онлайн`, onServerNow: 'Сейчас на сервере',
  serverState: 'Состояние сервера: Отличное',
  community: 'Сообщество', open: 'открыть →',
};
const en: typeof ru = {
  navHome: 'Home', navNews: 'News', navStore: 'Donation store',
  navRules: 'Rules', navSupport: 'Support', navLogs: 'Logs',
  online: (n: number) => `${n} online`, onServerNow: 'Online now',
  serverState: 'Server status: Excellent',
  community: 'Community', open: 'open →',
};
const TR = { ru, en };

const navItems = [
  { to: '/', icon: Home, key: 'navHome' as const, end: true },
  { to: '/news', icon: Newspaper, key: 'navNews' as const },
  { to: '/store', icon: ShoppingCart, key: 'navStore' as const },
  { to: '/rules', icon: ScrollText, key: 'navRules' as const },
  { to: '/support', icon: LifeBuoy, key: 'navSupport' as const },
  { to: '/logs', icon: Terminal, key: 'navLogs' as const },
];

const community = [
  { href: 'https://discord.gg/natux', icon: MessagesSquare, label: 'Discord', accent: 'text-[#5865F2]' },
  { href: 'https://t.me/natuxworld', icon: Send, label: 'Telegram', accent: 'text-[#26A5E4]' },
  { href: 'https://vk.com/natuxworld', icon: Users, label: 'VK', accent: 'text-[#0077FF]' },
];

export function Sidebar() {
  const { status } = useServerStatus();
  const navigate = useNavigate();
  const t = pick(useLang(), TR);

  return (
    <aside className="relative flex h-full w-[300px] shrink-0 flex-col gap-4 overflow-y-auto p-4 pt-0">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-red-radial opacity-50" />

      <motion.button
        onClick={() => navigate('/')}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative flex items-center gap-3 rounded-2xl glass p-3 text-left hover:border-white/15 transition"
      >
        <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl shadow-[0_0_24px_rgba(255,0,55,0.45)] ring-1 ring-white/10">
          <img
            src="./icon.png"
            alt="NATUX WORLD"
            draggable={false}
            className="h-full w-full object-cover select-none"
          />
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_55%,rgba(0,0,0,0.35)_100%)]" />
        </div>
        <div className="flex-1 leading-tight">
          <div className="font-display text-xl tracking-[0.18em] text-white">NATUX</div>
          <div className="-mt-1 font-display text-xl tracking-[0.18em] text-gradient-red">
            WORLD
          </div>
        </div>
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col gap-2"
      >
        <SidebarStat
          icon={<span className="relative grid h-7 w-7 place-items-center rounded-lg bg-success/10">
            <span className="absolute h-2 w-2 rounded-full bg-success animate-ping-ring" />
            <span className="relative h-2 w-2 rounded-full bg-success shadow-[0_0_8px_rgba(0,255,127,0.9)]" />
          </span>}
          value={t.online(status?.players ?? 142)}
          sub={t.onServerNow}
        />
        <SidebarStat
          icon={<div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <Gauge className="h-3.5 w-3.5" />
          </div>}
          value={`TPS: ${status?.tps?.toFixed(1) ?? '20.0'}`}
          sub={t.serverState}
          right={<Activity className="h-3.5 w-3.5 text-success" />}
        />
      </motion.div>

      <div className="mt-2 flex flex-col gap-2">
        <PlayButton />
      </div>

      <nav className="mt-2 flex flex-col gap-1">
        {navItems.map((item, i) => (
          <motion.div
            key={item.to}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.04 }}
          >
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 transition-colors',
                  isActive
                    ? 'bg-white/[0.06] text-white ring-1 ring-white/[0.08]'
                    : 'hover:bg-white/[0.04] hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1 font-medium">{t[item.key]}</span>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-glow"
                    />
                  )}
                </>
              )}
            </NavLink>
          </motion.div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {t.community}
        </div>
        {community.map((c, i) => (
          <motion.button
            key={c.label}
            onClick={() => bridge.shell.openExternal(c.href)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.05 }}
            whileHover={{ x: 2 }}
            className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/[0.04] hover:text-white"
          >
            <c.icon className={cn('h-4 w-4', c.accent)} />
            <span className="flex-1 text-left font-medium">{c.label}</span>
            <span className="text-[10px] text-muted opacity-0 transition group-hover:opacity-100">
              {t.open}
            </span>
          </motion.button>
        ))}
      </div>
    </aside>
  );
}

function SidebarStat({
  icon,
  value,
  sub,
  right,
}: {
  icon: React.ReactNode;
  value: string;
  sub: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] px-3 py-2 ring-1 ring-white/[0.04] hover:bg-white/[0.04] transition">
      {icon}
      <div className="flex-1 leading-tight">
        <div className="text-[13px] font-semibold text-white">{value}</div>
        <div className="text-[10px] text-muted">{sub}</div>
      </div>
      {right}
    </div>
  );
}
