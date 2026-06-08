import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Newspaper,
  ShoppingCart,
  ScrollText,
  LifeBuoy,
  MessagesSquare,
  Send,
  Users,
  Activity,
  UserPlus,
  Gauge,
} from 'lucide-react';
import { PlayButton } from './PlayButton';
import { VersionSelector } from './VersionSelector';
import { useServerStatus } from '../hooks/useServerStatus';
import { bridge } from '../services/electron-bridge';
import { cn } from '../utils/cn';

const navItems = [
  { to: '/news', icon: Newspaper, label: 'Новости' },
  { to: '/store', icon: ShoppingCart, label: 'Донат-магазин' },
  { to: '/rules', icon: ScrollText, label: 'Правила' },
  { to: '/support', icon: LifeBuoy, label: 'Поддержка' },
];

const community = [
  { href: 'https://discord.gg/natux', icon: MessagesSquare, label: 'Discord', accent: 'text-[#5865F2]' },
  { href: 'https://t.me/natuxworld', icon: Send, label: 'Telegram', accent: 'text-[#26A5E4]' },
  { href: 'https://vk.com/natuxworld', icon: Users, label: 'VK', accent: 'text-[#0077FF]' },
];

export function Sidebar() {
  const { status } = useServerStatus();

  return (
    <aside className="relative flex w-[300px] shrink-0 flex-col gap-4 p-4 pt-0">
      <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-red-radial opacity-50 blur-2xl" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative flex items-center gap-3 rounded-2xl glass p-3"
      >
        <div className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-glow">
          <span className="absolute inset-0 bg-[radial-gradient(100%_100%_at_50%_0%,rgba(255,255,255,0.35)_0%,transparent_50%)]" />
          <span className="font-display text-xl tracking-wider text-white drop-shadow">N</span>
        </div>
        <div className="flex-1 leading-tight">
          <div className="font-display text-lg tracking-[0.16em] text-white">NATUX</div>
          <div className="-mt-1 font-display text-lg tracking-[0.16em] text-gradient-red">
            WORLD
          </div>
        </div>
      </motion.div>

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
          value={`${status?.players ?? 142} онлайн`}
          sub={`Пик игроков сегодня в 12:45`}
        />
        <SidebarStat
          icon={<div className="grid h-7 w-7 place-items-center rounded-lg bg-warning/10 text-warning">
            <UserPlus className="h-3.5 w-3.5" />
          </div>}
          value="567 регистраций"
          sub="Сегодня"
        />
        <SidebarStat
          icon={<div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <Gauge className="h-3.5 w-3.5" />
          </div>}
          value={`TPS: ${status?.tps?.toFixed(1) ?? '20.0'}`}
          sub="Состояние сервера: Отличное"
          right={<Activity className="h-3.5 w-3.5 text-success" />}
        />
      </motion.div>

      <div className="mt-2 flex flex-col gap-2">
        <PlayButton />
        <VersionSelector />
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
                  <span className="flex-1 font-medium">{item.label}</span>
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
          Сообщество
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
              открыть →
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
