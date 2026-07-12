import { motion, AnimatePresence } from 'framer-motion';
import { Server, Copy, Check, ChevronDown, Lock, Unlock, Map as MapIcon, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useServerStatus } from '../hooks/useServerStatus';
import { useLang, pick } from '../i18n';

const ru = {
  ip: 'IP адрес', mode: 'Режим', anarchy: 'Анархия', version: 'Версия',
  tps: 'TPS', tpsGood: 'отлично', ping: 'Пинг', ms: 'мс',
  serverInfo: 'Информация о сервере',
  map: 'Карта', difficulty: 'Сложность',
  whitelistOn: 'Включён', whitelistOff: 'Выключен',
  about: 'Сервер NATUX WORLD. Анархия. Сезон 7. Гриф разрешён, PvP включён.',
  collapse: 'Свернуть', more: 'Подробнее о сервере',
};
const en: typeof ru = {
  ip: 'IP address', mode: 'Mode', anarchy: 'Anarchy', version: 'Version',
  tps: 'TPS', tpsGood: 'excellent', ping: 'Ping', ms: 'ms',
  serverInfo: 'Server info',
  map: 'Map', difficulty: 'Difficulty',
  whitelistOn: 'On', whitelistOff: 'Off',
  about: 'NATUX WORLD server. Anarchy. Season 7. Griefing allowed, PvP enabled.',
  collapse: 'Collapse', more: 'Server details',
};
const TR = { ru, en };

export function ServerInfo() {
  const t = pick(useLang(), TR);
  const { status, info } = useServerStatus();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copyIp = async () => {
    if (!info) return;
    await navigator.clipboard.writeText(info.ip);
    setCopied(true);
  };

  const rows: Array<[string, React.ReactNode]> = [
    [
      t.ip,
      <button
        key="ip"
        onClick={copyIp}
        className="group inline-flex items-center gap-1.5 text-white hover:text-primary transition"
      >
        <span className="font-mono text-sm">{info?.ip ?? 'mc.vibestudy.ru'}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
        )}
      </button>,
    ],
    [t.mode, <span key="mode">{info?.mode ?? t.anarchy}</span>],
    [t.version, <span key="ver">{info?.version ?? '1.21.1 Forge'}</span>],
    [
      t.tps,
      <span key="tps" className="text-success">
        {status?.tps?.toFixed(1) ?? '20.0'} ({t.tpsGood})
      </span>,
    ],
    [
      t.ping,
      <span key="ping" className="text-success">
        {status?.ping ?? 52} {t.ms}
      </span>,
    ],
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="relative flex flex-col gap-3 rounded-2xl glass p-4 shadow-premium"
    >
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-success/15 text-success">
          <Server className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">
          {t.serverInfo}
        </span>
      </div>
      <div className="flex flex-col">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`flex items-center justify-between py-2 text-sm ${
              i < rows.length - 1 ? 'border-b border-white/[0.04]' : ''
            }`}
          >
            <span className="text-muted">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="extra"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 0.8, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-1">
              <ExtraRow icon={<MapIcon className="h-3.5 w-3.5" />} label={t.map} value={info?.map ?? 'world_anarchy'} />
              <ExtraRow icon={<ShieldAlert className="h-3.5 w-3.5" />} label={t.difficulty} value={info?.difficulty ?? 'Hard'} />
              <ExtraRow
                icon={info?.whitelist ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                label="Whitelist"
                value={info?.whitelist ? t.whitelistOn : t.whitelistOff}
              />
              <div className="mt-1 rounded-xl bg-white/[0.02] p-3 text-xs leading-relaxed text-muted ring-1 ring-white/[0.04]">
                {t.about}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="group mt-1 flex items-center justify-center gap-1 rounded-xl bg-white/[0.03] py-2 text-[11px] font-semibold uppercase tracking-wider text-white/70 ring-1 ring-white/[0.05] hover:bg-white/[0.06] hover:text-white"
      >
        {expanded ? t.collapse : t.more}
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </motion.div>
  );
}

function ExtraRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-1.5 text-xs ring-1 ring-white/[0.04]">
      <span className="flex items-center gap-2 text-muted">
        <span className="text-primary/80">{icon}</span>
        {label}
      </span>
      <span className="font-medium text-white/90">{value}</span>
    </div>
  );
}
