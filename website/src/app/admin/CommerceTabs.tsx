'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/Toast'
import type { Order, Coupon } from './types'
import { fmtDate, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from './format'
import { StatCard, Table, Tr, Td } from './ui'

// ── Orders Tab ─────────────────────────────────────────────────────────────────
export function OrdersTab({ orders, onRetry, retrying, onRefund, refunding }: { orders: Order[]; onRetry: (id: string) => void; retrying: string | null; onRefund: (id: string) => void; refunding: string | null }) {
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
            <Td>
              <div className="flex gap-1.5">
                {o.status === 'delivery_failed' && <button onClick={() => onRetry(o.id)} disabled={retrying === o.id} className="px-2 py-1 text-xs border border-site-accent/50 text-site-accent hover:bg-site-accent/10 rounded disabled:opacity-40 transition-colors">{retrying === o.id ? '...' : 'Повторить'}</button>}
                {['paid', 'delivered', 'delivery_failed', 'delivery_pending', 'refund_failed'].includes(o.status) && <button onClick={() => onRefund(o.id)} disabled={refunding === o.id} className="px-2 py-1 text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded disabled:opacity-40 transition-colors">{refunding === o.id ? '...' : o.status === 'refund_failed' ? 'Повторить отзыв' : 'Возврат'}</button>}
              </div>
            </Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}

// ── Coupons Tab ────────────────────────────────────────────────────────────────
export function CouponsTab({ coupons, setCoupons }: { coupons: Coupon[]; setCoupons: React.Dispatch<React.SetStateAction<Coupon[]>> }) {
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

// ── Products Tab ─────────────────────────────────────────────────────────────────
interface AdminVariant { duration: string; durationLabel: string; price: number }
interface AdminProduct { id: string; name: string; active: boolean; badge?: string; order: number; popular: boolean; variants: AdminVariant[] }

export function ProductsTab() {
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
