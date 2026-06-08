import { bridge } from '../services/electron-bridge';
import { useLauncherStore } from '../store/useLauncherStore';

const links = [
  { label: 'Discord', href: 'https://discord.gg/natux' },
  { label: 'Telegram', href: 'https://t.me/natuxworld' },
  { label: 'Правила', href: '#/rules' },
  { label: 'Магазин', href: '#/store' },
  { label: 'Форум', href: 'https://forum.natux.world' },
];

export function Footer() {
  const version = useLauncherStore((s) => s.appVersion);
  return (
    <footer className="flex h-10 shrink-0 items-center justify-between border-t border-white/[0.04] px-5 text-[11px] text-muted">
      <span>© 2025 NATUX WORLD — Выживай или умри</span>
      <div className="flex items-center gap-5">
        {links.map((l) => (
          <button
            key={l.label}
            onClick={() => {
              if (l.href.startsWith('#')) window.location.hash = l.href.slice(1);
              else bridge.shell.openExternal(l.href);
            }}
            className="hover:text-white transition"
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span>Версия лаунчера: {version}</span>
        <span className="relative grid h-3 w-3 place-items-center">
          <span className="absolute h-2 w-2 rounded-full bg-success animate-ping-ring" />
          <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(0,255,127,0.8)]" />
        </span>
      </div>
    </footer>
  );
}
