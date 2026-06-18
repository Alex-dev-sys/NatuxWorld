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
  emailVerified: boolean; tokenVersion: number
  bannedAt: string | null; banReason: string | null
  createdAt: string
  orders: number; lastLogin: { at: string; ip: string } | null
}
interface GameEventRow {
  id: string; username: string; kind: string; message: string
  world: string; x: number | null; y: number | null; z: number | null
  extra: string; createdAt: string
}
interface UserDetail extends Omit<AdminUser, 'orders' | 'lastLogin'> {
  orders: OrderSummary[]
  logins: LoginEventRow[]
  tokens: { accessToken: string; hasServerId: boolean; createdAt: string }[]
  gameEvents: GameEventRow[]
}
interface OrderSummary {
  id: string; publicId: string; productName: string; variantDurationLabel: string
  price: number; status: string; createdAt: string; deliveredAt: string | null; couponCode: string | null
}
interface LoginEventRow {
  id: string; kind: string; ip: string; userAgent: string; createdAt: string
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
interface Coupon {
  code: string; type: string; value: number; description: string
  maxUses: number | null; usedCount: number; expiresAt: string | null; active: boolean
}
interface LiveEvent {
  type: 'login_event' | 'order' | 'crash' | 'ping' | 'connected'
  data?: Record<string, unknown>
}
interface AuditRow {
  id: string; action: string; target: string | null
  params: Record<string, unknown>; ip: string; ok: boolean; createdAt: string
}
interface OnlineRoster { online: number; max: number; players: string[] }

// ── Product list (mirrors products.ts) ────────────────────────────────────────
const PRODUCTS = [
  { id: 'baron', name: 'Baron' },
  { id: 'knight', name: 'Knight' },
  { id: 'guard', name: 'Guard' },
  { id: 'ranger', name: 'Ranger' },
  { id: 'hero', name: 'Hero' },
  { id: 'shadow', name: 'Shadow' },
  { id: 'aspid', name: 'Aspid' },
  { id: 'warlord', name: 'Warlord' },
  { id: 'squid', name: 'Squid' },
  { id: 'phantom', name: 'Phantom' },
  { id: 'head', name: 'Head' },
  { id: 'demon', name: 'Demon' },
  { id: 'elite', name: 'Elite' },
  { id: 'king', name: 'King' },
  { id: 'god', name: 'God' },
]
const DURATIONS = [
  { id: '30d', label: '30 дней' },
  { id: '90d', label: '90 дней' },
  { id: 'forever', label: 'Навсегда' },
]

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
const GAME_KIND_STYLE: Record<string, string> = {
  command: 'text-yellow-300 bg-yellow-400/10',
  chat: 'text-blue-300 bg-blue-400/10',
  block_break: 'text-orange-400 bg-orange-400/10',
  block_place: 'text-green-300 bg-green-400/10',
  join: 'text-green-400 bg-green-400/10',
  quit: 'text-site-muted bg-site-border/20',
  death: 'text-red-400 bg-red-400/10',
  kill: 'text-purple-400 bg-purple-400/10',
}
const ORDER_STATUS_LABEL: Record<string, string> = {
  created: 'Создан', waiting_payment: 'Ожидает', paid: 'Оплачен',
  delivery_pending: 'Выдача...', delivered: 'Выдан',
  delivery_failed: 'Ошибка', cancelled: 'Отменён', refunded: 'Возврат',
}
const ORDER_STATUS_COLOR: Record<string, string> = {
  delivered: 'text-green-400', delivery_failed: 'text-red-400',
  waiting_payment: 'text-yellow-400', delivery_pending: 'text-yellow-400',
}

// ── Base components ────────────────────────────────────────────────────────────
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
  const isEmpty = !children || (Array.isArray(children) && children.filter(Boolean).length === 0)
  return (
    <div className="bg-site-block border border-site-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-site-border text-site-muted text-xs uppercase tracking-wider">
              {cols.map(c => <th key={c} className="text-left px-4 py-3 font-medium whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>{isEmpty ? null : children}</tbody>
        </table>
        {isEmpty && <div className="py-8 text-center text-site-muted text-sm">{empty ?? 'Нет данных'}</div>}
      </div>
    </div>
  )
}

function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-site-border/40 hover:bg-white/[0.02] transition-colors">{children}</tr>
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-site-bg border border-site-border rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-site-border shrink-0">
          <h2 className="font-pixel text-sm text-site-text">{title}</h2>
          <button onClick={onClose} className="text-site-muted hover:text-site-text transition-colors text-lg leading-none px-2">x</button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

// ── User Detail Modal ──────────────────────────────────────────────────────────
type UserTab = 'info' | 'game' | 'orders' | 'activity'

function UserModal({ userId, onClose, onUpdate }: { userId: string; onClose: () => void; onUpdate: (u: Partial<AdminUser>) => void }) {
  const { toast } = useToast()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [banReason, setBanReason] = useState('')
  const [showBanForm, setShowBanForm] = useState(false)
  const [uTab, setUTab] = useState<UserTab>('info')
  const [gameKind, setGameKind] = useState('all')
  const [rankProduct, setRankProduct] = useState('baron')
  const [rankDuration, setRankDuration] = useState('30d')
  const [givingRank, setGivingRank] = useState(false)
  const [showRankForm, setShowRankForm] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/users/${userId}`).then(r => r.json()).then(d => { setUser(d); setLoading(false) })
  }, [userId])

  const action = async (act: string, extra?: Record<string, unknown>) => {
    setActing(act)
    try {
      const r = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, ...extra }),
      })
      const data = await r.json()
      if (!r.ok) { toast(data.error ?? 'Ошибка', 'error'); return }
      toast('Готово', 'success')
      const fresh = await fetch(`/api/admin/users/${userId}`).then(x => x.json())
      setUser(fresh)
      onUpdate({ id: userId, bannedAt: fresh.bannedAt, banReason: fresh.banReason, tokenVersion: fresh.tokenVersion, emailVerified: fresh.emailVerified })
    } catch { toast('Ошибка', 'error') } finally { setActing(null); setShowBanForm(false) }
  }

  const giveRank = async () => {
    setGivingRank(true)
    try {
      const r = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'give-rank', productId: rankProduct, duration: rankDuration }),
      })
      const data = await r.json()
      if (data.ok) toast(`Ранг ${rankProduct} (${rankDuration}) выдан!`, 'success')
      else toast(data.error ?? 'Ошибка RCON', 'error')
      setShowRankForm(false)
    } catch { toast('Ошибка', 'error') } finally { setGivingRank(false) }
  }

  if (loading || !user) return (
    <Modal title="Пользователь" onClose={onClose}>
      <div className="py-16 text-center text-site-muted">Загрузка...</div>
    </Modal>
  )

  const isBanned = !!user.bannedAt
  const gameFiltered = gameKind === 'all' ? user.gameEvents : user.gameEvents.filter(e => e.kind === gameKind)

  const USER_TABS: { id: UserTab; label: string; count?: number }[] = [
    { id: 'info', label: 'Профиль' },
    { id: 'game', label: 'Игра', count: user.gameEvents.length },
    { id: 'orders', label: 'Заказы', count: user.orders.length },
    { id: 'activity', label: 'Входы', count: user.logins.length },
  ]

  return (
    <Modal title={`@${user.username}${isBanned ? ' [BANNED]' : ''}`} onClose={onClose}>
      {/* Inner tab bar */}
      <div className="border-b border-site-border px-6 flex gap-0 shrink-0">
        {USER_TABS.map(t => (
          <button key={t.id} onClick={() => setUTab(t.id)}
            className={`px-4 py-3 text-xs whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${uTab === t.id ? 'border-site-accent text-site-accent' : 'border-transparent text-site-muted hover:text-site-text'}`}>
            {t.label}
            {t.count !== undefined && <span className="text-[10px] opacity-60">({t.count})</span>}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-5">

        {/* ── INFO TAB ── */}
        {uTab === 'info' && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-wrap gap-4 items-start">
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xl font-bold">{user.username}</span>
                  {isBanned && <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">BANNED</span>}
                  {user.emailVerified ? <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400">verified</span> : <span className="px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-400">unverified</span>}
                </div>
                <div className="text-site-muted text-sm">{user.email}</div>
                <div className="text-site-muted text-xs font-mono">id: {user.id}</div>
                <div className="text-site-muted text-xs">tokenVersion: {user.tokenVersion} · создан: {fmtDate(user.createdAt)}</div>
                {isBanned && <div className="text-red-400 text-xs mt-1 bg-red-500/5 border border-red-500/20 rounded p-2">Заблокирован {fmtDate(user.bannedAt!)} — {user.banReason}</div>}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Заказов" value={user.orders.length} />
              <StatCard label="Входов" value={user.logins.filter(l => l.kind === 'login').length} />
              <StatCard label="Действий" value={user.gameEvents.length} />
              <StatCard label="Сессий" value={user.tokens.length} />
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <div className="text-site-muted text-xs uppercase tracking-wider">Действия</div>
              <div className="flex flex-wrap gap-2">
                {isBanned ? (
                  <button onClick={() => action('unban')} disabled={!!acting}
                    className="px-3 py-2 text-xs border border-green-500/50 text-green-400 hover:bg-green-500/10 rounded disabled:opacity-40 transition-colors">
                    {acting === 'unban' ? '...' : 'Разбанить'}
                  </button>
                ) : (
                  <button onClick={() => setShowBanForm(v => !v)}
                    className={`px-3 py-2 text-xs border rounded transition-colors ${showBanForm ? 'border-red-500/80 text-red-400 bg-red-500/10' : 'border-red-500/50 text-red-400 hover:bg-red-500/10'}`}>
                    Заблокировать
                  </button>
                )}
                <button onClick={() => action('revoke-tokens')} disabled={!!acting}
                  className="px-3 py-2 text-xs border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 rounded disabled:opacity-40 transition-colors">
                  {acting === 'revoke-tokens' ? '...' : 'Сбросить токены'}
                </button>
                {!user.emailVerified ? (
                  <button onClick={() => action('force-verify')} disabled={!!acting}
                    className="px-3 py-2 text-xs border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 rounded disabled:opacity-40 transition-colors">
                    {acting === 'force-verify' ? '...' : 'Верифицировать'}
                  </button>
                ) : (
                  <button onClick={() => action('force-unverify')} disabled={!!acting}
                    className="px-3 py-2 text-xs border border-site-border text-site-muted hover:text-site-text rounded disabled:opacity-40 transition-colors">
                    {acting === 'force-unverify' ? '...' : 'Снять верификацию'}
                  </button>
                )}
                <button onClick={() => setShowRankForm(v => !v)}
                  className={`px-3 py-2 text-xs border rounded transition-colors ${showRankForm ? 'border-site-accent text-site-accent bg-site-accent/10' : 'border-site-accent/50 text-site-accent hover:bg-site-accent/10'}`}>
                  Выдать ранг
                </button>
              </div>

              {/* Ban form */}
              {showBanForm && (
                <div className="flex gap-2">
                  <input value={banReason} onChange={e => setBanReason(e.target.value)}
                    placeholder="Причина блокировки..."
                    className="flex-1 bg-site-block border border-red-500/50 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-400 transition-colors" />
                  <button onClick={() => action('ban', { banReason: banReason || 'Заблокирован администратором' })} disabled={!!acting}
                    className="px-4 py-2 text-xs bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 rounded disabled:opacity-40 transition-colors">
                    {acting === 'ban' ? '...' : 'Заблокировать'}
                  </button>
                </div>
              )}

              {/* Give rank form */}
              {showRankForm && (
                <div className="bg-site-block border border-site-accent/30 rounded-lg p-4 space-y-3">
                  <div className="text-xs text-site-accent uppercase tracking-wider font-medium">Выдать ранг через RCON</div>
                  <div className="flex gap-3 flex-wrap">
                    <select value={rankProduct} onChange={e => setRankProduct(e.target.value)}
                      className="bg-site-bg border border-site-border rounded px-3 py-2 text-sm text-site-text focus:outline-none focus:border-site-accent">
                      {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select value={rankDuration} onChange={e => setRankDuration(e.target.value)}
                      className="bg-site-bg border border-site-border rounded px-3 py-2 text-sm text-site-text focus:outline-none focus:border-site-accent">
                      {DURATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                    <button onClick={giveRank} disabled={givingRank}
                      className="px-4 py-2 text-xs bg-site-accent text-white rounded hover:bg-site-accent/80 disabled:opacity-40 transition-colors font-medium">
                      {givingRank ? 'Выдаём...' : `Выдать ${PRODUCTS.find(p => p.id === rankProduct)?.name} (${DURATIONS.find(d => d.id === rankDuration)?.label})`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Active tokens */}
            {user.tokens.filter(t => t.hasServerId).length > 0 && (
              <div className="bg-green-500/5 border border-green-500/20 rounded p-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-sm">Сейчас в игре</span>
              </div>
            )}
          </div>
        )}

        {/* ── GAME TAB ── */}
        {uTab === 'game' && (
          <div className="space-y-4">
            <div className="bg-site-block border border-site-border rounded-lg p-3">
              <div className="text-site-muted text-xs uppercase tracking-wider mb-2">Действия над игроком</div>
              <PlayerActionBar username={user.username} />
            </div>
            {user.gameEvents.length === 0 ? (
              <div className="text-center py-12 text-site-muted">
                <div className="text-2xl mb-2">🎮</div>
                <div className="text-sm">Нет игровых событий</div>
                <div className="text-xs mt-2 opacity-60">Установи NatuxPlugin на Minecraft сервер чтобы видеть логи</div>
              </div>
            ) : (
              <>
                {/* Filter */}
                <div className="flex flex-wrap gap-2">
                  {['all', 'command', 'chat', 'block_break', 'block_place', 'kill', 'death', 'join', 'quit'].map(k => {
                    const cnt = k === 'all' ? user.gameEvents.length : user.gameEvents.filter(e => e.kind === k).length
                    if (cnt === 0 && k !== 'all') return null
                    return (
                      <button key={k} onClick={() => setGameKind(k)}
                        className={`px-2.5 py-1 text-xs rounded border transition-colors ${gameKind === k ? 'border-site-accent text-site-accent' : 'border-site-border text-site-muted hover:border-site-accent/50'}`}>
                        {k === 'all' ? 'Все' : k} <span className="opacity-60">({cnt})</span>
                      </button>
                    )
                  })}
                </div>

                {/* Game events table */}
                <div className="bg-site-block border border-site-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-site-block border-b border-site-border">
                        <tr className="text-site-muted uppercase tracking-wider">
                          <th className="text-left px-3 py-2 whitespace-nowrap">Время</th>
                          <th className="text-left px-3 py-2">Тип</th>
                          <th className="text-left px-3 py-2">Действие</th>
                          <th className="text-left px-3 py-2">Мир / Координаты</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gameFiltered.map(e => (
                          <tr key={e.id} className="border-b border-site-border/30 hover:bg-white/[0.02]">
                            <td className="px-3 py-2 text-site-muted whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${GAME_KIND_STYLE[e.kind] ?? 'text-site-muted bg-site-border/30'}`}>
                                {e.kind}
                              </span>
                            </td>
                            <td className="px-3 py-2 max-w-[280px] font-mono">
                              <span className="truncate block" title={e.message || e.extra}>
                                {e.kind === 'command' ? <span className="text-yellow-300">{e.message}</span>
                                  : e.kind === 'chat' ? <span className="text-blue-300">&quot;{e.message}&quot;</span>
                                  : e.kind === 'kill' ? <span>убил <span className="text-purple-300">{e.message}</span></span>
                                  : e.kind === 'death' ? <span className="text-red-300 text-[10px]">{e.message}</span>
                                  : e.extra || e.message || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-site-muted">
                              {e.world && <span className="mr-2">{e.world}</span>}
                              {e.x !== null && <span className="font-mono">{Math.round(e.x ?? 0)},{Math.round(e.y ?? 0)},{Math.round(e.z ?? 0)}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-3 py-2 border-t border-site-border/30 text-xs text-site-muted">
                    Показано {gameFiltered.length} из {user.gameEvents.length} событий
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {uTab === 'orders' && (
          <Table cols={['Дата', 'Товар', 'Срок', 'Сумма', 'Статус']}>
            {user.orders.map(o => (
              <Tr key={o.id}>
                <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(o.createdAt)}</Td>
                <Td>{o.productName}</Td>
                <Td className="text-xs text-site-muted">{o.variantDurationLabel}</Td>
                <Td>{o.price} р</Td>
                <Td className={ORDER_STATUS_COLOR[o.status] ?? 'text-site-muted'}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</Td>
              </Tr>
            ))}
          </Table>
        )}

        {/* ── ACTIVITY TAB ── */}
        {uTab === 'activity' && (
          <Table cols={['Время', 'Событие', 'IP', 'UA']}>
            {user.logins.map(l => (
              <Tr key={l.id}>
                <Td className="text-xs text-site-muted whitespace-nowrap">{fmtDate(l.createdAt)}</Td>
                <Td><span className={`px-2 py-0.5 rounded text-xs ${KIND_BADGE[l.kind] ?? 'text-site-muted bg-site-border/30'}`}>{l.kind}</span></Td>
                <Td className="font-mono text-xs">{l.ip}</Td>
                <Td className="text-xs text-site-muted max-w-[200px] truncate">{l.userAgent || '—'}</Td>
              </Tr>
            ))}
          </Table>
        )}

      </div>
    </Modal>
  )
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────
function DashTab({ stats, events, liveEvents }: { stats: Stats | null; events: LoginEvent[]; liveEvents: LiveEvent[] }) {
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
function UsersTab({ users, onSelect, onUpdate }: { users: AdminUser[]; onSelect: (id: string) => void; onUpdate: (u: Partial<AdminUser>) => void }) {
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
function ActivityTab({ events }: { events: LoginEvent[] }) {
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
function SessionsTab({ tokens }: { tokens: GameToken[] }) {
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

// ── Orders Tab ─────────────────────────────────────────────────────────────────
function OrdersTab({ orders, onRetry, retrying }: { orders: Order[]; onRetry: (id: string) => void; retrying: string | null }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)
  const stats = {
    delivered: orders.filter(o => o.status === 'delivered').length,
    pending: orders.filter(o => ['waiting_payment', 'delivery_pending', 'paid'].includes(o.status)).length,
    failed: orders.filter(o => o.status === 'delivery_failed').length,
    revenue: orders.filter(o => ['delivered', 'paid', 'delivery_pending'].includes(o.status)).reduce((s, o) => s + o.price, 0),
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Выдано" value={stats.delivered} color="text-green-400" />
        <StatCard label="В процессе" value={stats.pending} color="text-yellow-400" />
        <StatCard label="Ошибки" value={stats.failed} color="text-red-400" />
        <StatCard label="Выручка" value={`${stats.revenue.toLocaleString('ru')} р`} color="text-site-accent" />
      </div>
      <div className="flex flex-wrap gap-2">
        {[['all','Все'],['delivered','Выданные'],['delivery_failed','Ошибки'],['waiting_payment','Ожидают']].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${filter === k ? 'border-site-accent text-site-accent bg-site-secondary' : 'border-site-border text-site-muted hover:border-site-accent/50'}`}>
            {l}
          </button>
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
            <Td className="whitespace-nowrap">{o.price} р{o.originalPrice && o.originalPrice !== o.price && <span className="ml-1 text-xs text-site-muted line-through">{o.originalPrice}</span>}</Td>
            <Td><span className={ORDER_STATUS_COLOR[o.status] ?? 'text-site-muted'}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</span>{o.couponCode && <div className="text-[10px] text-green-400">{o.couponCode}</div>}</Td>
            <Td>{o.status === 'delivery_failed' && <button onClick={() => onRetry(o.id)} disabled={retrying === o.id} className="px-2 py-1 text-xs border border-site-accent/50 text-site-accent hover:bg-site-accent/10 rounded disabled:opacity-40 transition-colors">{retrying === o.id ? '...' : 'Повторить'}</button>}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}

// ── Crash Reports Tab ──────────────────────────────────────────────────────────
function CrashTab({ reports, onSelect, selected }: { reports: CrashReport[]; onSelect: (id: string) => void; selected: CrashReport | null }) {
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

// ── Coupons Tab ────────────────────────────────────────────────────────────────
function CouponsTab({ coupons, setCoupons }: { coupons: Coupon[]; setCoupons: React.Dispatch<React.SetStateAction<Coupon[]>> }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ code: '', type: 'percent', value: '', description: '', maxUses: '', expiresAt: '' })
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true)
    try {
      const r = await fetch('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, value: Number(form.value), maxUses: form.maxUses ? Number(form.maxUses) : null, expiresAt: form.expiresAt || null }) })
      const data = await r.json()
      if (!r.ok) { toast(data.error ?? 'Ошибка', 'error'); return }
      setCoupons(prev => [data, ...prev]); setForm({ code: '', type: 'percent', value: '', description: '', maxUses: '', expiresAt: '' }); setShowForm(false); toast('Купон создан', 'success')
    } catch { toast('Ошибка', 'error') } finally { setCreating(false) }
  }
  const toggle = async (code: string, active: boolean) => {
    const r = await fetch(`/api/admin/coupons/${code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) })
    if (r.ok) setCoupons(prev => prev.map(c => c.code === code ? { ...c, active } : c)); else toast('Ошибка', 'error')
  }
  const del = async (code: string) => {
    if (!confirm(`Удалить купон ${code}?`)) return
    const r = await fetch(`/api/admin/coupons/${code}`, { method: 'DELETE' })
    if (r.ok) setCoupons(prev => prev.filter(c => c.code !== code)); else toast('Ошибка', 'error')
  }
  const inp = "bg-site-block border border-site-border focus:border-site-accent rounded px-3 py-2 text-sm text-site-text placeholder-site-muted/50 focus:outline-none transition-colors"
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-site-muted text-xs">{coupons.length} купонов · {coupons.filter(c => c.active).length} активных</span>
        <button onClick={() => setShowForm(v => !v)} className="px-3 py-1.5 text-xs border border-site-accent/50 text-site-accent hover:bg-site-accent/10 rounded transition-colors">{showForm ? 'Закрыть' : '+ Создать купон'}</button>
      </div>
      {showForm && (
        <form onSubmit={create} className="bg-site-block border border-site-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input required placeholder="КОД" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} className={inp} />
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className={inp}><option value="percent">Процент %</option><option value="fixed">Фиксированный р</option><option value="free">Бесплатно</option></select>
            <input placeholder="Размер" type="number" min="0" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} className={inp} />
            <input placeholder="Описание" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className={inp} />
            <input placeholder="Макс. использований" type="number" min="1" value={form.maxUses} onChange={e => setForm(p => ({ ...p, maxUses: e.target.value }))} className={inp} />
            <input placeholder="Истекает" type="datetime-local" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))} className={inp} />
          </div>
          <button type="submit" disabled={creating} className="px-4 py-2 text-xs bg-site-accent text-white rounded hover:bg-site-accent/80 disabled:opacity-40 transition-colors">{creating ? 'Создаём...' : 'Создать'}</button>
        </form>
      )}
      <Table cols={['Код', 'Тип', 'Скидка', 'Описание', 'Использований', 'Истекает', 'Статус', '']}>
        {coupons.map(c => (
          <Tr key={c.code}>
            <Td className="font-mono font-bold">{c.code}</Td>
            <Td className="text-site-muted text-xs">{c.type}</Td>
            <Td className="font-bold text-site-accent">{c.type === 'free' ? 'FREE' : c.type === 'percent' ? `${c.value}%` : `${c.value}р`}</Td>
            <Td className="text-site-muted text-xs">{c.description || '—'}</Td>
            <Td className="text-center text-xs">{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</Td>
            <Td className="text-xs text-site-muted whitespace-nowrap">{c.expiresAt ? fmtDate(c.expiresAt) : 'навсегда'}</Td>
            <Td><button onClick={() => toggle(c.code, !c.active)} className={`px-2 py-0.5 rounded text-xs border transition-colors ${c.active ? 'border-green-500/50 text-green-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50' : 'border-red-500/50 text-red-400 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/50'}`}>{c.active ? 'Активен' : 'Отключён'}</button></Td>
            <Td><button onClick={() => del(c.code)} className="text-xs text-site-muted hover:text-red-400 transition-colors">Удалить</button></Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}

// ── RCON Tab ───────────────────────────────────────────────────────────────────
const RCON_PRESETS = [
  { label: 'Список игроков', cmd: 'list' }, { label: 'Время', cmd: 'time query daytime' },
  { label: 'TPS', cmd: 'tps' }, { label: 'Версия', cmd: 'version' }, { label: 'Clearlag', cmd: 'clearlagg run' },
]
function RconTab() {
  const { toast } = useToast()
  const [cmd, setCmd] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<{ cmd: string; result: string; ok: boolean; ts: number }[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const send = async (command: string, confirm = false) => {
    const c = command.trim(); if (!c) return; setLoading(true)
    try {
      const r = await fetch('/api/admin/rcon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: c, confirm }) })
      const data = await r.json()
      if (data.needConfirm) {
        const warn = data.tier === 'server' ? '⚠ ВЛИЯЕТ НА СЕРВЕР (stop/restart)' : 'Изменяющая команда'
        if (confirm || window.confirm(`${warn}\n\n${c}\n\nВыполнить?`)) return send(c, true)
        setLoading(false); return
      }
      setHistory(prev => [...prev, { cmd: c, ts: Date.now(), ok: data.success ?? r.ok, result: data.error ?? (data.responses?.[0] ?? (data.success ? 'OK' : JSON.stringify(data))) }])
      if (!data.success && data.error) toast(data.error, 'error'); setCmd('')
    } catch { toast('Ошибка', 'error') } finally { setLoading(false) }
  }
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [history])
  return (
    <div className="space-y-4">
      <div className="bg-site-block border border-site-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-green-400" /><span className="text-xs text-site-muted font-mono">RCON → mc.vibestudy.ru</span></div>
        <div className="flex flex-wrap gap-2">{RCON_PRESETS.map(p => <button key={p.cmd} onClick={() => send(p.cmd)} disabled={loading} className="px-2.5 py-1 text-xs border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded disabled:opacity-40 transition-colors">{p.label}</button>)}</div>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center bg-black/40 border border-site-border focus-within:border-site-accent rounded px-3 py-2 gap-2 transition-colors">
            <span className="text-green-400 text-sm font-mono">&gt;</span>
            <input value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(cmd) } }} placeholder="Команда для сервера..." className="flex-1 bg-transparent text-sm text-site-text placeholder-site-muted/40 focus:outline-none font-mono" />
          </div>
          <button onClick={() => send(cmd)} disabled={loading || !cmd.trim()} className="px-4 py-2 text-xs bg-site-accent text-white rounded hover:bg-site-accent/80 disabled:opacity-40 transition-colors font-medium">{loading ? '...' : 'Run'}</button>
        </div>
        {history.length > 0 && <div ref={logRef} className="bg-black/40 rounded p-3 max-h-64 overflow-y-auto space-y-2 font-mono text-xs">{history.map(h => <div key={h.ts} className="space-y-0.5"><div className="text-green-400">&gt; {h.cmd}</div><div className={h.ok ? 'text-site-muted' : 'text-red-400'}>{h.result}</div></div>)}</div>}
      </div>
      <div className="text-site-muted text-xs bg-yellow-500/5 border border-yellow-500/20 rounded p-3">Изменяющие команды (op/give/kick…) требуют подтверждения; stop/restart помечены как влияющие на сервер. Всё пишется в аудит.</div>
    </div>
  )
}

// ── Products Tab ─────────────────────────────────────────────────────────────────
interface AdminVariant { duration: string; durationLabel: string; price: number }
interface AdminProduct { id: string; name: string; active: boolean; badge?: string; order: number; popular: boolean; variants: AdminVariant[] }

function ProductsTab() {
  const { toast } = useToast()
  const [items, setItems] = useState<AdminProduct[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { const r = await fetch('/api/admin/products'); if (r.ok) setItems(await r.json()) } catch { /* keep */ }
  }, [])
  useEffect(() => { load() }, [load])

  const patch = (id: string, p: Partial<AdminProduct>) => setItems(prev => prev?.map(x => x.id === id ? { ...x, ...p } : x) ?? null)
  const patchPrice = (id: string, duration: string, price: number) =>
    setItems(prev => prev?.map(x => x.id === id ? { ...x, variants: x.variants.map(v => v.duration === duration ? { ...v, price } : v) } : x) ?? null)

  const seed = async () => {
    setBusy('seed')
    try {
      const r = await fetch('/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seed' }) })
      const d = await r.json()
      if (r.ok) { toast(`Импортировано товаров: ${d.count}`, 'success'); await load() } else toast(d.error ?? 'Ошибка', 'error')
    } catch { toast('Ошибка', 'error') } finally { setBusy(null) }
  }

  const save = async (p: AdminProduct) => {
    setBusy(p.id)
    try {
      const r = await fetch(`/api/admin/products/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: p.active, badge: p.badge ?? null, order: p.order, popular: p.popular, variants: p.variants.map(v => ({ duration: v.duration, price: v.price })) }),
      })
      const d = await r.json()
      toast(r.ok && d.ok ? 'Сохранено' : (d.error ?? 'Ошибка'), r.ok && d.ok ? 'success' : 'error')
    } catch { toast('Ошибка', 'error') } finally { setBusy(null) }
  }

  const del = async (p: AdminProduct) => {
    if (!confirm(`Удалить товар «${p.name}»? Активные заказы не затрагиваются.`)) return
    setBusy(p.id)
    try {
      const r = await fetch(`/api/admin/products/${p.id}`, { method: 'DELETE' })
      if (r.ok) { toast('Удалено', 'success'); await load() } else toast('Ошибка', 'error')
    } catch { toast('Ошибка', 'error') } finally { setBusy(null) }
  }

  if (!items) return <div className="text-center text-site-muted py-16">Загрузка...</div>
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-site-muted text-xs">{items.length} товаров</div>
        <button onClick={seed} disabled={!!busy} className="px-3 py-1.5 text-xs border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded disabled:opacity-40 transition-colors">{busy === 'seed' ? '...' : 'Импорт из кода (seed)'}</button>
      </div>
      {items.sort((a, b) => a.order - b.order).map(p => (
        <div key={p.id} className="bg-site-block border border-site-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono font-medium">{p.name}</span>
            <span className="text-xs text-site-muted font-mono">{p.id}</span>
            <button onClick={() => patch(p.id, { active: !p.active })} className={`px-2 py-0.5 text-xs rounded border transition-colors ${p.active ? 'border-green-500/50 text-green-400' : 'border-site-border text-site-muted'}`}>{p.active ? 'активен' : 'скрыт'}</button>
            <button onClick={() => patch(p.id, { popular: !p.popular })} className={`px-2 py-0.5 text-xs rounded border transition-colors ${p.popular ? 'border-site-accent text-site-accent' : 'border-site-border text-site-muted'}`}>популярный</button>
            <label className="flex items-center gap-1.5 text-xs text-site-muted">badge
              <input value={p.badge ?? ''} onChange={e => patch(p.id, { badge: e.target.value })} className="w-24 bg-black/40 border border-site-border focus:border-site-accent rounded px-2 py-1 text-xs text-site-text focus:outline-none transition-colors" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-site-muted">порядок
              <input type="number" value={p.order} onChange={e => patch(p.id, { order: Number(e.target.value) })} className="w-16 bg-black/40 border border-site-border focus:border-site-accent rounded px-2 py-1 text-xs text-site-text focus:outline-none transition-colors" />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            {p.variants.map(v => (
              <label key={v.duration} className="flex items-center gap-1.5 text-xs text-site-muted">{v.durationLabel}
                <input type="number" value={v.price} onChange={e => patchPrice(p.id, v.duration, Number(e.target.value))} className="w-24 bg-black/40 border border-site-border focus:border-site-accent rounded px-2 py-1 text-xs text-site-text font-mono focus:outline-none transition-colors" />₽
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => save(p)} disabled={busy === p.id} className="px-4 py-1.5 text-xs bg-site-accent text-white rounded hover:bg-site-accent/80 disabled:opacity-40 transition-colors font-medium">{busy === p.id ? '...' : 'Сохранить'}</button>
            <button onClick={() => del(p)} disabled={busy === p.id} className="px-3 py-1.5 text-xs border border-site-border hover:border-red-500 text-site-muted hover:text-red-400 rounded disabled:opacity-40 transition-colors">Удалить</button>
          </div>
        </div>
      ))}
      <div className="text-site-muted text-xs bg-yellow-500/5 border border-yellow-500/20 rounded p-3">Каталог в БД. Если пусто — нажми «Импорт из кода» (переносит товары из products.ts). Перки и RCON-команды правятся в коде; здесь — цены, видимость, бейджи, порядок. Все правки в аудите.</div>
    </div>
  )
}

// ── Server Control Tab ──────────────────────────────────────────────────────────
function ServerTab() {
  const { toast } = useToast()
  const [status, setStatus] = useState<string>('')
  const [console_, setConsole] = useState<string>('')
  const [busy, setBusy] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [monitor, setMonitor] = useState<{ players: { online: number; max: number }; tps: number[] } | null>(null)
  const [whitelist, setWhitelist] = useState<string[] | null>(null)
  const [wlInput, setWlInput] = useState('')
  const [wlBusy, setWlBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const call = useCallback(async (action: string, lines?: number) => {
    const r = await fetch('/api/admin/mc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, lines }) })
    const d = await r.json()
    if (!r.ok || !d.ok) throw new Error(d.error ?? 'Ошибка')
    return d.output as string
  }, [])

  const loadMonitor = useCallback(async () => {
    try { const r = await fetch('/api/admin/server-status'); if (r.ok) setMonitor(await r.json()); else setMonitor(null) } catch { setMonitor(null) }
  }, [])
  const loadWhitelist = useCallback(async () => {
    try { const r = await fetch('/api/admin/whitelist'); if (r.ok) setWhitelist((await r.json()).players); } catch { /* keep last */ }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([call('status'), call('console', 120)])
      setStatus(s); setConsole(c); setUnavailable(false)
    } catch { setUnavailable(true) }
    loadMonitor()
  }, [call, loadMonitor])

  const wlAction = async (action: 'add' | 'remove', username: string) => {
    if (!username) return
    setWlBusy(true)
    try {
      const r = await fetch('/api/admin/whitelist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, username }) })
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error ?? 'Ошибка')
      toast(action === 'add' ? `${username} добавлен в whitelist` : `${username} удалён из whitelist`, 'success')
      if (action === 'add') setWlInput('')
      await loadWhitelist()
    } catch (e) { toast(e instanceof Error ? e.message : 'Ошибка', 'error') }
    finally { setWlBusy(false) }
  }

  useEffect(() => { refresh(); loadWhitelist(); const i = setInterval(refresh, 10000); return () => clearInterval(i) }, [refresh, loadWhitelist])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [console_])

  const lifecycle = async (action: 'start' | 'stop' | 'restart') => {
    const danger = action === 'stop' || action === 'restart'
    if (danger && !window.confirm(`⚠ ВЛИЯЕТ НА СЕРВЕР\n\n${action} minecraft\n\nВыполнить?`)) return
    setBusy(action)
    try { await call(action); toast(`Команда «${action}» отправлена`, 'success'); await refresh() }
    catch (e) { toast(e instanceof Error ? e.message : 'Ошибка', 'error') }
    finally { setBusy(null) }
  }

  const online = /running|active/i.test(status)
  return (
    <div className="space-y-4">
      <div className="bg-site-block border border-site-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${unavailable ? 'bg-red-400' : online ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
          <span className="text-xs text-site-muted font-mono">{unavailable ? 'SSH-мост недоступен' : online ? 'сервер запущен' : 'сервер остановлен'}</span>
        </div>
        {status && <pre className="bg-black/40 rounded p-3 text-xs font-mono text-site-text whitespace-pre-wrap">{status}</pre>}
        {monitor && (
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <span className="px-2 py-1 rounded bg-site-border/30 text-site-text">онлайн: {monitor.players.online}/{monitor.players.max}</span>
            {monitor.tps.length > 0 && (
              <span className={`px-2 py-1 rounded bg-site-border/30 ${monitor.tps[0] >= 18 ? 'text-green-400' : monitor.tps[0] >= 12 ? 'text-yellow-400' : 'text-red-400'}`}>
                TPS: {monitor.tps.join(' / ')}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => lifecycle('start')} disabled={!!busy} className="px-3 py-1.5 text-xs border border-green-500/50 text-green-400 hover:bg-green-500/10 rounded disabled:opacity-40 transition-colors">{busy === 'start' ? '...' : 'Запустить'}</button>
          <button onClick={() => lifecycle('restart')} disabled={!!busy} className="px-3 py-1.5 text-xs border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 rounded disabled:opacity-40 transition-colors">{busy === 'restart' ? '...' : 'Перезапустить'}</button>
          <button onClick={() => lifecycle('stop')} disabled={!!busy} className="px-3 py-1.5 text-xs border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded disabled:opacity-40 transition-colors">{busy === 'stop' ? '...' : 'Остановить'}</button>
          <button onClick={refresh} disabled={!!busy} className="px-3 py-1.5 text-xs border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded disabled:opacity-40 transition-colors ml-auto">Обновить</button>
        </div>
      </div>
      <div className="bg-site-block border border-site-border rounded-lg p-4 space-y-2">
        <div className="text-xs text-site-muted font-mono">Консоль сервера (последние строки)</div>
        <div ref={logRef} className="bg-black/40 rounded p-3 max-h-96 overflow-y-auto font-mono text-xs text-site-muted whitespace-pre-wrap">{console_ || (unavailable ? 'Нет данных' : 'Загрузка...')}</div>
      </div>
      <div className="bg-site-block border border-site-border rounded-lg p-4 space-y-3">
        <div className="text-xs text-site-muted font-mono">Whitelist {whitelist ? `(${whitelist.length})` : ''}</div>
        <div className="flex gap-2">
          <input value={wlInput} onChange={e => setWlInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') wlAction('add', wlInput.trim()) }} placeholder="Ник игрока..." className="flex-1 bg-black/40 border border-site-border focus:border-site-accent rounded px-3 py-2 text-sm text-site-text placeholder-site-muted/40 focus:outline-none font-mono transition-colors" />
          <button onClick={() => wlAction('add', wlInput.trim())} disabled={wlBusy || !wlInput.trim()} className="px-4 py-2 text-xs bg-site-accent text-white rounded hover:bg-site-accent/80 disabled:opacity-40 transition-colors font-medium">Добавить</button>
        </div>
        {whitelist === null ? (
          <div className="text-site-muted text-xs">RCON недоступен</div>
        ) : whitelist.length === 0 ? (
          <div className="text-site-muted text-xs">Whitelist пуст</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {whitelist.map(name => (
              <span key={name} className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono bg-site-border/30 rounded">
                {name}
                <button onClick={() => wlAction('remove', name)} disabled={wlBusy} className="text-site-muted hover:text-red-400 disabled:opacity-40 transition-colors" title="Удалить">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-site-muted text-xs bg-yellow-500/5 border border-yellow-500/20 rounded p-3">stop/restart влияют на живой сервер и пишутся в аудит. start/stop/restart идут через SSH-мост на хост; онлайн/TPS/whitelist — через RCON.</div>
    </div>
  )
}

// ── Player Action Bar ───────────────────────────────────────────────────────────
function PlayerActionBar({ username, onDone }: { username: string; onDone?: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (action: string, params: Record<string, unknown>, destructive = false) => {
    if (destructive && !confirm(`${action} → ${username}?`)) return
    setBusy(action)
    try {
      const r = await fetch('/api/admin/player', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, username, confirm: true, ...params }),
      })
      const d = await r.json()
      toast(r.ok && d.ok ? 'Готово' : (d.error ?? 'Ошибка'), r.ok && d.ok ? 'success' : 'error')
      onDone?.()
    } catch { toast('Ошибка', 'error') } finally { setBusy(null) }
  }
  const btn = "px-2.5 py-1 text-xs border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded disabled:opacity-40 transition-colors"
  return (
    <div className="flex flex-wrap gap-2">
      <button className={btn} disabled={!!busy} onClick={() => run('heal', {})}>Хил</button>
      <button className={btn} disabled={!!busy} onClick={() => run('feed', {})}>Покормить</button>
      <button className={btn} disabled={!!busy} onClick={() => run('god', {})}>God</button>
      <button className={btn} disabled={!!busy} onClick={() => run('gamemode', { mode: 'survival' })}>GM Survival</button>
      <button className={btn} disabled={!!busy} onClick={() => run('gamemode', { mode: 'creative' })}>GM Creative</button>
      <button className={btn} disabled={!!busy} onClick={() => { const r = prompt('Причина кика:') ?? ''; run('kick', { reason: r || 'Кик администратором' }, true) }}>Кик</button>
      <button className={btn} disabled={!!busy} onClick={() => { const t = prompt('Время мута (напр. 10m):') ?? '10m'; const r = prompt('Причина:') ?? ''; run('mute', { time: t, reason: r || 'Мут' }, true) }}>Мут</button>
      <button className={btn} disabled={!!busy} onClick={() => run('unmute', {})}>Размут</button>
      <button className={btn} disabled={!!busy} onClick={() => run('kill', {}, true)}>Убить</button>
    </div>
  )
}

// ── Online Tab ──────────────────────────────────────────────────────────────────
function OnlineTab() {
  const [roster, setRoster] = useState<OnlineRoster | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    try { const r = await fetch('/api/admin/online'); if (r.ok) setRoster(await r.json()) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i) }, [load])
  if (loading) return <div className="text-center text-site-muted py-16">Загрузка...</div>
  if (!roster) return <div className="text-center text-site-muted py-16">RCON недоступен</div>
  return (
    <div className="space-y-4">
      <div className="text-site-muted text-xs">{roster.online} / {roster.max} онлайн</div>
      {roster.players.length === 0 ? (
        <div className="text-center text-site-muted py-12">Никого нет в игре</div>
      ) : roster.players.map(name => (
        <div key={name} className="bg-site-block border border-site-border rounded-lg p-3 space-y-2">
          <div className="font-mono font-medium">{name}</div>
          <PlayerActionBar username={name} onDone={load} />
        </div>
      ))}
    </div>
  )
}

// ── Audit Tab ───────────────────────────────────────────────────────────────────
function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [filter, setFilter] = useState('')
  useEffect(() => {
    fetch(`/api/admin/audit${filter ? `?action=${filter}` : ''}`).then(r => r.json()).then(setRows)
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

// ── Main ───────────────────────────────────────────────────────────────────────
type Tab = 'dash' | 'users' | 'online' | 'activity' | 'sessions' | 'orders' | 'crashes' | 'coupons' | 'products' | 'server' | 'rcon' | 'audit'
const TABS: { id: Tab; label: string }[] = [
  { id: 'dash', label: 'Обзор' }, { id: 'users', label: 'Пользователи' },
  { id: 'online', label: 'Онлайн' },
  { id: 'activity', label: 'Активность' }, { id: 'sessions', label: 'Сессии' },
  { id: 'orders', label: 'Заказы' }, { id: 'crashes', label: 'Краши' },
  { id: 'coupons', label: 'Купоны' }, { id: 'products', label: 'Товары' }, { id: 'server', label: 'Сервер' }, { id: 'rcon', label: 'RCON' },
  { id: 'audit', label: 'Аудит' },
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
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [retrying, setRetrying] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [sseStatus, setSseStatus] = useState<'connecting' | 'live' | 'off'>('connecting')
  const loaded = useRef<Set<Tab>>(new Set())
  const checkAuth = useCallback((res: Response) => { if (res.status === 401) { router.push('/admin/login'); return false } return true }, [router])
  const loadTab = useCallback(async (t: Tab, force = false) => {
    if (loaded.current.has(t) && !force) return
    setLoading(true)
    try {
      if (t === 'dash') { const [sr, er] = await Promise.all([fetch('/api/admin/stats'), fetch('/api/admin/login-events')]); if (!checkAuth(sr)) return; setStats(await sr.json()); setEvents(await er.json()) }
      else if (t === 'users') { const r = await fetch('/api/admin/users'); if (!checkAuth(r)) return; setUsers(await r.json()) }
      else if (t === 'activity') { const r = await fetch('/api/admin/login-events'); if (!checkAuth(r)) return; setEvents(await r.json()) }
      else if (t === 'sessions') { const r = await fetch('/api/admin/game-tokens'); if (!checkAuth(r)) return; setTokens(await r.json()) }
      else if (t === 'orders') { const r = await fetch('/api/admin/orders'); if (!checkAuth(r)) return; setOrders(await r.json()) }
      else if (t === 'crashes') { const r = await fetch('/api/admin/crash-reports'); if (!checkAuth(r)) return; setCrashes(await r.json()) }
      else if (t === 'coupons') { const r = await fetch('/api/admin/coupons'); if (!checkAuth(r)) return; setCoupons(await r.json()) }
      else if (t === 'online' || t === 'audit' || t === 'server' || t === 'products') { /* self-loading tabs */ }
      loaded.current.add(t)
    } catch { toast('Ошибка загрузки', 'error') } finally { setLoading(false) }
  }, [checkAuth, toast])

  useEffect(() => {
    let es: EventSource | null = null; let rt: ReturnType<typeof setTimeout>
    const connect = () => {
      es = new EventSource('/api/admin/events')
      es.onopen = () => setSseStatus('live')
      es.onerror = () => { setSseStatus('off'); es?.close(); rt = setTimeout(connect, 10000) }
      es.onmessage = (evt) => { try { const p = JSON.parse(evt.data) as LiveEvent; if (p.type === 'connected') return; setLiveEvents(prev => [...prev.slice(-49), p]) } catch { /* ignore */ } }
    }
    connect()
    return () => { es?.close(); clearTimeout(rt) }
  }, [])

  useEffect(() => { loadTab('dash') }, [loadTab])
  const switchTab = (t: Tab) => { setTab(t); loadTab(t) }
  const refresh = () => { loaded.current.delete(tab); loadTab(tab, true) }
  const selectCrash = async (id: string) => { if (!id) { setSelectedCrash(null); return }; const r = await fetch(`/api/admin/crash-reports?id=${id}`); if (r.ok) setSelectedCrash(await r.json()) }
  const retryOrder = async (id: string) => {
    setRetrying(id)
    try { const r = await fetch(`/api/admin/orders/${id}/retry-delivery`, { method: 'POST' }); if (r.ok) { const { order } = await r.json(); setOrders(prev => prev.map(o => o.id === id ? order : o)); toast(order.status === 'delivered' ? 'Донат выдан!' : 'Ошибка выдачи', order.status === 'delivered' ? 'success' : 'error') } }
    catch { toast('Ошибка', 'error') } finally { setRetrying(null) }
  }
  const updateUser = (update: Partial<AdminUser>) => setUsers(prev => prev.map(u => u.id === update.id ? { ...u, ...update } : u))
  const logout = async () => { await fetch('/api/admin/logout', { method: 'POST' }); router.push('/admin/login') }

  return (
    <div className="min-h-screen bg-site-bg">
      {selectedUser && <UserModal userId={selectedUser} onClose={() => setSelectedUser(null)} onUpdate={updateUser} />}
      <div className="border-b border-site-border bg-site-block/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-pixel text-xs text-site-accent">NATUX ADMIN</span>
            <span className={`flex items-center gap-1.5 text-xs ${sseStatus === 'live' ? 'text-green-400' : sseStatus === 'connecting' ? 'text-yellow-400' : 'text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sseStatus === 'live' ? 'bg-green-400 animate-pulse' : sseStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'}`} />
              {sseStatus}
            </span>
            {loading && <span className="text-site-muted text-xs animate-pulse">загрузка...</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={refresh} className="px-3 py-1.5 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded text-xs transition-colors">Обновить</button>
            <button onClick={logout} className="px-3 py-1.5 border border-site-border hover:border-red-500 text-site-muted hover:text-red-400 rounded text-xs transition-colors">Выйти</button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => switchTab(id)}
              className={`px-4 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors ${tab === id ? 'border-site-accent text-site-accent' : 'border-transparent text-site-muted hover:text-site-text'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'dash' && <DashTab stats={stats} events={events} liveEvents={liveEvents} />}
        {tab === 'users' && <UsersTab users={users} onSelect={setSelectedUser} onUpdate={updateUser} />}
        {tab === 'online' && <OnlineTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'activity' && <ActivityTab events={events} />}
        {tab === 'sessions' && <SessionsTab tokens={tokens} />}
        {tab === 'orders' && <OrdersTab orders={orders} onRetry={retryOrder} retrying={retrying} />}
        {tab === 'crashes' && <CrashTab reports={crashes} onSelect={selectCrash} selected={selectedCrash} />}
        {tab === 'coupons' && <CouponsTab coupons={coupons} setCoupons={setCoupons} />}
        {tab === 'products' && <ProductsTab />}
        {tab === 'server' && <ServerTab />}
        {tab === 'rcon' && <RconTab />}
      </div>
    </div>
  )
}
