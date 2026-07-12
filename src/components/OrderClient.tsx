'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Order } from '@/lib/types'
import { useToast } from '@/components/Toast'

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  created: 'Создан',
  waiting_payment: 'Ожидает оплаты',
  paid: 'Оплачен',
  delivery_pending: 'Ожидает выдачи',
  delivered: 'Выдан ✓',
  delivery_failed: 'Ошибка выдачи',
  refund_failed: 'Ошибка отзыва привилегии',
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
  refund_failed: 'text-site-danger',
  cancelled: 'text-site-muted',
  refunded: 'text-site-muted',
}

function getPaymentStatus(status: string): string {
  if (['paid', 'delivery_pending', 'delivered', 'delivery_failed'].includes(status)) return 'paid'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'refunded' || status === 'refund_failed') return 'refunded'
  return 'waiting_payment'
}

function getDeliveryStatus(status: string): string {
  if (status === 'delivered') return 'delivered'
  if (status === 'delivery_failed') return 'delivery_failed'
  if (status === 'delivery_pending') return 'delivery_pending'
  return 'waiting_payment' // not paid yet — delivery N/A shown as waiting
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`font-semibold ${STATUS_COLORS[status] ?? 'text-site-muted'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function OrderClient({ initialOrder }: { initialOrder: Order }) {
  const { toast } = useToast()
  const [order, setOrder] = useState<Order>(initialOrder)
  const [paying, setPaying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const isTerminal = ['delivered', 'cancelled', 'refunded', 'refund_failed'].includes(order.status)
  const isWaiting = ['created', 'waiting_payment'].includes(order.status)
  const isPending = !isTerminal

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch(`/api/orders/${order.publicId}`)
      if (res.ok) {
        const data: Order = await res.json()
        setOrder(data)
        if (!silent && data.status !== order.status) {
          toast('Статус заказа обновлён', 'info')
        }
      }
    } catch {
      if (!silent) toast('Не удалось обновить статус', 'error')
    } finally {
      if (!silent) setRefreshing(false)
    }
  }, [order.publicId, order.status, toast])

  // Auto-refresh while pending
  useEffect(() => {
    if (isTerminal) return
    const id = setInterval(() => refresh(true), 5000)
    return () => clearInterval(id)
  }, [isTerminal, refresh])

  const handleMockPay = async () => {
    setPaying(true)
    try {
      const res = await fetch('/api/payments/webhook/mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error ?? 'Ошибка оплаты', 'error')
        return
      }
      setOrder(data.order)
      if (data.order.status === 'delivered') {
        toast('Донат успешно выдан!', 'success')
      } else if (data.order.status === 'delivery_failed') {
        toast('Оплата прошла, но выдача не удалась', 'warning')
      }
    } catch {
      toast('Ошибка соединения', 'error')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-12">
      {/* Status header */}
      <div className="text-center mb-8">
        {order.status === 'delivered' ? (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h1 className="font-pixel text-xs md:text-sm text-site-success mb-2">ДОНАТ ВЫДАН!</h1>
            <p className="text-site-muted text-sm">Привилегии активированы. Заходи на сервер!</p>
          </>
        ) : order.status === 'delivery_failed' ? (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="font-pixel text-xs md:text-sm text-site-danger mb-2">ОШИБКА ВЫДАЧИ</h1>
            <p className="text-site-muted text-sm">Оплата прошла. Обратитесь в поддержку.</p>
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
        <div className="px-6 py-3 border-b border-site-border flex items-center justify-between bg-site-secondary/30">
          <span className="font-mono text-site-muted text-xs">
            #{order.publicId.slice(0, 8).toUpperCase()}
          </span>
          <span className="text-site-muted text-xs">
            {new Date(order.createdAt).toLocaleString('ru-RU')}
          </span>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-site-muted text-xs uppercase tracking-wider mb-1">Ник</p>
              <p className="font-mono text-site-text font-semibold">{order.username}</p>
            </div>
            <div>
              <p className="text-site-muted text-xs uppercase tracking-wider mb-1">Ранг</p>
              <p className="text-site-text font-medium">{order.productName}</p>
            </div>
            <div>
              <p className="text-site-muted text-xs uppercase tracking-wider mb-1">Срок</p>
              <p className="text-site-text">{order.variantDurationLabel}</p>
            </div>
            <div>
              <p className="text-site-muted text-xs uppercase tracking-wider mb-1">Сумма</p>
              <div className="flex items-baseline gap-2">
                <p className="text-site-text font-bold">{order.price} ₽</p>
                {order.originalPrice && order.originalPrice !== order.price && (
                  <p className="text-site-muted text-xs line-through">{order.originalPrice} ₽</p>
                )}
              </div>
            </div>
          </div>

          {/* Status row */}
          <div className="border-t border-site-border pt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-site-muted text-xs uppercase tracking-wider mb-1">Оплата</p>
              <Badge status={getPaymentStatus(order.status)} />
            </div>
            <div>
              <p className="text-site-muted text-xs uppercase tracking-wider mb-1">Выдача</p>
              {['paid', 'delivery_pending', 'delivered', 'delivery_failed'].includes(order.status)
                ? <Badge status={getDeliveryStatus(order.status)} />
                : <span className="text-site-muted text-sm">—</span>
              }
            </div>
          </div>

          {/* Error */}
          {order.deliveryError && (
            <div className="border border-site-danger/30 bg-site-danger/5 rounded p-3">
              <p className="text-site-danger text-xs font-mono break-all">{order.deliveryError}</p>
            </div>
          )}

          {/* RCON commands */}
          {order.rconCommands && order.rconCommands.length > 0 && (
            <div className="border-t border-site-border pt-4">
              <p className="text-site-muted text-xs uppercase tracking-wider mb-2">Выполненные RCON-команды</p>
              <div className="space-y-1">
                {order.rconCommands.map(cmd => (
                  <code key={cmd} className="block font-mono text-xs text-site-success bg-black/40 px-3 py-1.5 rounded break-all">
                    {cmd}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {/* Mock pay */}
        {isWaiting && (
          <div className="bg-site-secondary border border-site-dark-red/40 rounded-lg p-4">
            <p className="text-site-muted text-xs mb-3 text-center">
              🧪 Режим разработки — реальная оплата не подключена
            </p>
            <button
              onClick={handleMockPay}
              disabled={paying}
              className="w-full py-3 bg-site-accent hover:bg-red-600 disabled:bg-site-border disabled:text-site-muted text-white font-semibold rounded transition-colors flex items-center justify-center gap-2"
            >
              {paying
                ? <><Spinner /> Обрабатываем...</>
                : 'Mock: Оплатить и выдать'
              }
            </button>
          </div>
        )}

        {/* Refresh */}
        {isPending && (
          <button
            onClick={() => refresh(false)}
            disabled={refreshing}
            className="w-full py-2.5 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded transition-colors text-sm flex items-center justify-center gap-2"
          >
            {refreshing ? <><Spinner /> Обновляем...</> : '↻ Обновить статус'}
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

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
