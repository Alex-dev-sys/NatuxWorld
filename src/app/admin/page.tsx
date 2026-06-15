'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Stats {
  users: { total: number; verified: number }
  orders: { total: number; today: number; revenue: number }
  sessions: { active: number }
  logins: { today: number; failsToday: number }
  crashes: { today: number; total: number }
}
interface AdminUser {
  id: string; username: string; email: string
  emailVerified: boolean; tokenVersion: number; createdAt: string
  orders: number; lastLogin: { at: string; ip: string } | null
}
interface LoginEvent {
  id: string; userId: string | null; username: string | null
  ip: string; userAgent: string; kind: string; createdAt: string
}
interface GameToken {
  accessToken: string; hasServerId: boolean; createdAt: string
  user: { id: string; username: string; email: string } | null
}
interface CrashReport {
  id: string; kind: string; stage: string; message: string
  exitCode: number | null; version: string; platform: string; arch: string; createdAt: string
  logs?: string[]
}
interface Order {
  id: string; publicId: string; productName: string; variantDurationLabel: string
  username: string; price: number; originalPrice?: number
  status: string; couponCode?: string; createdAt: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = (s: string) => new Date(s).toLocaleString('ru-RU', {
  day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit',
})

const KIND_BADGE: Record<string, string> = {
  login: 'text-green-400 bg-green-400/10',
  fail: 'text-red-400 bg-red-400/10',
  join: 'text-blue-400 bg-blue-400/10',
  register: 'text-yellow-400 bg-yellow-400/10',
  verify: 'text-purple-400 bg-purple-400/10',
}
const ORDER_STATUS_LABEL: Record<string, string> = {
  created: 'Создан', waiting_payment: 'Ожидает', paid: 'Оплачен',
  delivery_pending: 'Выдача…', delivered: 'Выдан',
  delivery_failed: 'Ошибка', cancelled: 'Отменён', refunded: 'Возврат',
}
const ORDER_STATUS_COLOR: Record<string, string> = {
  delivered: 'text-green-400', delivery_failed: 'text-red-400',
  waiting_payment: 'text-yellow-400', delivery_pending: 'text-yellow-400',
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-site-text' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-site-block border border-site-border rounded-lg p-4">
      <div className="text-site-muted text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-site-muted text-xs mt-1">{sub}</div>}
    </div>
  )
}

function Table({ cols, children, empty }: { cols: string[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className="bg-site-block border border-site-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-site-border text-site-muted text-xs uppercase tracking-wider">
              {cols.map(c => <th key={c} className="text-left px-4 py-3 font-medium whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
        {!children || (Array.isArray(children) && children.length === 0) ? (
          <div className="py-12 text-center text-site-muted text-sm">{empty ?? 'Нет данных'}</div>
        ) : null}
      </div>
    </div>
  )
}

function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-site-border/40 hover:bg-white/[0.02] transition-colors">{children}</tr>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────
function DashTab({ stats, events }: { stats: Stats | null; events: LoginEvent[] }) {
  if (!stats) return <div className="text-center text-site-muted py-16">Загрузка…</div>
  const recent = events.slice(0, 15)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Юзеры" value={stats.users.total} sub={`${stats.users.verified} верифиц.`} />
        <StatCard label="Заказы" value={stats.orders.total} sub={`+${stats.orders.today} сегодня`} />
        <StatCard label="Выручка" value={`${stats.orders.revenue.toLocaleString('ru')} ₽`} color="text-site-accent" />
        <StatCard label="Сессии" value={stats.sessions.active} sub="активных в игре" color="text-blue-400" />
        <StatCard label="Логины" value={stats.logins.today} sub={`${stats.logins.failsToday} fail`} color="text-green-400" />
        <StatCard label="Краши" value={stats.crashes.today} sub={`${stats.crashes.total} всего`} color={stats.crashes.today > 0 ? 'text-red-400' : 'text-site-text'} />
      </div>
      <div>
        <div className="text-site-muted text-xs uppercase tracking-wider mb-3">Последняя активность</div>
        <Table cols={['Время', 'Юзер', 'Событие', 'IP']}>
          {recent.map(e => (
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
function UsersTab({ users }: { users: AdminUser[] }) {
  const [q, setQ] = useState('')
  const filtered = q ? users.filter(u =>
    u.username.toLowerCase().includes(q.toLowerCase()) ||
    u.email.toLowerCase().includes(q.toLowerCase())
  ) : users

  return (
    <div className="space-y-4">
      <input
        placeholder="Поиск по нику или email…"
        value={q} onChange={e => setQ(e.target.value)}
        className="w-full max-w-sm bg-site-block border border-site-border focus:border-site-accent rounded px-3 py-2 text-sm text-site-text placeholder-site-muted/50 focus:outline-none transition-colors"
      />
      <Table cols={['Ник', 'Email', 'Верифицирован', 'tokenVer', 'Заказы', 'Последний вход', 'Регистрация']}>
        {filtered.map(u => (
          <Tr key={u.id}>
            <Td className="font-mono font-medium">{u.username}</Td>
            <Td className="text-site-muted text-xs">{u.email}</Td>
            <Td>
              <span className={u.emailVerified ? 'text-green-400' : 'text-red-400'}>
                {u.emailVerified ? '✓ да' : '✗ нет'}
              </span>
            </Td>
            <Td className="text-center text-site-muted">{u.tokenVersion}</Td>
            <Td className="text-center">{u.orders}</Td>
            <Td className="text-xs text-site-muted whitespace-nowrap">
              {u.lastLogin
                ? <><div>{fmtDate(u.lastLogin.at)}</div><div className="font-mono">{u.lastLogin.ip}</div></>
                : '—'
              }
            </Td>
            <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(u.createdAt)}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}

// ── Activity Tab ───────────────────────────────────────────────────────────────
function ActivityTab({ events }: { events: LoginEvent[] }) {
  const [kind, setKind] = useState('all')
  const filtered = kind === 'all' ? events : events.filter(e => e.kind === kind)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['all', 'login', 'fail', 'join', 'register', 'verify'].map(k => (
          <button key={k} onClick={() => setKind(k)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${kind === k ? 'border-site-accent text-site-accent bg-site-secondary' : 'border-site-border text-site-muted hover:border-site-accent/50'}`}
          >{k === 'all' ? 'Все' : k}</button>
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
function SessionsTab({ tokens }: { tokens: GameToken[] }) {
  return (
    <Table cols={['Токен', 'Юзер', 'Email', 'В игре', 'Выдан']}>
      {tokens.map((t, i) => (
        <Tr key={i}>
          <Td className="font-mono text-xs text-site-muted">{t.accessToken}</Td>
          <Td className="font-mono text-sm">{t.user?.username ?? <span className="text-site-muted">—</span>}</Td>
          <Td className="text-xs text-site-muted">{t.user?.email ?? '—'}</Td>
          <Td>
            <span className={t.hasServerId ? 'text-green-400' : 'text-site-muted'}>
              {t.hasServerId ? '● online' : '○ —'}
            </span>
          </Td>
          <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(t.createdAt)}</Td>
        </Tr>
      ))}
    </Table>
  )
}

// ── Orders Tab ─────────────────────────────────────────────────────────────────
function OrdersTab({ orders, onRetry, retrying }: { orders: Order[]; onRetry: (id: string) => void; retrying: string | null }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)
  const stats = {
    total: orders.length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    pending: orders.filter(o => ['waiting_payment', 'delivery_pending', 'paid'].includes(o.status)).length,
    failed: orders.filter(o => o.status === 'delivery_failed').length,
    revenue: orders.filter(o => ['delivered', 'paid', 'delivery_pending'].includes(o.status)).reduce((s, o) => s + o.price, 0),
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Всего" value={stats.total} />
        <StatCard label="Выдано" value={stats.delivered} color="text-green-400" />
        <StatCard label="В процессе" value={stats.pending} color="text-yellow-400" />
        <StatCard label="Ошибки" value={stats.failed} color="text-red-400" />
        <StatCard label="Выручка" value={`${stats.revenue.toLocaleString('ru')} ₽`} color="text-site-accent" />
      </div>
      <div className="flex flex-wrap gap-2">
        {[['all','Все'],['delivered','Выданные'],['delivery_failed','Ошибки'],['waiting_payment','Ожидают']].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${filter === k ? 'border-site-accent text-site-accent bg-site-secondary' : 'border-site-border text-site-muted hover:border-site-accent/50'}`}
          >{l}</button>
        ))}
      </div>
      <Table cols={['ID', 'Дата', 'Ник', 'Товар', 'Срок', 'Сумма', 'Статус', '']}>
        {filtered.map(o => (
          <Tr key={o.id}>
            <Td><a href={`/order/${o.publicId}`} className="font-mono text-xs text-site-muted hover:text-site-accent">#{o.publicId.slice(0,8).toUpperCase()}</a></Td>
            <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(o.createdAt)}</Td>
            <Td className="font-mono">{o.username}</Td>
            <Td>{o.productName}</Td>
            <Td className="text-xs text-site-muted">{o.variantDurationLabel}</Td>
            <Td className="whitespace-nowrap">
              {o.price} ₽
              {o.originalPrice && o.originalPrice !== o.price && <span className="ml-1 text-xs text-site-muted line-through">{o.originalPrice}₽</span>}
            </Td>
            <Td>
              <span className={ORDER_STATUS_COLOR[o.status] ?? 'text-site-muted'}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</span>
              {o.couponCode && <div className="text-[10px] text-green-400">{o.couponCode}</div>}
            </Td>
            <Td>
              {o.status === 'delivery_failed' && (
                <button onClick={() => onRetry(o.id)} disabled={retrying === o.id}
                  className="px-2 py-1 text-xs border border-site-accent/50 text-site-accent hover:bg-site-accent/10 rounded disabled:opacity-40 transition-colors">
                  {retrying === o.id ? '…' : 'Повторить'}
                </button>
              )}
            </Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}

// ── Crash Reports Tab ──────────────────────────────────────────────────────────
function CrashTab({ reports, onSelect, selected }: { reports: CrashReport[]; onSelect: (id: string) => void; selected: CrashReport | null }) {
  if (selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => onSelect('')} className="text-site-accent text-sm hover:underline">← Назад к списку</button>
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
  }

  return (
    <Table cols={['Время', 'Kind', 'Stage', 'Сообщение', 'Exit', 'v', 'OS']}>
      {reports.map(r => (
        <Tr key={r.id}>
          <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(r.createdAt)}</Td>
          <Td><span className="px-2 py-0.5 rounded text-xs bg-red-400/10 text-red-400">{r.kind}</span></Td>
          <Td className="text-xs text-site-muted">{r.stage}</Td>
          <Td className="text-xs max-w-[260px] truncate">
            <button onClick={() => onSelect(r.id)} className="text-left hover:text-site-accent transition-colors">
              {r.message}
            </button>
          </Td>
          <Td className="text-xs text-site-muted text-center">{r.exitCode ?? '—'}</Td>
          <Td className="text-xs text-site-muted">{r.version}</Td>
          <Td className="text-xs text-site-muted">{r.platform}</Td>
        </Tr>
      ))}
    </Table>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
type Tab = 'dash' | 'users' | 'activity' | 'sessions' | 'orders' | 'crashes'
const TABS: { id: Tab; label: string }[] = [
  { id: 'dash', label: '📊 Обзор' },
  { id: 'users', label: '👥 Пользователи' },
  { id: 'activity', label: '📋 Активность' },
  { id: 'sessions', label: '🎮 Сессии' },
  { id: 'orders', label: '💰 Заказы' },
  { id: 'crashes', label: '💥 Краши' },
]

export default function AdminPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('dash')
  const [loading, setLoading] = useState(false)

  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [events, setEvents] = useState<LoginEvent[]>([])
  const [tokens, setTokens] = useState<GameToken[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [crashes, setCrashes] = useState<CrashReport[]>([])
  const [selectedCrash, setSelectedCrash] = useState<CrashReport | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  const loaded = useRef<Set<Tab>>(new Set())

  const checkAuth = useCallback((res: Response) => {
    if (res.status === 401) { router.push('/admin/login'); return false }
    return true
  }, [router])

  const loadTab = useCallback(async (t: Tab, force = false) => {
    if (loaded.current.has(t) && !force) return
    setLoading(true)
    try {
      if (t === 'dash') {
        const [sr, er] = await Promise.all([
          fetch('/api/admin/stats'),
          fetch('/api/admin/login-events'),
        ])
        if (!checkAuth(sr)) return
        setStats(await sr.json())
        setEvents(await er.json())
      } else if (t === 'users') {
        const r = await fetch('/api/admin/users')
        if (!checkAuth(r)) return
        setUsers(await r.json())
      } else if (t === 'activity') {
        const r = await fetch('/api/admin/login-events')
        if (!checkAuth(r)) return
        setEvents(await r.json())
      } else if (t === 'sessions') {
        const r = await fetch('/api/admin/game-tokens')
        if (!checkAuth(r)) return
        setTokens(await r.json())
      } else if (t === 'orders') {
        const r = await fetch('/api/admin/orders')
        if (!checkAuth(r)) return
        setOrders(await r.json())
      } else if (t === 'crashes') {
        const r = await fetch('/api/admin/crash-reports')
        if (!checkAuth(r)) return
        setCrashes(await r.json())
      }
      loaded.current.add(t)
    } catch {
      toast('Ошибка загрузки', 'error')
    } finally {
      setLoading(false)
    }
  }, [checkAuth, toast])

  useEffect(() => { loadTab('dash') }, [loadTab])

  const switchTab = (t: Tab) => { setTab(t); loadTab(t) }

  const refresh = () => { loaded.current.delete(tab); loadTab(tab, true) }

  const selectCrash = async (id: string) => {
    if (!id) { setSelectedCrash(null); return }
    const r = await fetch(`/api/admin/crash-reports?id=${id}`)
    if (r.ok) setSelectedCrash(await r.json())
  }

  const retryOrder = async (id: string) => {
    setRetrying(id)
    try {
      const r = await fetch(`/api/admin/orders/${id}/retry-delivery`, { method: 'POST' })
      if (r.ok) {
        const { order } = await r.json()
        setOrders(prev => prev.map(o => o.id === id ? order : o))
        toast(order.status === 'delivered' ? 'Донат выдан!' : 'Ошибка выдачи', order.status === 'delivered' ? 'success' : 'error')
      }
    } catch { toast('Ошибка', 'error') } finally { setRetrying(null) }
  }

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <div className="min-h-screen bg-site-bg">
      {/* Top bar */}
      <div className="border-b border-site-border bg-site-block/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-pixel text-xs text-site-accent">ADMIN</span>
            {loading && <span className="text-site-muted text-xs animate-pulse">загрузка…</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={refresh}
              className="px-3 py-1.5 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded text-xs transition-colors">
              ↻ Обновить
            </button>
            <button onClick={logout}
              className="px-3 py-1.5 border border-site-border hover:border-red-500 text-site-muted hover:text-red-400 rounded text-xs transition-colors">
              Выйти
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1 pb-0 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => switchTab(id)}
              className={`px-4 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors ${
                tab === id
                  ? 'border-site-accent text-site-accent'
                  : 'border-transparent text-site-muted hover:text-site-text'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'dash' && <DashTab stats={stats} events={events} />}
        {tab === 'users' && <UsersTab users={users} />}
        {tab === 'activity' && <ActivityTab events={events} />}
        {tab === 'sessions' && <SessionsTab tokens={tokens} />}
        {tab === 'orders' && <OrdersTab orders={orders} onRetry={retryOrder} retrying={retrying} />}
        {tab === 'crashes' && <CrashTab reports={crashes} onSelect={selectCrash} selected={selectedCrash} />}
      </div>
    </div>
  )
}
