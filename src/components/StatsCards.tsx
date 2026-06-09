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
        icon={<Wifi className="h-4 w-4" />}
        label="Состояние"
        value={
          isOnline
            ? <span className="text-success">ОНЛАЙН</span>
            : <span className="text-red-400">ОФФЛАЙН</span>
        }
        data={seed(isOnline ? 1 : 0, history.online)}
        color={stateColor}
        delay={0.05}
      />
      <StatCard
        icon={<Users className="h-4 w-4" />}
        label="Игроков онлайн"
        value={status ? `${players}/${maxPlayers}` : '—'}
        data={seed(players, history.players)}
        color={lColor}
        delay={0.1}
      />
      <StatCard
        icon={<Gauge className="h-4 w-4" />}
        label="TPS"
        value={<span style={{ color: tColor }}>{tps === null ? '—' : tps.toFixed(1)}</span>}
        data={seed(tps ?? 0, history.tps)}
        color={tColor}
        delay={0.15}
      />
      <StatCard
        icon={<Server className="h-4 w-4" />}
        label="Пинг"
        value={ping ? `${ping} мс` : '—'}
        data={seed(ping ?? 0, history.ping)}
        color={pColor}
        delay={0.2}
      />
    </div>
  );
}
