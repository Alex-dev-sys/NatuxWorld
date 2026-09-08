'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/Toast'
import type { OnlineRoster } from './types'

// ── RCON Tab ───────────────────────────────────────────────────────────────────
const RCON_PRESETS = [
  { label: 'Список игроков', cmd: 'list' }, { label: 'Время', cmd: 'time query daytime' },
  { label: 'TPS', cmd: 'tps' }, { label: 'Версия', cmd: 'version' }, { label: 'Clearlag', cmd: 'clearlagg run' },
]
export function RconTab() {
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

// ── Server Control Tab ──────────────────────────────────────────────────────────
export function ServerTab() {
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

  // Match the systemd STATE, not the "Active:" field label — a word-bounded
  // /active/ still matched "Active: inactive (dead)" and "Active: failed (…)".
  // Read the value after the label when present, and require the running state
  // explicitly rather than hunting for a substring anywhere in the output.
  const activeValue = /^[ \t]*Active:[ \t]*(.*)$/im.exec(status)?.[1] ?? status
  const online = /\bactive \(running\)/i.test(activeValue) ||
    // Fall back to a bare state word for non-systemd output (e.g. a custom script).
    /^[ \t]*(?:active|running)\b/i.test(activeValue.trim())
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
export function PlayerActionBar({ username, onDone }: { username: string; onDone?: () => void }) {
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
export function OnlineTab() {
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
