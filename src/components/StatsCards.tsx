import { Wifi, Users, Gauge, Server } from 'lucide-react';
import { StatCard } from './StatCard';
import { useServerStatus } from '../hooks/useServerStatus';
import { useStatHistory, seed } from '../hooks/useStatHistory';

const GREEN = '#00FF7F';
const ORANGE = '#FF8A00';
const RED = '#FF2B4F';
const GREY = '#888';

function tpsColor(tps: number | null): string {
  if (tps === null) return GREY;
  return tps >= 18 ? GREEN : tps >= 15 ? ORANGE : RED;
}

function pingColor(ping: number | null): string {
  if (!ping) return GREY;
  return ping < 80 ? GREEN : ping < 150 ? ORANGE : RED;
}

function loadColor(players: number, max: number): string {
  if (max <= 0) return GREY;
  const ratio = players / max;
  return ratio >= 0.5 ? RED : ratio >= 0.2 ? ORANGE : GREEN;
}

function tpsLabel(tps: number | null): string {
  if (tps === null) return 'Нет данных';
  return tps >= 18 ? 'Идеальная производительность' : tps >= 15 ? 'Стабильная работа' : 'Просадки тиков';
}

function pingLabel(ping: number | null): string {
  if (!ping) return 'Нет данных';
  return ping < 80 ? 'Отличный отклик' : ping < 150 ? 'Хороший отклик' : 'Высокая задержка';
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="relative inline-flex h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}

export function StatsCards() {
  const { status } = useServerStatus();
  const history = useStatHistory(status);

  const isOnline = status?.online ?? false;
  const tps = status?.tps ?? null;
  const players = status?.players ?? 0;
  const maxPlayers = status?.maxPlayers ?? 0;
  const ping = status?.ping ?? null;

  const stateColor = isOnline ? GREEN : RED;
  const tColor = tpsColor(tps);
  const pColor = pingColor(ping);
  const lColor = loadColor(players, maxPlayers);

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        icon={<Wifi className="h-5 w-5" />}
        label="Состояние"
        value={
          isOnline
            ? <span className="text-[#3DFF99]">ОНЛАЙН</span>
            : <span className="text-[#FF6B81]">ОФФЛАЙН</span>
        }
        hint={
          <>
            <Dot color={stateColor} />
            {isOnline ? 'Сервер работает штатно' : 'Сервер недоступен'}
          </>
        }
        data={seed(isOnline ? 1 : 0, history.online)}
        color={stateColor}
        delay={0.05}
      />
      <StatCard
        icon={<Users className="h-5 w-5" />}
        label="Игроков онлайн"
        value={status ? players : '—'}
        hint={status ? `из ${maxPlayers} слотов` : 'Нет данных'}
        data={seed(players, history.players)}
        color={lColor}
        delay={0.12}
      />
      <StatCard
        icon={<Gauge className="h-5 w-5" />}
        label="TPS"
        value={<span style={{ color: tColor }}>{tps === null ? '—' : tps.toFixed(1)}</span>}
        hint={
          <>
            <Dot color={tColor} />
            {tpsLabel(tps)}
          </>
        }
        data={seed(tps ?? 0, history.tps)}
        color={tColor}
        delay={0.19}
      />
      <StatCard
        icon={<Server className="h-5 w-5" />}
        label="Пинг"
        value={ping ? <>{ping}<span className="ml-1 text-base text-white/40">мс</span></> : '—'}
        hint={
          <>
            <Dot color={pColor} />
            {pingLabel(ping)}
          </>
        }
        data={seed(ping ?? 0, history.ping)}
        color={pColor}
        delay={0.26}
      />
    </div>
  );
}
