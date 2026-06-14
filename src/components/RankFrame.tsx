// Премиальное обрамление активной карточки ранга.
// Слои: дышащее свечение → (внешняя пунктирная рамка) → тонкий контур →
// бегущая искра по периметру → угловые маркеры / самоцветы.
// Богатство нарастает от Baron к God; цвет уникален у каждого ранга.

const ORDER = [
  'baron', 'knight', 'guard', 'ranger', 'hero', 'shadow', 'aspid', 'warlord',
  'squid', 'phantom', 'head', 'demon', 'elite', 'king', 'god',
]

interface FrameSpec {
  ring: number       // толщина бегущей искры, px
  speed: number      // период оборота искры, с (меньше = быстрее)
  breathe: number    // период пульсации свечения, с
  beams: 1 | 2       // одна или две искры
  outer: boolean     // внешняя пунктирная рамка
  corners: boolean   // угловые L-маркеры
  gems: boolean      // самоцветы в углах (топ-класс)
}

function specFor(rank: string): FrameSpec {
  const tier = ORDER.indexOf(rank) + 1 // 1..15, 0 -> -1+1=0 для неизвестного
  if (rank === 'god') {
    return { ring: 2.5, speed: 3.2, breathe: 2.4, beams: 2, outer: true, corners: true, gems: true }
  }
  if (rank === 'king') {
    return { ring: 2.5, speed: 3.6, breathe: 2.6, beams: 2, outer: true, corners: false, gems: true }
  }
  if (tier >= 13) {
    return { ring: 2, speed: 3.8, breathe: 2.8, beams: 2, outer: true, corners: true, gems: false }
  }
  if (tier >= 10) {
    return { ring: 2, speed: 4.2, breathe: 3.0, beams: 2, outer: true, corners: true, gems: false }
  }
  if (tier >= 7) {
    return { ring: 2, speed: 4.6, breathe: 3.2, beams: 2, outer: false, corners: true, gems: false }
  }
  if (tier >= 4) {
    return { ring: 1.5, speed: 5.0, breathe: 3.4, beams: 1, outer: false, corners: true, gems: false }
  }
  // tier 1..3 и неизвестные — сдержанный базовый контур
  return { ring: 1.5, speed: 5.4, breathe: 3.6, beams: 1, outer: false, corners: false, gems: false }
}

export default function RankFrame({
  rank,
  color,
}: {
  rank: string
  color: string
}) {
  const spec = specFor(rank.trim().toLowerCase())

  const vars = {
    ['--rf-c' as string]: color,
    ['--rf-ring' as string]: `${spec.ring}px`,
    ['--rf-speed' as string]: `${spec.speed}s`,
    ['--rf-breathe' as string]: `${spec.breathe}s`,
  } as React.CSSProperties

  return (
    <span className="rank-frame" style={vars} aria-hidden="true">
      <span className="rank-frame__glow" />
      {spec.outer && <span className="rank-frame__outer" />}
      <span className="rank-frame__edge" />
      <span className={`rank-frame__beam${spec.beams === 2 ? ' rank-frame__beam--two' : ''}`} />

      {spec.corners && (
        <>
          <span className="rank-frame__corner rank-frame__corner--tl" />
          <span className="rank-frame__corner rank-frame__corner--tr" />
          <span className="rank-frame__corner rank-frame__corner--bl" />
          <span className="rank-frame__corner rank-frame__corner--br" />
        </>
      )}

      {spec.gems && (
        <>
          <span className="rank-frame__gem rank-frame__gem--tl" />
          <span className="rank-frame__gem rank-frame__gem--tr" />
          <span className="rank-frame__gem rank-frame__gem--bl" />
          <span className="rank-frame__gem rank-frame__gem--br" />
        </>
      )}
    </span>
  )
}
