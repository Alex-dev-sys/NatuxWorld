import { Wifi, Users, MessagesSquare, Calendar } from 'lucide-react';
import { StatCard } from './StatCard';
import { useServerStatus } from '../hooks/useServerStatus';
import { formatUptime } from '../utils/format';

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

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        icon={<Wifi className="h-4 w-4" />}
        label="Состояние"
        value={<span className="text-success">ОНЛАЙН</span>}
        data={rnd(1, 24, 52, 24)}
        color="#00FF7F"
        delay={0.05}
      />
      <StatCard
        icon={<Users className="h-4 w-4" />}
        label="Игроков онлайн"
        value={status?.players ?? 142}
        data={rnd(2, 24, 140, 60)}
        color="#FF2B4F"
        delay={0.1}
      />
      <StatCard
        icon={<MessagesSquare className="h-4 w-4" />}
        label="Участников"
        value="2 500"
        data={rnd(3, 24, 2400, 200)}
        color="#5865F2"
        delay={0.15}
      />
      <StatCard
        icon={<Calendar className="h-4 w-4" />}
        label="Аптайм"
        value={formatUptime(14)}
        data={rnd(4, 24, 18, 6)}
        color="#FF8A00"
        delay={0.2}
      />
    </div>
  );
}
