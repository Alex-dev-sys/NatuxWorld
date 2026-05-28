'use client'

import { useEffect, useState } from 'react'
import type { Order } from '@/lib/types'

const STATUS_LABELS: Record<string, string> = {
  created: 'Создан',
  waiting_payment: 'Ожидает оплаты',
  paid: 'Оплачен',
  delivery_pending: 'Выдача...',
  delivered: 'Выдан',
  delivery_failed: 'Ошибка выдачи',
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
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/orders')
      if (res.ok) setOrders(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const retry = async (id: string) => {
    setRetrying(id)
    try {
      const res = await fetch(`/api/admin/orders/${id}/retry-delivery`, { method: 'POST' })
      if (res.ok) {
        const { order } = await res.json()
        setOrders(prev => prev.map(o => o.id === id ? order : o))
      }
    } finally {
      setRetrying(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-pixel text-sm text-site-accent">АДМИН-ПАНЕЛЬ</h1>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded transition-colors text-sm"
        >
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Всего заказов', value: orders.length },
          { label: 'Выдано', value: orders.filter(o => o.status === 'delivered').length },
          { label: 'Ожидают', value: orders.filter(o => ['created', 'waiting_payment', 'paid', 'delivery_pending'].includes(o.status)).length },
          { label: 'Ошибки', value: orders.filter(o => o.status === 'delivery_failed').length },
        ].map(stat => (
          <div key={stat.label} className="bg-site-block border border-site-border rounded-lg p-4">
            <div className="text-site-muted text-xs mb-1">{stat.label}</div>
            <div className="text-2xl font-bold text-site-text">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-site-block border border-site-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-site-border">
          <h2 className="font-semibold text-site-text">Заказы</h2>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-site-muted text-sm">Загрузка...</div>
        ) : orders.length === 0 ? (
          <div className="px-6 py-12 text-center text-site-muted text-sm">
            Заказов пока нет. Создай тестовый заказ в{' '}
            <a href="/shop" className="text-site-accent hover:underline">магазине</a>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-site-border text-site-muted text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">ID</th>
                  <th className="text-left px-4 py-3">Дата</th>
                  <th className="text-left px-4 py-3">Ник</th>
                  <th className="text-left px-4 py-3">Товар</th>
                  <th className="text-left px-4 py-3">Срок</th>
                  <th className="text-left px-4 py-3">Сумма</th>
                  <th className="text-left px-4 py-3">Статус</th>
                  <th className="text-left px-4 py-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id} className="border-b border-site-border/50 hover:bg-site-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-site-muted">
                      <a href={`/order/${order.publicId}`} className="hover:text-site-accent transition-colors">
                        #{order.publicId.slice(0, 8).toUpperCase()}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-site-muted text-xs">
                      {new Date(order.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-mono text-site-text">{order.username}</td>
                    <td className="px-4 py-3 text-site-text">{order.productName}</td>
                    <td className="px-4 py-3 text-site-muted">{order.variantDurationLabel}</td>
                    <td className="px-4 py-3 text-site-text font-semibold">{order.price} ₽</td>
                    <td className="px-4 py-3">
                      <span className={STATUS_COLORS[order.status] ?? 'text-site-muted'}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                      {order.deliveryError && (
                        <div className="text-site-danger text-xs mt-0.5 truncate max-w-[140px]" title={order.deliveryError}>
                          {order.deliveryError}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {order.status === 'delivery_failed' && (
                        <button
                          onClick={() => retry(order.id)}
                          disabled={retrying === order.id}
                          className="px-3 py-1 text-xs border border-site-accent/50 text-site-accent hover:bg-site-accent/10 rounded transition-colors disabled:opacity-50"
                        >
                          {retrying === order.id ? 'Повтор...' : 'Повторить'}
                        </button>
                      )}
                      {order.status === 'delivered' && order.rconCommands && (
                        <span className="text-site-success text-xs">✓ выдан</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-site-secondary border border-site-dark-red/30 rounded-lg text-center">
        <p className="text-site-muted text-xs">
          ⚠️ В production добавь авторизацию для защиты админки
        </p>
      </div>
    </div>
  )
}
