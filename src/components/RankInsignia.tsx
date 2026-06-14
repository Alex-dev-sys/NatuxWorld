import type { ReactNode } from 'react'

export const RANK_COLORS: Record<string, string> = {
  baron: '#9B8B6E',
  knight: '#A8A8A8',
  guard: '#5B8EAD',
  ranger: '#2E7D32',
  hero: '#4CAF50',
  shadow: '#7C3AED',
  aspid: '#9C27B0',
  warlord: '#D97706',
  squid: '#FF9800',
  phantom: '#00BCD4',
  head: '#F44336',
  demon: '#C62828',
  elite: '#FF2B4F',
  king: '#FFD700',
  god: '#F9FAFB',
}

const RANK_ORDER: string[] = [
  'baron', 'knight', 'guard', 'ranger', 'hero',
  'shadow', 'aspid', 'warlord', 'squid', 'phantom',
  'head', 'demon', 'elite', 'king', 'god',
]

/** Точки звезды (spikes лучей), верхний луч направлен вверх */
function starPoints(cx: number, cy: number, outer: number, inner: number, spikes: number): string {
  const pts: string[] = []
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI * i) / spikes - Math.PI / 2
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

/** Шеврон ^ шириной 14px, вершина в точке y */
function chevron(y: number, color: string, key: string | number): ReactNode {
  return (
    <path
      key={key}
      d={`M5 ${y + 4} L12 ${y} L19 ${y + 4}`}
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
  )
}

/** Тиры 1–5: стопка шевронов, число = тир */
function chevronStack(count: number, color: string): ReactNode[] {
  const span = 4 + (count - 1) * 4.5
  const top = 12 - span / 2
  return Array.from({ length: count }, (_, i) => chevron(top + i * 4.5, color, i))
}

/** Тиры 6–10: шеврон-база + 4-конечная звезда; звезда растёт, выше — доп. планки */
function star4Insignia(sub: number, color: string): ReactNode[] {
  const outer = 3 + Math.min(sub, 3) * 0.9
  const els: ReactNode[] = [
    <polygon key="star" points={starPoints(12, 7, outer, outer * 0.36, 4)} fill={color} />,
    chevron(14, color, 'ch'),
  ]
  if (sub >= 4) els.push(<rect key="b1" x={6.5} y={19.4} width={11} height={1.6} fill={color} />)
  if (sub >= 5) els.push(<rect key="b2" x={6.5} y={22} width={11} height={1.6} fill={color} />)
  return els
}

/** Тиры 11–13: одна, две или три 5-конечные звезды */
function star5Insignia(count: number, color: string): ReactNode[] {
  if (count === 1) {
    return [<polygon key="s1" points={starPoints(12, 12.8, 8, 3.3, 5)} fill={color} />]
  }
  if (count === 2) {
    return [7, 17].map((cx, i) => (
      <polygon key={`s${i}`} points={starPoints(cx, 12.4, 5, 2.1, 5)} fill={color} />
    ))
  }
  return [4.5, 12, 19.5].map((cx, i) => (
    <polygon key={`s${i}`} points={starPoints(cx, 12.3, 4.2, 1.8, 5)} fill={color} />
  ))
}

/** Тир 14: звезда с силуэтом короны */
function kingInsignia(color: string): ReactNode[] {
  return [
    <path key="crown" d="M5.5 8 L5.5 2.5 L9 5.5 L12 1.5 L15 5.5 L18.5 2.5 L18.5 8 Z" fill={color} />,
    <polygon key="star" points={starPoints(12, 16, 6, 2.5, 5)} fill={color} />,
  ]
}

/** Тир 15: лучистая звезда со слоем свечения */
function godInsignia(color: string): ReactNode[] {
  const rays: ReactNode[] = Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI * i) / 4 - Math.PI / 2
    return (
      <line
        key={`r${i}`}
        x1={(12 + 7.8 * Math.cos(a)).toFixed(2)}
        y1={(12 + 7.8 * Math.sin(a)).toFixed(2)}
        x2={(12 + 11 * Math.cos(a)).toFixed(2)}
        y2={(12 + 11 * Math.sin(a)).toFixed(2)}
        stroke={color}
        strokeWidth={1.4}
      />
    )
  })
  return [
    <polygon key="glow" points={starPoints(12, 12, 9, 3.6, 5)} fill={color} opacity={0.22} />,
    ...rays,
    <polygon key="star" points={starPoints(12, 12, 6.2, 2.5, 5)} fill={color} />,
  ]
}

export default function RankInsignia({ rank, size = 24 }: { rank: string; size?: number }) {
  const key = rank.trim().toLowerCase()
  const color = RANK_COLORS[key]
  const tier = RANK_ORDER.indexOf(key) + 1

  let body: ReactNode
  if (!color || tier === 0) {
    body = chevron(10, '#888888', 'fallback')
  } else if (tier <= 5) {
    body = chevronStack(tier, color)
  } else if (tier <= 10) {
    body = star4Insignia(tier - 5, color)
  } else if (tier <= 13) {
    body = star5Insignia(tier - 10, color)
  } else if (tier === 14) {
    body = kingInsignia(color)
  } else {
    body = godInsignia(color)
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={`Ранг: ${rank}`}
      shapeRendering="geometricPrecision"
    >
      {body}
    </svg>
  )
}
