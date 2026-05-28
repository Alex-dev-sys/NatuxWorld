'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Order } from '@/lib/types'
import { useToast } from '@/components/Toast'

const STATUS_LABELS: Record<string, string> = {
  created: 'Создан',
  waiting_payment: 'Ожидает оплаты',
  paid: 'Оплачен',
  delivery_pending: 'Выдача...',
  delivered: 'Выдан',
  delivery_failed: 'Ошибка',
  cancelled: 'Отменён',
  refunded: 'Возврат',
}

const STATUS_COLORS: Record<string, string> = {
  created: 'text-site-muted',
  waiting_payment: 'text-yellow-400',
  paid: 'text-blue-400',
  delivery_pending: 'text-yellow-400',
  delivered: 'text-site-success',
  delivery_failed: 'text-site-danger',
  cancelled: 'text-site-muted',
  refunded: 'text-site-muted',
}

export default function AdminPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/orders')
      if (res.status === 401) { router.push('/admin/login'); return }
      if (res.ok) setOrders(await res.json())
    } catch {
      toast('Ошибка загрузки заказов', 'error')
    } finally {
      setLoading(false)
    }
  }, [router, toast])

  useEffect(() => { load() }, [load])

  const retry = async (id: string) => {
    setRetrying(id)
    try {
      const res = await fetch(`/api/admin/orders/${id}/retry-delivery`, { method: 'POST' })
      if (res.ok) {
        const { order } = await res.json()
        setOrders(prev => prev.map(o => o.id === id ? order : o))
        toast(order.status === 'delivered' ? 'Донат выдан!' : 'Ошибка выдачи', order.status === 'delivered' ? 'success' : 'error')
      }
    } catch {
      toast('Ошибка запроса', 'error')
    } finally {
      setRetrying(null)
    }
  }

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  const stats = {
    total: orders.length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    pending: orders.filter(o => ['waiting_payment', 'delivery_pending', 'paid'].includes(o.status)).length,
    failed: orders.filter(o => o.status === 'delivery_failed').length,
    revenue: orders.filter(o => ['delivered', 'paid', 'delivery_pending'].includes(o.status)).reduce((s, o) => s + o.price, 0),
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-pixel text-xs md:text-sm text-site-accent">АДМИН-ПАНЕЛЬ</h1>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded text-xs transition-colors"
          >
            {loading ? '...' : '↻ Обновить'}
          </button>
          <button
            onClick={logout}
            className="px-3 py-2 border border-site-border hover:border-site-danger text-site-muted hover:text-site-danger rounded text-xs transition-colors"
          >
            Выйти
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Заказов', value: stats.total },
          { label: 'Выдано', value: stats.delivered, color: 'text-site-success' },
          { label: 'В обработке', value: stats.pending, color: 'text-yellow-400' },
          { label: 'Ошибки', value: stats.failed, color: 'text-site-danger' },
          { label: 'Выручка', value: `${stats.revenue.toLocaleString('ru')} ₽`, color: 'text-site-accent' },
        ].map(stat => (
          <div key={stat.label} className="bg-site-block border border-site-border rounded-lg p-4">
            <div className="text-site-muted text-xs mb-1">{stat.label}</div>
            <div className={`text-xl font-bold ${stat.color ?? 'text-site-text'}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { key: 'all', label: 'Все' },
          { key: 'delivered', label: 'Выданные' },
          { key: 'delivery_failed', label: 'Ошибки' },
          { key: 'waiting_payment', label: 'Ожидают оплаты' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              filter === key
                ? 'border-site-accent text-site-accent bg-site-secondary'
                : 'border-site-border text-site-muted hover:border-site-accent/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-site-block border border-site-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-site-muted text-sm">Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-site-muted text-sm">
            {filter === 'all' ? (
              <>Заказов нет. Создай тестовый в <a href="/shop" className="text-site-accent hover:underline">магазине</a>.</>
            ) : 'Нет заказов в этом фильтре'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-site-border text-site-muted text-xs uppercase tracking-wider">
                  {['ID', 'Дата', 'Ник', 'Товар', 'Срок', 'Сумма', 'Статус', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <tr key={order.id} className="border-b border-site-border/40 hover:bg-site-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <a href={`/order/${order.publicId}`} className="font-mono text-xs text-site-muted hover:text-site-accent transition-colors">
                        #{order.publicId.slice(0, 8).toUpperCase()}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-site-muted text-xs whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-mono text-site-text text-sm">{order.username}</td>
                    <td className="px-4 py-3 text-site-text">{order.productName}</td>
                    <td className="px-4 py-3 text-site-muted text-xs">{order.variantDurationLabel}</td>
                    <td className="px-4 py-3 font-semibold text-site-text whitespace-nowrap">
                      {order.price} ₽
                      {order.originalPrice && order.originalPrice !== order.price && (
                        <span className="ml-1 text-xs text-site-muted line-through">{order.originalPrice}₽</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={STATUS_COLORS[order.status] ?? 'text-site-muted'}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                      {order.couponCode && (
                        <div className="text-[10px] text-site-success mt-0.5">{order.couponCode}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {order.status === 'delivery_failed' && (
                        <button
                          onClick={() => retry(order.id)}
                          disabled={retrying === order.id}
                          className="px-2 py-1 text-xs border border-site-accent/50 text-site-accent hover:bg-site-accent/10 rounded transition-colors disabled:opacity-40"
                        >
                          {retrying === order.id ? '...' : 'Повторить'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
