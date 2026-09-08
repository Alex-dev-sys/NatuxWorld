export const PRODUCTS = [
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
export const DURATIONS = [
  { id: '30d', label: '30 дней' },
  { id: '90d', label: '90 дней' },
  { id: 'forever', label: 'Навсегда' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
export const fmtDate = (s: string) => new Date(s).toLocaleString('ru-RU', {
  day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit',
})

export const KIND_BADGE: Record<string, string> = {
  login: 'text-green-400 bg-green-400/10',
  fail: 'text-red-400 bg-red-400/10',
  join: 'text-blue-400 bg-blue-400/10',
  register: 'text-yellow-400 bg-yellow-400/10',
  verify: 'text-purple-400 bg-purple-400/10',
}
export const GAME_KIND_STYLE: Record<string, string> = {
  command: 'text-yellow-300 bg-yellow-400/10',
  chat: 'text-blue-300 bg-blue-400/10',
  block_break: 'text-orange-400 bg-orange-400/10',
  block_place: 'text-green-300 bg-green-400/10',
  join: 'text-green-400 bg-green-400/10',
  quit: 'text-site-muted bg-site-border/20',
  death: 'text-red-400 bg-red-400/10',
  kill: 'text-purple-400 bg-purple-400/10',
  anticheat: 'text-red-300 bg-red-500/15',
}
export const ORDER_STATUS_LABEL: Record<string, string> = {
  created: 'Создан', waiting_payment: 'Ожидает', paid: 'Оплачен',
  delivery_pending: 'Выдача...', delivered: 'Выдан',
  delivery_failed: 'Ошибка', cancelled: 'Отменён',
  refund_failed: 'Ошибка отзыва', refunded: 'Возврат',
}
export const ORDER_STATUS_COLOR: Record<string, string> = {
  delivered: 'text-green-400', delivery_failed: 'text-red-400', refund_failed: 'text-red-400',
  waiting_payment: 'text-yellow-400', delivery_pending: 'text-yellow-400',
}
