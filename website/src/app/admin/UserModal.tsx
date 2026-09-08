'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/Toast'
import { fetchJson } from './api'
import type { AdminUser, UserDetail } from './types'
import { PRODUCTS, DURATIONS, fmtDate, KIND_BADGE, GAME_KIND_STYLE, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from './format'
import { Modal, StatCard, Table, Tr, Td } from './ui'
import { PlayerActionBar } from './ServerTabs'

type UserTab = 'info' | 'game' | 'orders' | 'activity'

export function UserModal({ userId, onClose, onUpdate }: { userId: string; onClose: () => void; onUpdate: (u: Partial<AdminUser>) => void }) {
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
  const [editField, setEditField] = useState<'email' | 'username' | null>(null)
  const [editVal, setEditVal] = useState('')
  const [tempPw, setTempPw] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchJson<UserDetail>(`/api/admin/users/${userId}`)
      .then(d => { if (!cancelled) { setUser(d); setLoadError(null) } })
      .catch(e => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
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
      const fresh = await fetchJson<UserDetail>(`/api/admin/users/${userId}`)
      setUser(fresh)
      onUpdate({ id: userId, bannedAt: fresh.bannedAt, banReason: fresh.banReason, tokenVersion: fresh.tokenVersion, emailVerified: fresh.emailVerified })
    } catch { toast('Ошибка', 'error') } finally { setActing(null); setShowBanForm(false) }
  }

  const saveEdit = async () => {
    if (!editField) return
    const act = editField === 'email' ? 'set-email' : 'set-username'
    if (editField === 'username' && !confirm('Ник — игровая идентичность (вход на сервер). Сменить? Заказы и игровые события будут перенесены на новый ник.')) return
    await action(act, editField === 'email' ? { email: editVal } : { username: editVal })
    setEditField(null); setEditVal('')
  }

  const resetPassword = async () => {
    if (!confirm('Сбросить пароль? Текущий перестанет работать, все сессии завершатся. Будет выдан временный пароль.')) return
    setActing('reset-password')
    try {
      const r = await fetch(`/api/admin/users/${userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset-password' }) })
      const d = await r.json()
      if (r.ok && d.tempPassword) { setTempPw(d.tempPassword); toast('Пароль сброшен', 'success') } else toast(d.error ?? 'Ошибка', 'error')
    } catch { toast('Ошибка', 'error') } finally { setActing(null) }
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

  if (loading) return (
    <Modal title="Пользователь" onClose={onClose}>
      <div className="py-16 text-center text-site-muted">Загрузка...</div>
    </Modal>
  )

  if (!user) return (
    <Modal title="Пользователь" onClose={onClose}>
      <div className="py-16 text-center text-red-400">{loadError ?? 'Не удалось загрузить пользователя'}</div>
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
                <button onClick={() => { setEditField('email'); setEditVal(user.email) }} disabled={!!acting}
                  className="px-3 py-2 text-xs border border-site-border text-site-muted hover:text-site-text rounded disabled:opacity-40 transition-colors">Изменить email</button>
                <button onClick={() => { setEditField('username'); setEditVal(user.username) }} disabled={!!acting}
                  className="px-3 py-2 text-xs border border-site-border text-site-muted hover:text-site-text rounded disabled:opacity-40 transition-colors">Изменить ник</button>
                <button onClick={resetPassword} disabled={!!acting}
                  className="px-3 py-2 text-xs border border-orange-500/50 text-orange-400 hover:bg-orange-500/10 rounded disabled:opacity-40 transition-colors">{acting === 'reset-password' ? '...' : 'Сбросить пароль'}</button>
                <button onClick={() => action('reset-2fa')} disabled={!!acting}
                  className="px-3 py-2 text-xs border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 rounded disabled:opacity-40 transition-colors">{acting === 'reset-2fa' ? '...' : 'Сбросить 2FA'}</button>
              </div>

              {/* Edit email / username form */}
              {editField && (
                <div className="flex gap-2">
                  <input value={editVal} onChange={e => setEditVal(e.target.value)}
                    placeholder={editField === 'email' ? 'Новый email' : 'Новый ник'}
                    className="flex-1 bg-site-block border border-site-accent/50 rounded px-3 py-2 text-sm focus:outline-none focus:border-site-accent transition-colors" />
                  <button onClick={saveEdit} disabled={!!acting || !editVal.trim()}
                    className="px-4 py-2 text-xs bg-site-accent text-white rounded hover:bg-site-accent/80 disabled:opacity-40 transition-colors font-medium">Сохранить</button>
                  <button onClick={() => { setEditField(null); setEditVal('') }}
                    className="px-3 py-2 text-xs border border-site-border text-site-muted hover:text-site-text rounded transition-colors">Отмена</button>
                </div>
              )}

              {/* Temp password (shown once) */}
              {tempPw && (
                <div className="bg-orange-500/5 border border-orange-500/30 rounded p-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-orange-300">Временный пароль (передай игроку, больше не покажется): <span className="font-mono font-bold select-all">{tempPw}</span></div>
                  <button onClick={() => setTempPw(null)} className="text-orange-300/60 hover:text-orange-300 text-sm">×</button>
                </div>
              )}

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
                  {['all', 'anticheat', 'command', 'chat', 'block_break', 'block_place', 'kill', 'death', 'join', 'quit'].map(k => {
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
          <div className="space-y-5">
            {user.ipHistory && user.ipHistory.length > 0 && (
              <div className="space-y-2">
                <div className="text-site-muted text-xs uppercase tracking-wider">История IP ({user.ipHistory.length})</div>
                <div className="flex flex-wrap gap-2">
                  {user.ipHistory.map(h => (
                    <span key={h.ip} className="flex items-center gap-2 px-2 py-1 text-xs font-mono bg-site-border/30 rounded">
                      <span className="text-site-text">{h.ip}</span>
                      <span className="text-site-muted">×{h.count}</span>
                      {h.lastSeen && <span className="text-site-muted/60">{fmtDate(h.lastSeen)}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
          </div>
        )}

      </div>
    </Modal>
  )
}
