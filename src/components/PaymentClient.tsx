'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Order } from '@/lib/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtCard(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}
function fmtExpiry(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}
function cardType(num: string): 'visa' | 'mc' | 'mir' | null {
  const n = num.replace(/\s/g, '')
  if (n.startsWith('4')) return 'visa'
  if (n.startsWith('5') || (n >= '2221' && n <= '2720')) return 'mc'
  if (n.startsWith('2')) return 'mir'
  return null
}

// ─── card logo ────────────────────────────────────────────────────────────────

function CardLogo({ type }: { type: 'visa' | 'mc' | 'mir' | null }) {
  if (type === 'visa') return (
    <span style={{ fontFamily: 'serif', fontStyle: 'italic', fontWeight: 900, fontSize: 20, color: '#fff', letterSpacing: -1 }}>VISA</span>
  )
  if (type === 'mc') return (
    <svg width="40" height="26" viewBox="0 0 38 24">
      <circle cx="15" cy="12" r="11" fill="#EB001B" />
      <circle cx="23" cy="12" r="11" fill="#F79E1B" />
      <path d="M19 4.8a11 11 0 0 1 0 14.4A11 11 0 0 1 19 4.8z" fill="#FF5F00" />
    </svg>
  )
  if (type === 'mir') return (
    <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: 'linear-gradient(90deg,#00b4d8,#0077b6)', padding: '2px 7px', borderRadius: 4 }}>МИР</span>
  )
  return <span style={{ fontSize: 10, color: '#555', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em' }}>CARD</span>
}

// ─── 3D flip card ─────────────────────────────────────────────────────────────

function CardVisual({ number, name, expiry, cvv, flipped }: {
  number: string; name: string; expiry: string; cvv: string; flipped: boolean
}) {
  const type = cardType(number)
  const filled = number.replace(/\s/g, '')
  const masked = (filled.slice(0, 4) || '••••') + ' •••• •••• ' + (filled.slice(12, 16) || '••••')

  return (
    <div style={{ perspective: 900, marginBottom: 24 }}>
      <div style={{
        position: 'relative', width: '100%', height: 190,
        transformStyle: 'preserve-3d',
        transition: 'transform 0.55s cubic-bezier(0.4,0,0.2,1)',
        transform: flipped ? 'rotateY(180deg)' : 'none',
      }}>

        {/* ── Front ── */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 18,
          background: 'linear-gradient(135deg, #1a0808 0%, #2d0a14 45%, #0e0e0e 100%)',
          border: '1px solid #3A1017', padding: '22px 26px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          boxShadow: '0 24px 60px rgba(255,43,79,0.18)',
          overflow: 'hidden',
        }}>
          {/* grid texture */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,43,79,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,43,79,0.03) 1px, transparent 1px)', backgroundSize: '20px 20px', pointerEvents: 'none' }} />
          {/* glow orb */}
          <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,43,79,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
          {/* corner bracket TR */}
          <div style={{ position: 'absolute', top: 10, right: 10, width: 14, height: 14, borderRight: '1.5px solid #FF2B4F40', borderTop: '1.5px solid #FF2B4F40' }} />
          {/* corner bracket BL */}
          <div style={{ position: 'absolute', bottom: 10, left: 10, width: 14, height: 14, borderLeft: '1.5px solid #FF2B4F40', borderBottom: '1.5px solid #FF2B4F40' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            {/* chip */}
            <div style={{ width: 44, height: 32, borderRadius: 6, background: 'linear-gradient(135deg, #c8992a, #f0d060, #a87820)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              <div style={{ width: 30, height: 22, border: '1px solid rgba(0,0,0,0.25)', borderRadius: 3, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: 3 }}>
                {[0,1,2,3].map(i => <div key={i} style={{ background: 'rgba(0,0,0,0.18)', borderRadius: 1 }} />)}
              </div>
            </div>
            <CardLogo type={type} />
          </div>

          {/* number */}
          <div style={{ fontFamily: '"Courier New", monospace', fontSize: 18, letterSpacing: 3, color: '#fff', position: 'relative', textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>
            {masked}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginBottom: 3, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: '"JetBrains Mono", monospace' }}>Держатель</div>
              <div style={{ fontSize: 13, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: '"Courier New", monospace' }}>
                {name || 'IVAN IVANOV'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginBottom: 3, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: '"JetBrains Mono", monospace' }}>Срок</div>
              <div style={{ fontSize: 13, color: '#fff', fontFamily: '"Courier New", monospace' }}>{expiry || 'MM/YY'}</div>
            </div>
          </div>
        </div>

        {/* ── Back ── */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 18,
          background: 'linear-gradient(135deg, #0e0e0e 0%, #1a0808 100%)',
          border: '1px solid #3A1017', transform: 'rotateY(180deg)', overflow: 'hidden',
        }}>
          <div style={{ height: 50, background: '#000', margin: '30px 0 20px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} />
          <div style={{ padding: '0 26px' }}>
            <div style={{ fontSize: 9, color: '#555', marginBottom: 6, letterSpacing: '0.3em', fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase' }}>CVV / CVC</div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', border: '1px solid #2a1010' }}>
              <span style={{ fontFamily: '"Courier New", monospace', color: '#fff', letterSpacing: 6, fontSize: 18 }}>
                {cvv ? cvv.replace(/./g, '●') : '●●●'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── pay button ───────────────────────────────────────────────────────────────

function PayButton({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        width: '100%', padding: '16px 0', border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        background: loading ? '#1a0808' : 'linear-gradient(135deg, #FF2B4F, #cc1a35)',
        color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase',
        boxShadow: loading ? 'none' : '0 4px 24px rgba(255,43,79,0.4)',
        transition: 'all 0.2s',
        fontFamily: '"Bebas Neue", sans-serif',
        clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {loading ? (
        <>
          <svg style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          ОБРАБАТЫВАЕМ...
        </>
      ) : (
        <>
          <span>▶ {label}</span>
        </>
      )}
    </button>
  )
}

// ─── ymoney panel ────────────────────────────────────────────────────────────

function YMoneyPanel({ order, loading, setLoading, setError }: {
  order: Order
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (v: string | null) => void
}) {
  const wallet = process.env.NEXT_PUBLIC_YOOMONEY_WALLET

  const handleRedirect = () => {
    if (!wallet) {
      setError('ЮMoney кошелёк не настроен. Обратитесь к администратору.')
      return
    }
    setLoading(true)
    const successUrl = `${window.location.origin}/order/${order.publicId}`
    const params = new URLSearchParams({
      receiver: wallet,
      'quickpay-form': 'shop',
      targets: `Ранг ${order.productName} для ${order.username}`,
      paymentType: 'AC',
      sum: String(order.price),
      successURL: successUrl,
      label: order.publicId,
    })
    window.location.href = `https://yoomoney.ru/quickpay/confirm.xml?${params.toString()}`
  }

  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      {/* Logo */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          backgroundColor: '#1a1a0a', border: '1px solid #3a3a10',
          borderRadius: 12, padding: '14px 24px',
        }}>
          <span style={{ fontSize: 28 }}>🟡</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, color: '#FFD700', letterSpacing: '0.1em', lineHeight: 1 }}>ЮMONEY</div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#666', letterSpacing: '0.2em', marginTop: 2 }}>БЕЗОПАСНАЯ ОПЛАТА</div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22, textAlign: 'left' }}>
        {[
          { n: '01', text: 'Нажми кнопку ниже — откроется сайт ЮMoney' },
          { n: '02', text: 'Оплати картой или кошельком ЮMoney' },
          { n: '03', text: 'Ранг выдастся автоматически через 1-2 мин' },
        ].map(s => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 12px', backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8 }}>
            <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 16, color: '#3A1017', flexShrink: 0, lineHeight: 1.2 }}>{s.n}</span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#888', lineHeight: 1.5 }}>{s.text}</span>
          </div>
        ))}
      </div>

      {/* Amount */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: 'rgba(255,43,79,0.07)', border: '1px solid rgba(255,43,79,0.2)',
        borderRadius: 10, padding: '12px 18px', marginBottom: 18,
      }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#666', letterSpacing: '0.35em', textTransform: 'uppercase' }}>К ОПЛАТЕ</span>
        <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 28, color: '#FF2B4F', letterSpacing: '0.05em' }}>{order.price} ₽</span>
      </div>

      <PayButton loading={loading} onClick={handleRedirect} label={`ПЕРЕЙТИ К ОПЛАТЕ · ${order.price} ₽`} />

      <div style={{ marginTop: 10, fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#333', letterSpacing: '0.2em' }}>
        ПЕРЕНАПРАВЛЕНИЕ НА YOOMONEY.RU
      </div>
    </div>
  )
}

// ─── sbp panel ────────────────────────────────────────────────────────────────

function SbpPanel({ onPay, loading }: { onPay: () => void; loading: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#555', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 20 }}>
        ОТСКАНИРУЙ QR В ПРИЛОЖЕНИИ БАНКА
      </div>
      {/* QR mock */}
      <div style={{ width: 148, height: 148, margin: '0 auto 20px', background: '#fff', borderRadius: 10, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(11,1fr)', gap: 1.5 }}>
        {Array.from({ length: 121 }).map((_, i) => {
          const corner = [0,1,2,3,4,11,12,13,14,15,22,33,44,55,66,77,88,99,110,116,117,118,119,120,109,98,87,76,65].includes(i)
          const dot = Math.sin(i * 7.3 + 13) > 0.1
          return <div key={i} style={{ background: (corner || dot) ? '#111' : 'transparent', borderRadius: 1 }} />
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#00c2ff,#00ff9d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>⚡</div>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#666', letterSpacing: '0.15em' }}>СИСТЕМА БЫСТРЫХ ПЛАТЕЖЕЙ</span>
      </div>
      <PayButton loading={loading} onClick={onPay} label="Подтвердить оплату" />
    </div>
  )
}

// ─── success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ productName, username }: { productName: string; username: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <style>{`@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.2)}100%{transform:scale(1)}}`}</style>
      <div style={{ fontSize: 64, marginBottom: 20, display: 'inline-block', animation: 'pop 0.4s ease' }}>✅</div>

      <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 32, color: '#22c55e', letterSpacing: '0.15em', marginBottom: 8 }}>
        ОПЕРАЦИЯ ЗАВЕРШЕНА
      </div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#555', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 28 }}>
        ПЛАТЁЖ ПОДТВЕРЖДЁН
      </div>

      <div style={{ backgroundColor: '#0e0e0e', border: '1px solid #22c55e30', borderRadius: 10, padding: '16px 20px', marginBottom: 20, textAlign: 'left' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'РАНГ', value: productName, color: '#FF2B4F' },
            { label: 'ИГРОК', value: username, color: '#fff', mono: true },
            { label: 'СТАТУС', value: 'ВЫДАЁТСЯ...', color: '#22c55e' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#444', letterSpacing: '0.3em', textTransform: 'uppercase' }}>{item.label}</span>
              <span style={{ fontFamily: item.mono ? '"Courier New", monospace' : '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {['Оплата подтверждена', 'Ранг выдаётся автоматически', 'Привилегии активны в течение минуты'].map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <span style={{ color: '#22c55e', fontSize: 12 }}>✓</span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#666' }}>{t}</span>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#3A1017', letterSpacing: '0.3em' }}>
        ПЕРЕНАПРАВЛЕНИЕ НА СТРАНИЦУ ЗАКАЗА...
      </div>
    </div>
  )
}

// ─── field ────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontFamily: '"JetBrains Mono", monospace',
        fontSize: 9, color: '#555', letterSpacing: '0.4em',
        textTransform: 'uppercase', marginBottom: 7,
      }}>{label}</label>
      {children}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

type Method = 'card' | 'sbp' | 'ymoney'

export default function PaymentClient({ order }: { order: Order }) {
  const router = useRouter()
  const [method, setMethod] = useState<Method>('card')
  const [cardNum, setCardNum] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [holder, setHolder] = useState('')
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const cvvRef = useRef<HTMLInputElement>(null)

  const isCardValid = cardNum.replace(/\s/g, '').length === 16 && expiry.length === 5 && cvv.length === 3 && holder.trim().length >= 2

  const handlePay = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/payments/webhook/mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Ошибка оплаты'); setLoading(false); return }
      setSuccess(true)
      setTimeout(() => router.push(`/order/${order.publicId}`), 3000)
    } catch {
      setError('Ошибка соединения. Попробуйте ещё раз.')
      setLoading(false)
    }
  }

  const inp = (focused: boolean): React.CSSProperties => ({
    width: '100%', padding: '13px 16px', boxSizing: 'border-box',
    border: `1px solid ${focused ? '#FF2B4F' : '#2a1010'}`,
    background: '#0a0a0a', color: '#F2F2F2', fontSize: 14, outline: 'none',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'border-color 0.15s',
    borderRadius: 8,
  })

  const METHODS: { id: Method; icon: string; label: string }[] = [
    { id: 'card', icon: '💳', label: 'КАРТА' },
    { id: 'sbp', icon: '⚡', label: 'СБП' },
    { id: 'ymoney', icon: '🟡', label: 'ЮМАНИ' },
  ]

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%{left:-60%} 100%{left:140%} }
        .pay-input::placeholder { color: #333; }
        .pay-input:focus { border-color: #FF2B4F !important; }
        .pay-btn-shimmer:hover .shimmer-line { animation: shimmer 0.55s ease forwards; }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>

        {/* classified bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #3A1017', paddingBottom: 12, marginBottom: 28, flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#FF2B4F', boxShadow: '0 0 8px #FF2B4F', flexShrink: 0 }} />
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase' }}>
              ЗАЩИЩЁННЫЙ ПЛАТЁЖНЫЙ ШЛЮЗ — NATUX WORLD
            </span>
          </div>
          <Link href="/shop" style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
            color: '#555', textDecoration: 'none', letterSpacing: '0.2em',
            textTransform: 'uppercase', transition: 'color 0.2s',
          }}
            className="hover:text-site-accent transition-colors"
          >
            ← НАЗАД
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>

          {/* ═══ LEFT — order summary ═══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Rank card */}
            <div style={{
              backgroundColor: '#0e0e0e', border: '1px solid #3A1017',
              borderRadius: 14, padding: '22px 24px',
              clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, #FF2B4F, transparent)' }} />

              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 16 }}>
                ДЕТАЛИ ЗАКАЗА
              </div>

              {/* Rank row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 16, borderBottom: '1px solid #1a0808', marginBottom: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                  background: 'radial-gradient(circle at 35% 35%, #FF2B4Fcc, #FF2B4F55)',
                  boxShadow: '0 0 20px rgba(255,43,79,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                }}>⚔</div>
                <div>
                  <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 26, letterSpacing: '0.08em', color: '#fff', lineHeight: 1 }}>{order.productName}</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: '#666', marginTop: 3, letterSpacing: '0.1em' }}>{order.variantDurationLabel}</div>
                </div>
              </div>

              {/* Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'ИГРОК', value: order.username, mono: true },
                  { label: 'СРОК', value: order.variantDurationLabel },
                  ...(order.couponCode ? [{ label: 'ПРОМОКОД', value: order.couponCode, green: true }] : []),
                  ...(order.originalPrice && order.originalPrice !== order.price
                    ? [{ label: 'СКИДКА', value: `−${order.originalPrice - order.price} ₽`, green: true }]
                    : []),
                ].map(({ label, value, mono, green }: { label: string; value: string; mono?: boolean; green?: boolean }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#444', letterSpacing: '0.35em', textTransform: 'uppercase' }}>{label}</span>
                    <span style={{
                      fontFamily: mono ? '"Courier New", monospace' : '"JetBrains Mono", monospace',
                      fontSize: 12, fontWeight: 700,
                      color: green ? '#22c55e' : '#ccc',
                    }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div style={{
                background: 'rgba(255,43,79,0.07)', border: '1px solid rgba(255,43,79,0.2)',
                borderRadius: 10, padding: '14px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#666', letterSpacing: '0.4em', textTransform: 'uppercase' }}>К ОПЛАТЕ</span>
                <div style={{ textAlign: 'right' }}>
                  {order.originalPrice && order.originalPrice !== order.price && (
                    <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#444', textDecoration: 'line-through', marginBottom: 2 }}>{order.originalPrice} ₽</div>
                  )}
                  <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 34, color: '#FF2B4F', letterSpacing: '0.05em', lineHeight: 1 }}>{order.price} ₽</span>
                </div>
              </div>
            </div>

            {/* Security badges */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
            }}>
              {[
                { icon: '🔒', label: 'Защита SSL' },
                { icon: '⚡', label: 'Авто-выдача' },
                { icon: '↩', label: 'Гарантия' },
              ].map(b => (
                <div key={b.label} style={{
                  backgroundColor: '#0e0e0e', border: '1px solid #2a1010',
                  borderRadius: 8, padding: '10px 8px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{b.icon}</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: '#555', letterSpacing: '0.1em' }}>{b.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ RIGHT — payment form ═══ */}
          <div style={{
            backgroundColor: '#0e0e0e', border: '1px solid #3A1017',
            borderRadius: 14, padding: '24px',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* top accent */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, #FF2B4F60, transparent)' }} />

            {success ? (
              <SuccessScreen productName={order.productName} username={order.username} />
            ) : (
              <>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 18 }}>
                  СПОСОБ ОПЛАТЫ
                </div>

                {/* Method tabs */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
                  {METHODS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMethod(m.id)}
                      style={{
                        flex: 1, padding: '10px 4px', cursor: 'pointer',
                        fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                        letterSpacing: '0.2em', textTransform: 'uppercase',
                        border: `1px solid ${method === m.id ? '#FF2B4F' : '#2a1010'}`,
                        background: method === m.id ? 'rgba(255,43,79,0.1)' : '#0a0a0a',
                        color: method === m.id ? '#FF2B4F' : '#555',
                        borderRadius: 8, transition: 'all 0.15s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* ── Card form ── */}
                {method === 'card' && (
                  <>
                    <CardVisual number={cardNum} name={holder} expiry={expiry} cvv={cvv} flipped={flipped} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <Field label="Номер карты">
                        <input
                          className="pay-input"
                          style={inp(focusedField === 'num')}
                          placeholder="0000 0000 0000 0000"
                          value={cardNum}
                          onChange={e => setCardNum(fmtCard(e.target.value))}
                          onFocus={() => setFocusedField('num')}
                          onBlur={() => setFocusedField(null)}
                          maxLength={19} inputMode="numeric"
                        />
                      </Field>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="Срок действия">
                          <input
                            className="pay-input"
                            style={inp(focusedField === 'exp')}
                            placeholder="MM/YY"
                            value={expiry}
                            onChange={e => setExpiry(fmtExpiry(e.target.value))}
                            onFocus={() => setFocusedField('exp')}
                            onBlur={() => setFocusedField(null)}
                            maxLength={5} inputMode="numeric"
                          />
                        </Field>
                        <Field label="CVV / CVC">
                          <input
                            ref={cvvRef}
                            className="pay-input"
                            style={inp(focusedField === 'cvv')}
                            placeholder="•••"
                            value={cvv}
                            onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
                            onFocus={() => { setFocusedField('cvv'); setFlipped(true) }}
                            onBlur={() => { setFocusedField(null); setFlipped(false) }}
                            maxLength={3} inputMode="numeric" type="password"
                          />
                        </Field>
                      </div>

                      <Field label="Имя держателя">
                        <input
                          className="pay-input"
                          style={inp(focusedField === 'holder')}
                          placeholder="IVAN IVANOV"
                          value={holder}
                          onChange={e => setHolder(e.target.value.toUpperCase().replace(/[^A-Z\s]/g, ''))}
                          onFocus={() => setFocusedField('holder')}
                          onBlur={() => setFocusedField(null)}
                          maxLength={26}
                        />
                      </Field>
                    </div>

                    {error && (
                      <div style={{
                        margin: '14px 0 0', padding: '12px 16px',
                        background: 'rgba(255,43,79,0.08)', border: '1px solid rgba(255,43,79,0.25)',
                        borderRadius: 8,
                        fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#FF2B4F',
                      }}>
                        ⚠ {error}
                      </div>
                    )}

                    <div style={{ marginTop: 20 }}>
                      <PayButton loading={loading} onClick={handlePay} label={`ОПЛАТИТЬ ${order.price} ₽`} />
                      {!isCardValid && !loading && (
                        <p style={{ textAlign: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#333', marginTop: 8, letterSpacing: '0.2em' }}>
                          ЗАПОЛНИТЕ ВСЕ ПОЛЯ
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* ── SBP ── */}
                {method === 'sbp' && <SbpPanel onPay={handlePay} loading={loading} />}

                {/* ── YMoney ── */}
                {method === 'ymoney' && (
                  <YMoneyPanel
                    order={order}
                    loading={loading}
                    setLoading={setLoading}
                    setError={setError}
                  />
                )}

                {/* Card logos */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 20, paddingTop: 16, borderTop: '1px solid #1a0808' }}>
                  {['VISA', 'MC', 'МИР', 'SBP'].map(logo => (
                    <span key={logo} style={{
                      fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                      color: '#2a2a2a', letterSpacing: '0.1em', fontWeight: 700,
                    }}>{logo}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
