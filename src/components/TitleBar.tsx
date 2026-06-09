import { Minus, Square, X, Settings as SettingsIcon, Copy, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { bridge } from '../services/electron-bridge';
import { useIsMaximized } from '../hooks/useElectron';
import { useSettingsStore } from '../store/useSettingsStore';
import { Tooltip } from './ui/Tooltip';
import { ProfileMenu } from './ProfileMenu';

export function TitleBar() {
  const isMax = useIsMaximized();
  const openSettings = useSettingsStore((s) => s.open);
  const [ipCopied, setIpCopied] = useState(false);

  useEffect(() => {
    if (!ipCopied) return;
    const t = setTimeout(() => setIpCopied(false), 1600);
    return () => clearTimeout(t);
  }, [ipCopied]);

  return (
    <div className="titlebar-drag relative flex h-12 w-full items-center justify-between px-3">
      <div className="titlebar-no-drag flex items-center gap-2">
        <div className="flex h-7 items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 ring-1 ring-white/[0.06]">
          <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(0,255,127,0.8)]" />
          <span className="text-[11px] font-medium text-white/70">NATUX WORLD</span>
          <span className="text-[10px] text-muted">·</span>
          <span className="text-[10px] text-muted">mc.vibestudy.ru</span>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText('mc.vibestudy.ru');
              setIpCopied(true);
            }}
            className="ml-1 text-muted hover:text-white"
            title="Скопировать IP"
          >
            {ipCopied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      <div className="titlebar-no-drag flex items-center gap-1.5">
        <ProfileMenu />

        <Tooltip label="Настройки">
          <button
            onClick={openSettings}
            className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-white/[0.06]" />

        <button
          onClick={() => bridge.window.minimize()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="titlebar-no-drag grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => bridge.window.maximize()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="titlebar-no-drag grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white"
        >
          <Square className={`h-3.5 w-3.5 ${isMax ? 'rotate-45' : ''}`} />
        </button>
        <button
          onClick={() => bridge.window.close()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="titlebar-no-drag grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-primary hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
