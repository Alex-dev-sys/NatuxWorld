// Пиксельные ауры рангов — анимированные частицы вокруг герба.
// Виды: rise (вверх), fall (вниз), mist (дрейф), twinkle (мерцание),
// orbit (по кругу), bolt (вспышки), rays (вращающиеся лучи).
// Позиции детерминированы от индекса — SSR/CSR совпадают.

type AuraKind = 'rise' | 'fall' | 'mist' | 'twinkle' | 'orbit' | 'bolt' | 'rays'

interface AuraConfig {
  kind: AuraKind
  colors: string[]
  n: number
  dur: number
  px?: number
}

const AURAS: Record<string, AuraConfig> = {
  // бронзовая пыль
  baron: { kind: 'rise', colors: ['#C9B98F', '#9B8B6E'], n: 3, dur: 3.4, px: 2 },
  // блики на стали
  knight: { kind: 'twinkle', colors: ['#FFFFFF', '#D8D8D8'], n: 4, dur: 2.4, px: 2 },
  // патрульный огонь по периметру
  guard: { kind: 'orbit', colors: ['#9CC4DE'], n: 2, dur: 4.5, px: 3 },
  // падающая листва
  ranger: { kind: 'fall', colors: ['#5FBF6A', '#2E7D32', '#8CE08F'], n: 4, dur: 3.0, px: 2 },
  // изумрудные искры доблести
  hero: { kind: 'rise', colors: ['#8CE08F', '#4CAF50'], n: 4, dur: 2.4, px: 2 },
  // фиолетовый дым
  shadow: { kind: 'mist', colors: ['#9D6FF0', '#6D28D9'], n: 4, dur: 3.2, px: 3 },
  // капли яда
  aspid: { kind: 'fall', colors: ['#D6E84D', '#A6C72E'], n: 3, dur: 2.2, px: 2 },
  // искры из горна
  warlord: { kind: 'rise', colors: ['#FFB347', '#FF6B35', '#FFE14D'], n: 5, dur: 1.8, px: 2 },
  // пузыри из глубины
  squid: { kind: 'rise', colors: ['#FFC777', '#FFE3B3'], n: 4, dur: 3.6, px: 3 },
  // призрачные огни на орбите
  phantom: { kind: 'orbit', colors: ['#7FE7F2', '#35C759', '#00BCD4'], n: 3, dur: 3.2, px: 2 },
  // алый туман душ
  head: { kind: 'mist', colors: ['#FF6B6B', '#D32F2F'], n: 4, dur: 3.6, px: 3 },
  // пламя преисподней
  demon: { kind: 'rise', colors: ['#FF4D4D', '#FFB347', '#FFE14D'], n: 6, dur: 1.4, px: 2 },
  // электрические разряды
  elite: { kind: 'bolt', colors: ['#FFFFFF', '#FF8FA3', '#FF2B4F'], n: 3, dur: 1.7, px: 2 },
  // золотое сияние
  king: { kind: 'twinkle', colors: ['#FFE14D', '#FFF7C2', '#FFD700'], n: 5, dur: 1.9, px: 2 },
  // вращающийся нимб лучей
  god: { kind: 'rays', colors: ['#FFFFFF', '#FFD700'], n: 8, dur: 7, px: 2 },
}

// детерминированный «шум» от индекса
const ix = (i: number, m: number, salt: number) => ((i * 61 + salt * 37) % m)

function Particle({
  cfg,
  i,
  size,
}: {
  cfg: AuraConfig
  i: number
  size: number
}) {
  const color = cfg.colors[i % cfg.colors.length]
  const px = cfg.px ?? 2
  const delay = -(i * cfg.dur) / cfg.n
  const left = 8 + ix(i, 84, 5)
  const dur = cfg.dur * (1 + ix(i, 40, 11) / 100)

  const base: React.CSSProperties = {
    position: 'absolute',
    width: px,
    height: px,
    backgroundColor: color,
    imageRendering: 'pixelated',
    animationDelay: `${delay}s`,
    animationDuration: `${dur}s`,
  }

  switch (cfg.kind) {
    case 'rise':
      return (
        <span
          className="aura-p aura-rise"
          style={{ ...base, left: `${left}%`, bottom: '4%' }}
        />
      )
    case 'fall':
      return (
        <span
          className="aura-p aura-fall"
          style={{ ...base, left: `${left}%`, top: '8%' }}
        />
      )
    case 'mist':
      return (
        <span
          className="aura-p aura-mist"
          style={{
            ...base,
            left: `${10 + ix(i, 60, 3)}%`,
            top: `${20 + ix(i, 55, 7)}%`,
            width: px + 1,
            height: px + 1,
          }}
        />
      )
    case 'twinkle':
      return (
        <span
          className="aura-p aura-twinkle"
          style={{
            ...base,
            left: `${6 + ix(i, 80, 9)}%`,
            top: `${6 + ix(i, 78, 13)}%`,
            boxShadow: `0 0 4px ${color}`,
          }}
        />
      )
    case 'bolt':
      // вертикальный штрих-разряд
      return (
        <span
          className="aura-p aura-bolt"
          style={{
            ...base,
            left: `${10 + ix(i, 76, 5)}%`,
            top: `${ix(i, 50, 3)}%`,
            width: px,
            height: px * 3,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      )
    case 'orbit':
      return (
        <span
          className="aura-orbit-arm"
          style={{
            position: 'absolute',
            inset: 0,
            animationDelay: `${delay}s`,
            animationDuration: `${cfg.dur}s`,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: px,
              height: px,
              marginTop: -px / 2,
              marginLeft: size * 0.58,
              backgroundColor: color,
              boxShadow: `0 0 4px ${color}`,
            }}
          />
        </span>
      )
    default:
      return null
  }
}

export default function RankAura({
  rank,
  size = 44,
}: {
  rank: string
  size?: number
}) {
  const cfg = AURAS[rank.trim().toLowerCase()]
  if (!cfg) return null

  if (cfg.kind === 'rays') {
    const rays = Array.from({ length: cfg.n }, (_, i) => (
      <span
        key={i}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 2,
          height: size * 0.4,
          marginLeft: -1,
          marginTop: -size * 0.2,
          backgroundColor: cfg.colors[i % cfg.colors.length],
          opacity: 0.7,
          transform: `rotate(${(360 / cfg.n) * i}deg) translateY(${-size * 0.58}px)`,
        }}
      />
    ))
    return (
      <span className="rank-aura" aria-hidden="true">
        <span
          className="aura-rays"
          style={{ position: 'absolute', inset: 0, animationDuration: `${cfg.dur}s` }}
        >
          {rays}
        </span>
        {Array.from({ length: 3 }, (_, i) => (
          <Particle key={`t${i}`} cfg={{ ...cfg, kind: 'twinkle', n: 3 }} i={i} size={size} />
        ))}
      </span>
    )
  }

  return (
    <span className="rank-aura" aria-hidden="true">
      {Array.from({ length: cfg.n }, (_, i) => (
        <Particle key={i} cfg={cfg} i={i} size={size} />
      ))}
    </span>
  )
}
