'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import type { Stats, AdminUser, LoginEvent, GameToken, Order, CrashReport, Coupon, LiveEvent } from './types'
import { UserModal } from './UserModal'
import { DashTab, UsersTab, ActivityTab, SessionsTab, CrashTab, AuditTab } from './ActivityTabs'
import { OrdersTab, CouponsTab, ProductsTab } from './CommerceTabs'
import { RconTab, ServerTab, OnlineTab } from './ServerTabs'

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
  const [refunding, setRefunding] = useState<string | null>(null)
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
  const refundOrder = async (id: string) => {
    if (!confirm('Отозвать ранг через RCON? Денежный возврат выполняется отдельно вручную.')) return
    setRefunding(id)
    try {
      const r = await fetch(`/api/admin/orders/${id}/refund`, { method: 'POST' })
      if (r.ok) {
        const { order, rconOk } = await r.json()
        setOrders(prev => prev.map(o => o.id === id ? order : o))
        toast(rconOk ? 'Ранг отозван; можно выполнить денежный возврат' : 'RCON-отзыв не прошёл — повторите операцию', rconOk ? 'success' : 'error')
      } else { const d = await r.json(); toast(d.error ?? 'Ошибка', 'error') }
    } catch { toast('Ошибка', 'error') } finally { setRefunding(null) }
  }
  const updateUser = (update: Partial<AdminUser>) => setUsers(prev => prev.map(u => u.id === update.id ? { ...u, ...update } : u))
  const logout = async () => {
    try {
      const response = await fetch('/api/admin/logout', { method: 'POST' })
      if (!response.ok) {
        toast('Не удалось завершить сессию. Повторите выход.', 'error')
        return
      }
      router.push('/admin/login')
    } catch {
      toast('Ошибка соединения. Не удалось завершить сессию — повторите выход.', 'error')
    }
  }

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
        {tab === 'orders' && <OrdersTab orders={orders} onRetry={retryOrder} retrying={retrying} onRefund={refundOrder} refunding={refunding} />}
        {tab === 'crashes' && <CrashTab reports={crashes} onSelect={selectCrash} selected={selectedCrash} />}
        {tab === 'coupons' && <CouponsTab coupons={coupons} setCoupons={setCoupons} />}
        {tab === 'products' && <ProductsTab />}
        {tab === 'server' && <ServerTab />}
        {tab === 'rcon' && <RconTab />}
      </div>
    </div>
  )
}
