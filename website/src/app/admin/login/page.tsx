'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Ошибка')
        return
      }

      // Only same-app admin paths are allowed; blocks javascript:/data: URLs,
      // scheme-relative '//host' and any backslash tricks (open redirect).
      const rawFrom = params.get('from') ?? '/admin'
      const from = /^\/admin(\/|$)/.test(rawFrom) && !rawFrom.includes(':') && !rawFrom.includes('\\')
        ? rawFrom
        : '/admin'
      router.push(from)
      router.refresh()
    } catch {
      setError('Ошибка соединения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-pixel text-xs text-site-accent mb-2">ADMIN</h1>
          <p className="text-site-muted text-sm">Введите пароль для доступа</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-site-block border border-site-border rounded-lg p-6">
          <div className="mb-4">
            <label className="block text-site-muted text-xs uppercase tracking-wider mb-2">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null) }}
              placeholder="••••••••"
              autoFocus
              className="w-full bg-site-bg border border-site-border focus:border-site-accent rounded px-4 py-3 text-site-text placeholder-site-muted/40 focus:outline-none transition-colors"
            />
          </div>

          <div className="mb-4">
            <label className="block text-site-muted text-xs uppercase tracking-wider mb-2">
              Код 2FA (TOTP)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(null) }}
              placeholder="000000"
              className="w-full bg-site-bg border border-site-border focus:border-site-accent rounded px-4 py-3 text-site-text placeholder-site-muted/40 focus:outline-none transition-colors tracking-widest"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-site-danger/10 border border-site-danger/30 rounded text-site-danger text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 bg-site-accent hover:bg-red-600 disabled:bg-site-border text-white font-semibold rounded transition-colors"
          >
            {loading ? 'Проверяем...' : 'Войти'}
          </button>
        </form>

        <p className="text-center text-site-muted text-xs mt-4 opacity-60">
          Пароль задаётся через ADMIN_PASSWORD в .env
        </p>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
