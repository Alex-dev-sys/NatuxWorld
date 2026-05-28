'use client'

import { useEffect, useState } from 'react'
import type { ServerStatus } from '@/lib/types'

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
      <div className="flex items-center gap-2 text-site-muted text-sm">
        <div className="w-2 h-2 rounded-full bg-site-muted animate-pulse" />
        <span>Проверяем статус...</span>
      </div>
    )
  }

  if (!status?.online) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="w-2 h-2 rounded-full bg-site-danger" />
        <span className="text-site-danger font-medium">Оффлайн</span>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="w-2 h-2 rounded-full bg-site-success animate-pulse" />
        <span className="text-site-success font-medium">Онлайн</span>
        <span className="text-site-muted">{status.players.online}/{status.players.max}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-site-success animate-pulse" />
        <span className="text-site-success font-semibold">Онлайн</span>
      </div>
      <div className="flex items-center gap-1 text-site-muted text-sm">
        <span className="text-site-text font-medium">{status.players.online}</span>
        <span>/</span>
        <span>{status.players.max}</span>
        <span className="ml-1">игроков</span>
      </div>
      <span className="text-site-muted text-sm">{status.version}</span>
    </div>
  )
}
