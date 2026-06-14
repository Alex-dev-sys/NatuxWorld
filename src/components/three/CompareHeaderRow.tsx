'use client'

// Шапка матрицы сравнения: эмблема ранга над каждой колонкой.
// ВАЖНО (перф): раньше тут был отдельный WebGL <Canvas> на КАЖДУЮ из 15 колонок —
// 15 GL-контекстов (лимит браузера ~16) + 15 RAF-циклов → лаги и context-loss.
// Заменено на лёгкую 2D пиксель-эмблему (SVG), без WebGL.

import RankEmblem from '../RankEmblem'

export interface RankSlot {
  id: string
  color: string
}

export default function CompareHeaderRow({ ranks }: { ranks: RankSlot[] }) {
  return (
    <>
      {ranks.map((r) => (
        <th
          key={r.id}
          style={{
            padding: '8px 0 4px',
            borderBottom: `2px solid ${r.color}`,
            borderLeft: '1px solid #160808',
            background: '#0a0405',
            verticalAlign: 'bottom',
          }}
        >
          <div
            aria-hidden="true"
            style={{ display: 'grid', placeItems: 'center', minWidth: 96, height: 64, filter: `drop-shadow(0 0 8px ${r.color}66)` }}
          >
            <RankEmblem rank={r.id} color={r.color} size={48} />
          </div>
        </th>
      ))}
    </>
  )
}
