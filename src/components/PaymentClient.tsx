'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Order } from '@/lib/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

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
  if (n.startsWith('5') || n.startsWith('2221') || (n >= '2221' && n <= '2720')) return 'mc'
  if (n.startsWith('2')) return 'mir'
  return null
}

function CardLogo({ type }: { type: 'visa' | 'mc' | 'mir' | null }) {
  if (type === 'visa') return (
    <span style={{ fontFamily: 'serif', fontStyle: 'italic', fontWeight: 900, fontSize: 18, color: '#fff', letterSpacing: -1 }}>VISA</span>
  )
  if (type === 'mc') return (
    <svg width="38" height="24" viewBox="0 0 38 24">
      <circle cx="15" cy="12" r="11" fill="#EB001B" />
      <circle cx="23" cy="12" r="11" fill="#F79E1B" />
      <path d="M19 4.8a11 11 0 0 1 0 14.4A11 11 0 0 1 19 4.8z" fill="#FF5F00" />
    </svg>
  )
  if (type === 'mir') return (
    <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: 0.5, background: 'linear-gradient(90deg,#00b4d8,#0077b6)', padding: '2px 6px', borderRadius: 4 }}>МИР</span>
  )
  return null
}

// ─── animated card visual ────────────────────────────────────────────────────

function CardVisual({ number, name, expiry, cvv, flipped }: {
  number: string; name: string; expiry: string; cvv: string; flipped: boolean
}) {
  const type = cardType(number)
  const displayNum = number.padEnd(19, ' ').replace(/ /g, (_, i) => [4, 9, 14].includes(i) ? ' ' : '•')
  const filled = number.replace(/\s/g, '')
  const masked = filled.slice(0, 4).padEnd(4, '•') + ' •••• •••• ' + (filled.slice(12) || '••••')

  return (
    <div style={{ perspective: 800, height: 200, marginBottom: 28 }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        transformStyle: 'preserve-3d',
        transition: 'transform 0.5s ease',
        transform: flipped ? 'rotateY(180deg)' : 'none',
      }}>
        {/* Front */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 16,
          background: 'linear-gradient(135deg, #1a0b0b 0%, #2d0a14 50%, #1a0b0b 100%)',
          border: '1px solid #3A1017', padding: '24px 28px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          boxShadow: '0 20px 60px rgba(255,43,79,0.15)',
          overflow: 'hidden',
        }}>
          {/* Background glow */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,43,79,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Chip */}
            <div style={{ width: 42, height: 32, borderRadius: 5, background: 'linear-gradient(135deg, #d4a843, #f0d060, #b8882a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 28, height: 20, border: '1px solid rgba(0,0,0,0.3)', borderRadius: 3, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, padding: 3 }}>
                {[0,1,2,3].map(i => <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 1 }} />)}
              </div>
            </div>
            <CardLogo type={type} />
          </div>

          {/* Number */}
          <div style={{ fontFamily: 'monospace', fontSize: 20, letterSpacing: 3, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            {masked}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3, letterSpacing: 1, textTransform: 'uppercase' }}>Держатель</div>
              <div style={{ fontSize: 14, color: '#fff', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'monospace' }}>
                {name || 'IVAN IVANOV'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3, letterSpacing: 1, textTransform: 'uppercase' }}>Срок</div>
              <div style={{ fontSize: 14, color: '#fff', fontFamily: 'monospace' }}>{expiry || 'MM/YY'}</div>
            </div>
          </div>
        </div>

        {/* Back */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 16,
          background: 'linear-gradient(135deg, #1a0b0b 0%, #2d0a14 100%)',
          border: '1px solid #3A1017',
          transform: 'rotateY(180deg)',
          overflow: 'hidden',
        }}>
          <div style={{ height: 48, background: '#000', margin: '28px 0 20px' }} />
          <div style={{ padding: '0 28px' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 6, letterSpacing: 1 }}>CVV</div>
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ fontFamily: 'monospace', color: '#fff', letterSpacing: 4, fontSize: 16 }}>
                {cvv ? cvv.replace(/./g, '•') : '•••'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── payment methods ──────────────────────────────────────────────────────────

type Method = 'card' | 'sbp' | 'ymoney'

function MethodTab({ id, active, label, icon, onClick }: {
  id: Method; active: boolean; label: string; icon: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '10px 6px', borderRadius: 10, border: `1.5px solid ${active ? '#FF2B4F' : '#3A1017'}`,
        background: active ? 'rgba(255,43,79,0.08)' : '#111111',
        color: active ? '#FF2B4F' : '#9CA3AF',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      {label}
    </button>
  )
}

// ─── sbp mock ────────────────────────────────────────────────────────────────

function SbpPanel({ onPay, loading }: { onPay: () => void; loading: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>
        Отсканируй QR-код в приложении банка
      </div>
      {/* QR placeholder */}
      <div style={{ width: 160, height: 160, margin: '0 auto 20px', background: '#fff', borderRadius: 12, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(11,1fr)', gap: 2 }}>
        {Array.from({ length: 121 }).map((_, i) => {
          const corner = [0,1,2,3,4,11,12,13,14,15,22,33,44,55,66,77,88,99,110,116,117,118,119,120,109,98,87,76,65].includes(i)
          const dot = Math.sin(i * 7.3 + 13) > 0.1
          return <div key={i} style={{ background: (corner || dot) ? '#111' : 'transparent', borderRadius: 1 }} />
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#00c2ff,#00ff9d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚡</div>
        <span style={{ fontSize: 12, color: '#6B7280' }}>Система Быстрых Платежей</span>
      </div>
      <PayButton loading={loading} onClick={onPay} label="Подтвердить оплату" />
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
        width: '100%', padding: '15px 0', borderRadius: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
        background: loading ? '#3A1017' : 'linear-gradient(135deg, #FF2B4F, #cc1f3a)',
        color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: 0.5,
        boxShadow: loading ? 'none' : '0 4px 20px rgba(255,43,79,0.35)',
        transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      {loading ? (
        <>
          <svg className="animate-spin" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24">
            <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Обрабатываем...
        </>
      ) : label}
    </button>
  )
}

// ─── success overlay ──────────────────────────────────────────────────────────

function SuccessScreen({ productName, username }: { productName: string; username: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 72, marginBottom: 16, animation: 'pop 0.4s ease' }}>✅</div>
      <h2 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 14, color: '#35C759', marginBottom: 12 }}>
        ОПЛАТА ПРОШЛА!
      </h2>
      <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 8 }}>
        Ранг <span style={{ color: '#F2F2F2', fontWeight: 600 }}>{productName}</span> выдаётся игроку
      </p>
      <p style={{ color: '#F2F2F2', fontFamily: 'monospace', fontSize: 16, fontWeight: 700, marginBottom: 32 }}>
        {username}
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#35C759', fontSize: 13 }}>
          <span>✓</span> Оплата подтверждена
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#35C759', fontSize: 13 }}>
          <span>✓</span> Донат выдаётся
        </div>
      </div>
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────

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
      if (!res.ok) { setError(data.error ?? 'Ошибка оплаты'); return }
      setSuccess(true)
      setTimeout(() => router.push(`/order/${order.publicId}`), 2800)
    } catch {
      setError('Ошибка соединения')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (focused = false): React.CSSProperties => ({
    width: '100%', padding: '13px 16px', borderRadius: 10,
    border: `1.5px solid ${focused ? '#FF2B4F' : '#3A1017'}`,
    background: '#0d0d0d', color: '#F2F2F2', fontSize: 15, outline: 'none',
    fontFamily: 'monospace', transition: 'border-color 0.15s', boxSizing: 'border-box',
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 6, display: 'block',
  }

  return (
    <>
      <style>{`
        @keyframes pop { 0%{transform:scale(0)} 70%{transform:scale(1.15)} 100%{transform:scale(1)} }
        input::placeholder { color: #4B5563; }
        input:focus { border-color: #FF2B4F !important; }
      `}</style>

      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px' }}>
        <div style={{ width: '100%', maxWidth: 880, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>

          {/* ── Left: order summary ── */}
          <div>
            <a href="/shop" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6B7280', fontSize: 13, marginBottom: 24, textDecoration: 'none' }}
              className="hover:text-site-text transition-colors">
              ← Назад в магазин
            </a>

            <div style={{ background: '#111111', border: '1px solid #3A1017', borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 20 }}>Ваш заказ</h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #3A1017' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: '#FF2B4F', boxShadow: '0 0 20px rgba(255,43,79,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  ⚔
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: '#F2F2F2', marginBottom: 2 }}>{order.productName}</div>
                  <div style={{ color: '#6B7280', fontSize: 13 }}>{order.variantDurationLabel}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Игрок', value: order.username, mono: true },
                  { label: 'Срок', value: order.variantDurationLabel },
                  ...(order.couponCode ? [{ label: 'Промокод', value: order.couponCode, green: true }] : []),
                ].map(({ label, value, mono, green }: { label: string; value: string; mono?: boolean; green?: boolean }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#6B7280' }}>{label}</span>
                    <span style={{ color: green ? '#35C759' : '#F2F2F2', fontFamily: mono ? 'monospace' : 'inherit', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}

                {order.originalPrice && order.originalPrice !== order.price && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#6B7280' }}>Скидка</span>
                    <span style={{ color: '#35C759' }}>−{order.originalPrice - order.price} ₽</span>
                  </div>
                )}
              </div>

              <div style={{ background: 'rgba(255,43,79,0.06)', border: '1px solid rgba(255,43,79,0.2)', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#9CA3AF', fontSize: 13 }}>К оплате</span>
                <div style={{ textAlign: 'right' }}>
                  {order.originalPrice && order.originalPrice !== order.price && (
                    <div style={{ color: '#6B7280', fontSize: 12, textDecoration: 'line-through' }}>{order.originalPrice} ₽</div>
                  )}
                  <span style={{ fontSize: 28, fontWeight: 800, color: '#FF2B4F' }}>{order.price} ₽</span>
                </div>
              </div>

              {/* Security badges */}
              <div style={{ display: 'flex', gap: 16, marginTop: 20, paddingTop: 20, borderTop: '1px solid #3A1017' }}>
                {[['🔒', 'Защищённая оплата'], ['⚡', 'Мгновенная выдача'], ['↩', 'Гарантия возврата']].map(([icon, text]) => (
                  <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6B7280' }}>
                    <span>{icon}</span>{text}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: payment form ── */}
          <div style={{ background: '#111111', border: '1px solid #3A1017', borderRadius: 16, padding: 28 }}>
            {success ? (
              <SuccessScreen productName={order.productName} username={order.username} />
            ) : (
              <>
                <h2 style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 20 }}>Способ оплаты</h2>

                {/* Method tabs */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                  <MethodTab id="card" active={method === 'card'} label="Карта" icon="💳" onClick={() => setMethod('card')} />
                  <MethodTab id="sbp" active={method === 'sbp'} label="СБП" icon="⚡" onClick={() => setMethod('sbp')} />
                  <MethodTab id="ymoney" active={method === 'ymoney'} label="ЮMoney" icon="🟡" onClick={() => setMethod('ymoney')} />
                </div>

                {method === 'card' && (
                  <>
                    <CardVisual number={cardNum} name={holder} expiry={expiry} cvv={cvv} flipped={flipped} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <label style={labelStyle}>Номер карты</label>
                        <input
                          style={inputStyle()}
                          placeholder="0000 0000 0000 0000"
                          value={cardNum}
                          onChange={e => setCardNum(fmtCard(e.target.value))}
                          maxLength={19}
                          inputMode="numeric"
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={labelStyle}>Срок действия</label>
                          <input
                            style={inputStyle()}
                            placeholder="MM/YY"
                            value={expiry}
                            onChange={e => setExpiry(fmtExpiry(e.target.value))}
                            maxLength={5}
                            inputMode="numeric"
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>CVV</label>
                          <input
                            ref={cvvRef}
                            style={inputStyle()}
                            placeholder="•••"
                            value={cvv}
                            onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
                            onFocus={() => setFlipped(true)}
                            onBlur={() => setFlipped(false)}
                            maxLength={3}
                            inputMode="numeric"
                            type="password"
                          />
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>Имя держателя</label>
                        <input
                          style={inputStyle()}
                          placeholder="IVAN IVANOV"
                          value={holder}
                          onChange={e => setHolder(e.target.value.toUpperCase().replace(/[^A-Z\s]/g, ''))}
                          maxLength={26}
                        />
                      </div>
                    </div>

                    {error && (
                      <div style={{ margin: '14px 0', padding: '12px 16px', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 10, color: '#FF3B30', fontSize: 13 }}>
                        {error}
                      </div>
                    )}

                    <div style={{ marginTop: 20 }}>
                      <PayButton
                        loading={loading}
                        onClick={handlePay}
                        label={`Оплатить ${order.price} ₽`}
                      />
                      {!isCardValid && !loading && (
                        <p style={{ textAlign: 'center', fontSize: 11, color: '#4B5563', marginTop: 8 }}>Заполните все поля карты</p>
                      )}
                    </div>
                  </>
                )}

                {method === 'sbp' && <SbpPanel onPay={handlePay} loading={loading} />}

                {method === 'ymoney' && (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: 52, marginBottom: 12 }}>🟡</div>
                    <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 24 }}>Вы будете перенаправлены на сайт ЮMoney для подтверждения платежа</p>
                    <PayButton loading={loading} onClick={handlePay} label={`Перейти к оплате ${order.price} ₽`} />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 20, paddingTop: 20, borderTop: '1px solid #1f1f1f' }}>
                  <img src="https://upload.wikimedia.org/wikipedia/commons/0/04/Visa.svg" alt="Visa" style={{ height: 20, opacity: 0.4, filter: 'grayscale(1)' }} />
                  <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="MC" style={{ height: 20, opacity: 0.4, filter: 'grayscale(1)' }} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
