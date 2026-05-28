'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Order } from '@/lib/types'

const STATUS_LABELS: Record<string, string> = {
  created: 'Создан',
  waiting_payment: 'Ожидает оплаты',
  paid: 'Оплачен',
  delivery_pending: 'Ожидает выдачи',
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`font-semibold ${STATUS_COLORS[status] ?? 'text-site-muted'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export default function OrderClient({ initialOrder }: { initialOrder: Order }) {
  const [order, setOrder] = useState<Order>(initialOrder)
  const [paying, setPaying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const isTerminal = ['delivered', 'cancelled', 'refunded'].includes(order.status)
  const isPending = ['created', 'waiting_payment', 'paid', 'delivery_pending'].includes(order.status)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/orders/${order.publicId}`)
      if (res.ok) {
        const data = await res.json()
        setOrder(data)
      }
    } finally {
      setRefreshing(false)
    }
  }, [order.publicId])

  // Auto-refresh while pending
  useEffect(() => {
    if (isTerminal) return
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [isTerminal, refresh])

  const handleMockPay = async () => {
    setPaying(true)
    setPayError(null)
    try {
      const res = await fetch('/api/payments/webhook/mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPayError(data.error ?? 'Ошибка оплаты')
        return
      }
      setOrder(data.order)
    } catch {
      setPayError('Ошибка соединения')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        {order.status === 'delivered' ? (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h1 className="font-pixel text-xs md:text-sm text-site-success mb-2">ДОНАТ ВЫДАН!</h1>
            <p className="text-site-muted text-sm">Привилегии активированы на сервере</p>
          </>
        ) : order.status === 'delivery_failed' ? (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="font-pixel text-xs md:text-sm text-site-danger mb-2">ОШИБКА ВЫДАЧИ</h1>
            <p className="text-site-muted text-sm">Обратитесь в поддержку с номером заказа</p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">🛒</div>
            <h1 className="font-pixel text-xs md:text-sm text-site-accent mb-2">СТАТУС ЗАКАЗА</h1>
          </>
        )}
      </div>

      {/* Order card */}
      <div className="bg-site-block border border-site-border rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-site-border flex items-center justify-between">
          <span className="text-site-muted text-xs font-mono">#{order.publicId.slice(0, 8).toUpperCase()}</span>
          <span className="text-xs text-site-muted">
            {new Date(order.createdAt).toLocaleString('ru-RU')}
          </span>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-site-muted text-xs uppercase tracking-wider mb-1">Ник</div>
              <div className="text-site-text font-mono font-medium">{order.username}</div>
            </div>
            <div>
              <div className="text-site-muted text-xs uppercase tracking-wider mb-1">Ранг</div>
              <div className="text-site-text font-medium">{order.productName}</div>
            </div>
            <div>
              <div className="text-site-muted text-xs uppercase tracking-wider mb-1">Срок</div>
              <div className="text-site-text">{order.variantDurationLabel}</div>
            </div>
            <div>
              <div className="text-site-muted text-xs uppercase tracking-wider mb-1">Сумма</div>
              <div className="text-site-text font-bold">{order.price} ₽</div>
            </div>
          </div>

          <div className="border-t border-site-border pt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-site-muted text-xs uppercase tracking-wider mb-1">Оплата</div>
              <StatusBadge status={['paid', 'delivery_pending', 'delivered', 'delivery_failed'].includes(order.status) ? 'paid' : order.status} />
            </div>
            <div>
              <div className="text-site-muted text-xs uppercase tracking-wider mb-1">Выдача</div>
              <StatusBadge status={order.status === 'delivered' ? 'delivered' : order.status === 'delivery_failed' ? 'delivery_failed' : order.status === 'delivery_pending' ? 'delivery_pending' : 'waiting_payment'} />
            </div>
          </div>

          {order.deliveryError && (
            <div className="border border-site-danger/30 bg-site-danger/10 rounded p-3">
              <p className="text-site-danger text-xs font-mono">{order.deliveryError}</p>
            </div>
          )}

          {order.rconCommands && order.rconCommands.length > 0 && (
            <div className="border-t border-site-border pt-4">
              <div className="text-site-muted text-xs uppercase tracking-wider mb-2">RCON команды</div>
              <div className="space-y-1">
                {order.rconCommands.map(cmd => (
                  <div key={cmd} className="font-mono text-xs text-site-success bg-black/40 px-3 py-1.5 rounded">
                    {cmd}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {/* Mock pay button — only if waiting */}
        {(order.status === 'created' || order.status === 'waiting_payment') && (
          <div className="bg-site-secondary border border-site-dark-red/50 rounded-lg p-4">
            <p className="text-site-muted text-xs mb-3 text-center">
              🧪 Режим разработки — настоящая оплата не подключена
            </p>
            <button
              onClick={handleMockPay}
              disabled={paying}
              className="w-full py-3 bg-site-accent hover:bg-red-600 disabled:bg-site-border text-white font-semibold rounded transition-colors flex items-center justify-center gap-2"
            >
              {paying ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Обрабатываем...
                </>
              ) : (
                'Mock: Оплатить и выдать'
              )}
            </button>
            {payError && (
              <p className="mt-2 text-site-danger text-xs text-center">{payError}</p>
            )}
          </div>
        )}

        {/* Refresh */}
        {isPending && (
          <button
            onClick={refresh}
            disabled={refreshing}
            className="w-full py-2.5 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded transition-colors text-sm flex items-center justify-center gap-2"
          >
            {refreshing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Обновить статус
          </button>
        )}

        <a
          href="https://vk.com/natuxworld"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-2.5 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded transition-colors text-sm text-center"
        >
          Поддержка в VK
        </a>
      </div>
    </div>
  )
}
