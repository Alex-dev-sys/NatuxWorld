import { Wifi, Users, Gauge, Server } from 'lucide-react';
import { StatCard } from './StatCard';
import { useServerStatus } from '../hooks/useServerStatus';

function rnd(seed: number, n: number, base: number, variance: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(base + (s / 233280 - 0.5) * variance);
  }
  return out;
}

export function StatsCards() {
  const { status } = useServerStatus();

  const isOnline = status?.online ?? false;
  const tps = status?.tps ?? null;
  const tpsColor = tps === null ? '#888' : tps >= 18 ? '#00FF7F' : tps >= 15 ? '#FF8A00' : '#FF2B4F';
  const tpsLabel = tps === null ? '—' : `${tps.toFixed(1)}`;

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
        data={rnd(1, 24, 52, 24)}
        color={isOnline ? '#00FF7F' : '#FF2B4F'}
        delay={0.05}
      />
      <StatCard
        icon={<Users className="h-4 w-4" />}
        label="Игроков онлайн"
        value={status ? `${status.players}/${status.maxPlayers}` : '—'}
        data={rnd(2, 24, 10, 20)}
        color="#FF2B4F"
        delay={0.1}
      />
      <StatCard
        icon={<Gauge className="h-4 w-4" />}
        label="TPS"
        value={<span style={{ color: tpsColor }}>{tpsLabel}</span>}
        data={rnd(3, 24, 19, 3)}
        color={tpsColor}
        delay={0.15}
      />
      <StatCard
        icon={<Server className="h-4 w-4" />}
        label="Пинг"
        value={status?.ping ? `${status.ping} мс` : '—'}
        data={rnd(4, 24, 50, 30)}
        color="#FF8A00"
        delay={0.2}
      />
    </div>
  );
}
