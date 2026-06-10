import { bridge } from '../services/electron-bridge';
import { useLauncherStore } from '../store/useLauncherStore';
import { useLang, pick } from '../i18n';

const ru = {
  discord: 'Discord', telegram: 'Telegram', rules: 'Правила', store: 'Магазин', forum: 'Форум',
  tagline: '© 2025 NATUX WORLD — Выживай или умри', version: 'Версия лаунчера:',
};
const en: typeof ru = {
  discord: 'Discord', telegram: 'Telegram', rules: 'Rules', store: 'Store', forum: 'Forum',
  tagline: '© 2025 NATUX WORLD — Survive or die', version: 'Launcher version:',
};
const TR = { ru, en };

const links = [
  { key: 'discord' as const, href: 'https://discord.gg/natux' },
  { key: 'telegram' as const, href: 'https://t.me/natuxworld' },
  { key: 'rules' as const, href: '#/rules' },
  { key: 'store' as const, href: '#/store' },
  { key: 'forum' as const, href: 'https://forum.natux.world' },
];

export function Footer() {
  const version = useLauncherStore((s) => s.appVersion);
  const t = pick(useLang(), TR);
  return (
    <footer className="relative flex h-10 shrink-0 items-center justify-between border-t border-white/[0.04] bg-bg/80 px-5 text-[11px] text-muted backdrop-blur-md">
      <span>{t.tagline}</span>
      <div className="flex items-center gap-5">
        {links.map((l) => (
          <button
            key={l.key}
            onClick={() => {
              if (l.href.startsWith('#')) window.location.hash = l.href.slice(1);
              else bridge.shell.openExternal(l.href);
            }}
            className="hover:text-white transition"
          >
            {t[l.key]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span>{t.version} {version}</span>
        <span className="relative grid h-3 w-3 place-items-center">
          <span className="absolute h-2 w-2 rounded-full bg-success animate-ping-ring" />
          <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(0,255,127,0.8)]" />
        </span>
      </div>
    </footer>
  );
}
