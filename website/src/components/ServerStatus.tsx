'use client'

import { useEffect, useState } from 'react'
import type { ServerStatus } from '@/lib/types'

const MONO = { fontFamily: '"JetBrains Mono", monospace' }

export default function ServerStatus({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/server/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ online: false, players: { online: 0, max: 0 }, version: '?' }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px]" style={MONO}>
        <span className="w-1.5 h-1.5 bg-site-muted animate-pulse" style={{ display: 'inline-block' }} />
        <span className="text-site-muted tracking-[0.25em] uppercase">[ ПОИСК СИГНАЛА ]</span>
      </div>
    )
  }

  if (!status?.online) {
    return (
      <div className="flex items-center gap-2 text-[11px]" style={MONO}>
        <span className="w-1.5 h-1.5 bg-site-danger" style={{ display: 'inline-block', boxShadow: '0 0 6px rgba(255,59,48,0.8)' }} />
        <span className="text-site-danger tracking-[0.25em] uppercase font-medium">[ СВЯЗЬ ПОТЕРЯНА ]</span>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[11px]" style={MONO}>
        <span className="w-1.5 h-1.5 bg-site-success animate-pulse-dot" style={{ display: 'inline-block', boxShadow: '0 0 6px rgba(53,199,89,0.8)' }} />
        <span className="text-site-success tracking-[0.25em] uppercase font-medium">[ СИГНАЛ: СТАБИЛЕН ]</span>
        <span className="text-site-muted tracking-wider">{status.players.online}/{status.players.max}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]" style={MONO}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-site-success animate-pulse-dot" style={{ display: 'inline-block', boxShadow: '0 0 8px rgba(53,199,89,0.8)' }} />
        <span className="text-site-success tracking-[0.25em] uppercase font-semibold">[ СИГНАЛ: СТАБИЛЕН ]</span>
      </div>
      <div className="flex items-center gap-1.5 text-site-muted tracking-wider uppercase">
        <span className="text-[#888]">{'//'} ОПЕРАТИВНИКОВ:</span>
        <span className="text-site-text font-medium">{status.players.online}</span>
        <span className="text-[#3A1017]">/</span>
        <span>{status.players.max}</span>
      </div>
      <span className="text-[#888] tracking-wider uppercase">{'//'} BUILD: <span className="text-site-muted">{status.version}</span></span>
    </div>
  )
}
