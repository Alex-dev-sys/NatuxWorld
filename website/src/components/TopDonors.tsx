'use client'

import { useEffect, useState } from 'react'
import type { LeaderboardEntry } from '@/app/api/leaderboard/route'
import RankInsignia from './RankInsignia'

export default function TopDonors() {
  const [donors, setDonors] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(setDonors)
      .catch(() => setDonors([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="max-w-7xl mx-auto px-4 py-16">
      <h2 className="font-pixel text-xs md:text-sm text-site-accent text-center mb-2">
        ЗАЛ ЧЕСТИ
      </h2>
      <p className="text-site-muted text-sm text-center mb-10">
        Игроки, которые держат NATUX WORLD живым
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-site-block border border-site-border clip-angle-sm px-4 py-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : donors.length === 0 ? (
        <p className="text-site-muted text-xs text-center opacity-60">
          Пока никто не поддержал сервер. Будь первым!
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {donors.map((d, i) => (
            <div
              key={d.nick}
              style={i === 0 ? { filter: 'drop-shadow(0 0 10px rgba(255,215,0,0.2))' } : undefined}
            >
              <div
                className={`bg-site-block border clip-angle-sm px-4 py-4 flex items-center gap-3 h-full hover:border-opacity-80 transition-colors ${
                  i === 0 ? 'border-yellow-500/60' : 'border-site-border'
                }`}
              >
                <span className="flex-shrink-0">
                  <RankInsignia rank={d.rank} size={28} />
                </span>
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-sm text-site-text truncate">{d.nick}</div>
                  <div className="text-xs font-semibold text-site-muted">{d.rank}</div>
                </div>
                {i === 0 && (
                  <span className="ml-auto text-yellow-400 text-xs font-bold flex-shrink-0">№1</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-site-muted text-xs text-center mt-6 opacity-60">
        Купи ранг — и твоё имя появится здесь
      </p>
    </section>
  )
}
