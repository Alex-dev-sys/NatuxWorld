'use client'
import { useCallback, useEffect, useState } from 'react'

type AppPw = { id: string; label: string; createdAt: string; lastUsedAt: string | null }

function authHeaders(): HeadersInit {
  const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

export default function SecurityPage() {
  const [enabled, setEnabled] = useState(false)
  const [method, setMethod] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [apps, setApps] = useState<AppPw[]>([])
  const [newApp, setNewApp] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')

  const refresh = useCallback(async () => {
    const me = await fetch('/api/auth/me', { headers: authHeaders() }).then((r) => r.json()).catch(() => null)
    setEnabled(me?.user?.twoFactorEnabled ?? false)
    setMethod(me?.user?.twoFactorMethod ?? null)
    if (me?.user?.twoFactorEnabled) {
      const d = await fetch('/api/auth/app-passwords', { headers: authHeaders() }).then((r) => r.json()).catch(() => null)
      setApps(d?.appPasswords ?? [])
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function setupTotp() {
    setMsg('')
    const d = await fetch('/api/auth/2fa/totp/setup', { method: 'POST', headers: authHeaders() }).then((r) => r.json())
    setQr(d.qr)
  }
  async function enableTotp() {
    const r = await fetch('/api/auth/2fa/totp/enable', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ code }) })
    const d = await r.json()
    if (d.backupCodes) { setCodes(d.backupCodes); setQr(null); setCode(''); refresh() } else setMsg(d.error?.message ?? 'Ошибка')
  }
  async function enableEmail() {
    const r = await fetch('/api/auth/2fa/email/enable', { method: 'POST', headers: authHeaders() })
    const d = await r.json()
    if (d.backupCodes) { setCodes(d.backupCodes); refresh() } else setMsg(d.error?.message ?? 'Ошибка')
  }
  async function disable() {
    const r = await fetch('/api/auth/2fa/disable', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ password: pw, code }) })
    const d = await r.json()
    if (d.ok) { setPw(''); setCode(''); setCodes(null); refresh() } else setMsg(d.error?.message ?? 'Ошибка')
  }
  async function createApp() {
    const r = await fetch('/api/auth/app-passwords', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ label: 'Лаунчер' }) })
    const d = await r.json()
    if (d.password) { setNewApp(d.password); refresh() }
  }
  async function delApp(id: string) {
    await fetch(`/api/auth/app-passwords/${id}`, { method: 'DELETE', headers: authHeaders() })
    refresh()
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6 text-neutral-100">
      <h1 className="text-2xl font-bold">Безопасность · 2FA</h1>
      <p>Статус: {enabled ? <b>включена ({method})</b> : 'выключена'}</p>
      {msg && <p className="text-red-400">{msg}</p>}

      {!enabled && (
        <section className="space-y-3 rounded border border-neutral-700 p-4">
          <h2 className="font-semibold">Включить</h2>
          <button onClick={setupTotp} className="rounded bg-red-700 px-3 py-2">Приложение (TOTP)</button>
          {qr && (
            <div className="space-y-2">
              <img src={qr} alt="QR" width={180} height={180} />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код из приложения" className="rounded border bg-neutral-900 px-2 py-1" />
              <button onClick={enableTotp} className="ml-2 rounded bg-red-700 px-3 py-2">Подтвердить</button>
            </div>
          )}
          <div><button onClick={enableEmail} className="rounded bg-neutral-700 px-3 py-2">Код на email</button></div>
        </section>
      )}

      {codes && (
        <section className="rounded border border-yellow-600 p-4">
          <p className="font-semibold">Резервные коды — сохраните, показаны один раз:</p>
          <ul className="grid grid-cols-2 gap-1 font-mono">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      )}

      {enabled && (
        <>
          <section className="space-y-3 rounded border border-neutral-700 p-4">
            <h2 className="font-semibold">App-пароли (для лаунчера)</h2>
            <button onClick={createApp} className="rounded bg-red-700 px-3 py-2">Создать app-пароль</button>
            {newApp && <p className="font-mono text-green-400">Новый (показан один раз): {newApp}</p>}
            <ul className="space-y-1">
              {apps.map((a) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span>{a.label} · {a.lastUsedAt ? 'использовался' : 'не использовался'}</span>
                  <button onClick={() => delApp(a.id)} className="rounded bg-neutral-700 px-2 py-1 text-sm">Удалить</button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2 rounded border border-neutral-700 p-4">
            <h2 className="font-semibold">Выключить 2FA</h2>
            <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="Пароль" className="rounded border bg-neutral-900 px-2 py-1" />
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код 2FA / резервный" className="ml-2 rounded border bg-neutral-900 px-2 py-1" />
            <button onClick={disable} className="ml-2 rounded bg-neutral-700 px-3 py-2">Выключить</button>
          </section>
        </>
      )}
    </main>
  )
}
