'use client'

import { useEffect, useState } from 'react'
import { fetchJson } from './api'
import type { Stats, AdminUser, LoginEvent, LiveEvent, GameToken, CrashReport, AuditRow } from './types'
import { fmtDate, KIND_BADGE } from './format'
import { StatCard, Table, Tr, Td } from './ui'

// ── Dashboard Tab ──────────────────────────────────────────────────────────────
export function DashTab({ stats, events, liveEvents }: { stats: Stats | null; events: LoginEvent[]; liveEvents: LiveEvent[] }) {
  const liveActivity = liveEvents.filter(e => e.type !== 'ping' && e.type !== 'connected').slice(-8).reverse()
  if (!stats) return <div className="text-center text-site-muted py-16">Загрузка...</div>
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Юзеры" value={stats.users.total} sub={`${stats.users.verified} верифиц.`} />
        <StatCard label="Заказы" value={stats.orders.total} sub={`+${stats.orders.today} сегодня`} />
        <StatCard label="Выручка" value={`${stats.orders.revenue.toLocaleString('ru')} р`} color="text-site-accent" />
        <StatCard label="Сессии" value={stats.sessions.active} sub="в игре сейчас" color="text-blue-400" />
        <StatCard label="Логины" value={stats.logins.today} sub={`${stats.logins.failsToday} fail`} color="text-green-400" />
        <StatCard label="Краши" value={stats.crashes.today} sub={`${stats.crashes.total} всего`} color={stats.crashes.today > 0 ? 'text-red-400' : 'text-site-text'} />
      </div>
      {liveActivity.length > 0 && (
        <div className="bg-site-block border border-green-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs uppercase tracking-wider font-medium">Live</span>
          </div>
          <div className="space-y-1.5">
            {liveActivity.map((e, i) => {
              const d = e.data as Record<string, string> | undefined
              if (e.type === 'login_event') return <div key={i} className="flex gap-3 text-xs"><span className={`px-1.5 py-0.5 rounded ${KIND_BADGE[d?.kind ?? ''] ?? 'text-site-muted bg-site-border/30'}`}>{d?.kind}</span><span className="font-mono text-site-muted">{d?.ip}</span></div>
              if (e.type === 'order') return <div key={i} className="flex gap-3 text-xs"><span className="px-1.5 py-0.5 rounded text-yellow-400 bg-yellow-400/10">order</span><span className="font-mono">{d?.username}</span><span className="text-site-muted">{d?.productName}</span></div>
              if (e.type === 'crash') return <div key={i} className="flex gap-3 text-xs"><span className="px-1.5 py-0.5 rounded text-red-400 bg-red-400/10">crash</span><span className="text-site-muted truncate max-w-xs">{d?.message}</span></div>
              return null
            })}
          </div>
        </div>
      )}
      <div>
        <div className="text-site-muted text-xs uppercase tracking-wider mb-3">Последняя активность</div>
        <Table cols={['Время', 'Юзер', 'Событие', 'IP']}>
          {events.slice(0, 15).map(e => (
            <Tr key={e.id}>
              <Td className="text-site-muted text-xs whitespace-nowrap">{fmtDate(e.createdAt)}</Td>
              <Td className="font-mono text-xs">{e.username ?? <span className="text-site-muted">—</span>}</Td>
              <Td><span className={`px-2 py-0.5 rounded text-xs font-medium ${KIND_BADGE[e.kind] ?? 'text-site-muted bg-site-border/30'}`}>{e.kind}</span></Td>
              <Td className="font-mono text-xs text-site-muted">{e.ip}</Td>
            </Tr>
          ))}
        </Table>
      </div>
    </div>
  )
}

// ── Users Tab ──────────────────────────────────────────────────────────────────
export function UsersTab({ users, onSelect, onUpdate }: { users: AdminUser[]; onSelect: (id: string) => void; onUpdate: (u: Partial<AdminUser>) => void }) {
  const [q, setQ] = useState('')
  const [filterBanned, setFilterBanned] = useState(false)
  let filtered = q ? users.filter(u => u.username.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())) : users
  if (filterBanned) filtered = filtered.filter(u => u.bannedAt)
  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <input placeholder="Поиск по нику или email..." value={q} onChange={e => setQ(e.target.value)}
          className="flex-1 min-w-[200px] max-w-sm bg-site-block border border-site-border focus:border-site-accent rounded px-3 py-2 text-sm text-site-text placeholder-site-muted/50 focus:outline-none transition-colors" />
        <button onClick={() => setFilterBanned(v => !v)}
          className={`px-3 py-2 text-xs border rounded transition-colors ${filterBanned ? 'border-red-500/50 text-red-400 bg-red-500/10' : 'border-site-border text-site-muted hover:border-site-accent/50'}`}>
          {filterBanned ? 'x Только banned' : 'Фильтр: banned'}
        </button>
        <span className="text-site-muted text-xs">{filtered.length} / {users.length}</span>
      </div>
      <Table cols={['Ник', 'Email', 'Верифицирован', 'tokenVer', 'Заказы', 'Последний вход', 'Регистрация', '']}>
        {filtered.map(u => (
          <Tr key={u.id}>
            <Td>
              <button onClick={() => onSelect(u.id)} className="font-mono font-medium hover:text-site-accent transition-colors flex items-center gap-2">
                {u.username}
                {u.bannedAt && <span className="text-[10px] px-1 rounded bg-red-500/20 text-red-400">BAN</span>}
              </button>
            </Td>
            <Td className="text-site-muted text-xs">{u.email}</Td>
            <Td><span className={u.emailVerified ? 'text-green-400' : 'text-red-400'}>{u.emailVerified ? 'да' : 'нет'}</span></Td>
            <Td className="text-center text-site-muted">{u.tokenVersion}</Td>
            <Td className="text-center">{u.orders}</Td>
            <Td className="text-xs text-site-muted whitespace-nowrap">
              {u.lastLogin ? <><div>{fmtDate(u.lastLogin.at)}</div><div className="font-mono">{u.lastLogin.ip}</div></> : '—'}
            </Td>
            <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(u.createdAt)}</Td>
            <Td><button onClick={() => onSelect(u.id)} className="text-xs text-site-accent hover:underline">Открыть</button></Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}

// ── Activity Tab ───────────────────────────────────────────────────────────────
export function ActivityTab({ events }: { events: LoginEvent[] }) {
  const [kind, setKind] = useState('all')
  const filtered = kind === 'all' ? events : events.filter(e => e.kind === kind)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['all', 'login', 'fail', 'join', 'register', 'verify'].map(k => (
          <button key={k} onClick={() => setKind(k)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${kind === k ? 'border-site-accent text-site-accent bg-site-secondary' : 'border-site-border text-site-muted hover:border-site-accent/50'}`}>
            {k === 'all' ? 'Все' : k}
          </button>
        ))}
      </div>
      <Table cols={['Время', 'Юзер', 'Событие', 'IP', 'User-Agent']}>
        {filtered.map(e => (
          <Tr key={e.id}>
            <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(e.createdAt)}</Td>
            <Td className="font-mono text-xs">{e.username ?? <span className="text-site-muted">—</span>}</Td>
            <Td><span className={`px-2 py-0.5 rounded text-xs font-medium ${KIND_BADGE[e.kind] ?? 'text-site-muted bg-site-border/30'}`}>{e.kind}</span></Td>
            <Td className="font-mono text-xs">{e.ip}</Td>
            <Td className="text-xs text-site-muted max-w-[200px] truncate">{e.userAgent || '—'}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}

// ── Sessions Tab ───────────────────────────────────────────────────────────────
export function SessionsTab({ tokens }: { tokens: GameToken[] }) {
  const online = tokens.filter(t => t.hasServerId)
  return (
    <div className="space-y-4">
      <div className="text-site-muted text-xs">{online.length} в игре сейчас · {tokens.length} токенов всего</div>
      <Table cols={['Токен', 'Юзер', 'Email', 'В игре', 'Выдан']}>
        {tokens.map((t, i) => (
          <Tr key={i}>
            <Td className="font-mono text-xs text-site-muted">{t.accessToken}</Td>
            <Td className="font-mono text-sm">{t.user?.username ?? <span className="text-site-muted">—</span>}</Td>
            <Td className="text-xs text-site-muted">{t.user?.email ?? '—'}</Td>
            <Td><span className={t.hasServerId ? 'text-green-400' : 'text-site-muted'}>{t.hasServerId ? 'online' : '—'}</span></Td>
            <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(t.createdAt)}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}

// ── Crash Reports Tab ──────────────────────────────────────────────────────────
export function CrashTab({ reports, onSelect, selected }: { reports: CrashReport[]; onSelect: (id: string) => void; selected: CrashReport | null }) {
  if (selected) return (
    <div className="space-y-4">
      <button onClick={() => onSelect('')} className="text-site-accent text-sm hover:underline">Назад к списку</button>
      <div className="bg-site-block border border-site-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-2 py-0.5 rounded text-xs bg-red-400/10 text-red-400">{selected.kind}</span>
          <span className="text-site-muted text-xs">{selected.stage}</span>
          <span className="text-site-muted text-xs">{selected.platform}/{selected.arch}</span>
          <span className="text-site-muted text-xs">v{selected.version}</span>
          {selected.exitCode != null && <span className="text-site-muted text-xs">exit: {selected.exitCode}</span>}
          <span className="text-site-muted text-xs ml-auto">{fmtDate(selected.createdAt)}</span>
        </div>
        <div className="text-sm text-red-300 bg-red-900/20 rounded p-3 font-mono break-all">{selected.message}</div>
        {selected.logs && selected.logs.length > 0 && (
          <div>
            <div className="text-site-muted text-xs uppercase tracking-wider mb-2">Логи ({selected.logs.length} строк)</div>
            <div className="bg-black/40 rounded p-3 max-h-96 overflow-y-auto text-xs font-mono text-site-muted space-y-0.5">
              {selected.logs.map((l, i) => <div key={i} className="break-all">{l}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
  return (
    <Table cols={['Время', 'Kind', 'Stage', 'Сообщение', 'Exit', 'v', 'OS']}>
      {reports.map(r => (
        <Tr key={r.id}>
          <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(r.createdAt)}</Td>
          <Td><span className="px-2 py-0.5 rounded text-xs bg-red-400/10 text-red-400">{r.kind}</span></Td>
          <Td className="text-xs text-site-muted">{r.stage}</Td>
          <Td className="text-xs max-w-[260px] truncate"><button onClick={() => onSelect(r.id)} className="text-left hover:text-site-accent transition-colors">{r.message}</button></Td>
          <Td className="text-xs text-site-muted text-center">{r.exitCode ?? '—'}</Td>
          <Td className="text-xs text-site-muted">{r.version}</Td>
          <Td className="text-xs text-site-muted">{r.platform}</Td>
        </Tr>
      ))}
    </Table>
  )
}

// ── Audit Tab ───────────────────────────────────────────────────────────────────
export function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchJson<AuditRow[]>(`/api/admin/audit${filter ? `?action=${filter}` : ''}`)
      // An error body is not a row list — guard the shape before rows.map runs.
      .then(d => { if (!cancelled) { setRows(Array.isArray(d) ? d : []); setError(Array.isArray(d) ? null : 'Неожиданный ответ сервера') } })
      .catch(e => { if (!cancelled) { setRows([]); setError(e instanceof Error ? e.message : 'Ошибка загрузки') } })
    return () => { cancelled = true }
  }, [filter])
  const FILTERS = ['', 'user', 'player', 'rcon', 'coupon', 'order']
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f || 'all'} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${filter === f ? 'border-site-accent text-site-accent' : 'border-site-border text-site-muted hover:border-site-accent/50'}`}>
            {f || 'Все'}
          </button>
        ))}
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}
      <Table cols={['Время', 'Действие', 'Цель', 'Параметры', 'IP', 'OK']}>
        {rows.map(r => (
          <Tr key={r.id}>
            <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(r.createdAt)}</Td>
            <Td><span className="px-2 py-0.5 rounded text-xs bg-site-border/30 text-site-text font-mono">{r.action}</span></Td>
            <Td className="font-mono text-xs">{r.target ?? '—'}</Td>
            <Td className="text-xs text-site-muted max-w-[280px] truncate">{JSON.stringify(r.params)}</Td>
            <Td className="font-mono text-xs text-site-muted">{r.ip}</Td>
            <Td className={r.ok ? 'text-green-400' : 'text-red-400'}>{r.ok ? 'да' : 'нет'}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}
