'use client'

import { useState } from 'react'
import ServerStatus from '@/components/ServerStatus'

const IP = 'mc.natuxworld.ru'

const STEPS = [
  {
    n: '01',
    icon: '☕',
    title: 'УСТАНОВИ JAVA',
    subtitle: 'RUNTIME ENVIRONMENT',
    desc: 'Скачай Java 17+ с официального сайта adoptium.net. Нужна для запуска Minecraft Java Edition.',
    note: 'Java 17 или новее',
  },
  {
    n: '02',
    icon: '🎮',
    title: 'ЗАПУСТИ MINECRAFT',
    subtitle: 'JAVA EDITION',
    desc: 'Запусти лаунчер Minecraft или TLauncher. Выбери версию 1.20.1 или выше. Лицензия не обязательна.',
    note: 'Версии 1.20.1 – 1.21.x',
  },
  {
    n: '03',
    icon: '🌐',
    title: 'ДОБАВЬ СЕРВЕР',
    subtitle: 'МУЛЬТИПЛЕЕР → ДОБАВИТЬ',
    desc: 'Открой «Мультиплеер» → «Добавить сервер». Вставь IP-адрес в поле «Адрес сервера».',
    note: 'mc.natuxworld.ru',
  },
  {
    n: '04',
    icon: '⚔️',
    title: 'В БОЙ',
    subtitle: 'ОПЕРАЦИЯ НАЧАТА',
    desc: 'Подключись к серверу и начни операцию. Новичкам выдаётся стартовый набор. Удачи, оперативник.',
    note: 'Спавн защищён 30 сек.',
  },
]

export default function JoinPage() {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(IP).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div style={{ width: 3, height: 28, backgroundColor: '#FF2B4F', borderRadius: 2, flexShrink: 0 }} />
          <h1
            style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 'clamp(36px, 8vw, 64px)',
              letterSpacing: '0.08em', lineHeight: 1, color: '#fff',
            }}
          >
            КАК ПОДКЛЮЧИТЬСЯ
          </h1>
        </div>
        <p style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
          color: '#444', letterSpacing: '0.4em', textTransform: 'uppercase', marginLeft: 15,
        }}>
          ИНСТРУКЦИЯ ПО ВСТУПЛЕНИЮ В ОПЕРАЦИЮ
        </p>
      </div>

      {/* Server info card */}
      <div style={{
        backgroundColor: '#0e0e0e', border: '1px solid #3A1017',
        borderRadius: 12, padding: '24px 28px', marginBottom: 32,
        position: 'relative', overflow: 'hidden',
        clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))',
      }}>
        {/* Subtle glow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, #FF2B4F60, transparent)',
        }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 20, marginBottom: 20 }}>
          {[
            { label: 'IP СЕРВЕРА', value: IP, accent: true },
            { label: 'ВЕРСИЯ', value: '1.20.1 – 1.21.x', accent: false },
            { label: 'РЕЖИМ', value: 'АНАРХИЯ / PVP', accent: false },
          ].map(item => (
            <div key={item.label}>
              <div style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                color: '#444', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 6,
              }}>{item.label}</div>
              <div style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 13,
                fontWeight: 700, color: item.accent ? '#FF2B4F' : '#ccc',
              }}>{item.value}</div>
            </div>
          ))}
          <div>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
              color: '#444', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 6,
            }}>СТАТУС</div>
            <ServerStatus compact />
          </div>
        </div>

        {/* Copy IP button */}
        <button
          onClick={copy}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '12px 20px', cursor: 'pointer', transition: 'all 0.2s ease',
            fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.25em',
            textTransform: 'uppercase',
            backgroundColor: copied ? '#22c55e18' : '#0a0a0a',
            border: `1px solid ${copied ? '#22c55e60' : '#3A1017'}`,
            color: copied ? '#22c55e' : '#666',
            borderRadius: 8,
          }}
          onMouseEnter={e => { if (!copied) { (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F'; (e.currentTarget as HTMLElement).style.color = '#FF2B4F' } }}
          onMouseLeave={e => { if (!copied) { (e.currentTarget as HTMLElement).style.borderColor = '#3A1017'; (e.currentTarget as HTMLElement).style.color = '#666' } }}
        >
          {copied ? (
            <>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              СКОПИРОВАНО
            </>
          ) : (
            <>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              СКОПИРОВАТЬ IP · mc.natuxworld.ru
            </>
          )}
        </button>
      </div>

      {/* Steps */}
      <div style={{ position: 'relative' }}>
        {/* Connector line (desktop) */}
        <div className="hidden md:block" style={{
          position: 'absolute', top: 32, left: 32, right: 32, height: 1,
          background: 'linear-gradient(90deg, #FF2B4F, #3A1017 50%, transparent)',
          zIndex: 0,
        }} />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16, position: 'relative', zIndex: 1,
        }}>
          {STEPS.map((step) => (
            <div
              key={step.n}
              style={{
                backgroundColor: '#0e0e0e', border: '1px solid #3A1017',
                borderRadius: 12, padding: '20px 18px',
                transition: 'border-color 0.2s, transform 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F50'
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#3A1017'
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
              }}
            >
              {/* Step number + icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  backgroundColor: '#1a0808', border: '1px solid #FF2B4F50',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 18,
                }}>
                  {step.icon}
                </div>
                <div style={{
                  fontFamily: '"Bebas Neue", sans-serif', fontSize: 28,
                  color: '#3A1017', letterSpacing: '0.05em',
                }}>
                  {step.n}
                </div>
              </div>

              {/* Subtitle */}
              <div style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 8,
                color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 4,
              }}>{step.subtitle}</div>

              {/* Title */}
              <div style={{
                fontFamily: '"Bebas Neue", sans-serif', fontSize: 20,
                letterSpacing: '0.06em', color: '#fff', marginBottom: 8,
              }}>{step.title}</div>

              {/* Separator */}
              <div style={{ width: 28, height: 1, backgroundColor: '#FF2B4F', marginBottom: 10 }} />

              {/* Desc */}
              <p style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
                color: '#888', lineHeight: 1.7, marginBottom: 12,
              }}>{step.desc}</p>

              {/* Note badge */}
              <span style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                color: '#555', backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a',
                padding: '3px 10px', borderRadius: 20, letterSpacing: '0.05em',
              }}>{step.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Versions & social */}
      <div style={{
        marginTop: 32, display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16,
      }}>
        {/* Versions */}
        <div style={{
          backgroundColor: '#0e0e0e', border: '1px solid #3A1017',
          borderRadius: 10, padding: '18px 20px',
        }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
            color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 12,
          }}>
            СОВМЕСТИМЫЕ ВЕРСИИ
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['1.20.1', '1.20.2', '1.20.4', '1.20.6', '1.21', '1.21.1', '1.21.4'].map(v => (
              <span key={v} style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
                color: '#ccc', backgroundColor: '#1a1a1a',
                border: '1px solid #2a2a2a', padding: '4px 12px', borderRadius: 4,
              }}>{v}</span>
            ))}
          </div>
        </div>

        {/* Social */}
        <div style={{
          backgroundColor: '#0e0e0e', border: '1px solid #3A1017',
          borderRadius: 10, padding: '18px 20px',
        }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
            color: '#FF2B4F', letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 12,
          }}>
            ПОДДЕРЖКА
          </div>
          <p style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#666',
            lineHeight: 1.6, marginBottom: 12,
          }}>
            Есть вопросы? Пишите нам — поможем в течение нескольких часов.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <a
              href="https://vk.com/natuxworld"
              target="_blank" rel="noopener noreferrer"
              style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
                letterSpacing: '0.2em', color: '#888', textTransform: 'uppercase',
                border: '1px solid #3A1017', padding: '8px 18px', borderRadius: 6,
                textDecoration: 'none', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#FF2B4F'; (e.currentTarget as HTMLElement).style.color = '#FF2B4F' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A1017'; (e.currentTarget as HTMLElement).style.color = '#888' }}
            >
              VK
            </a>
            <a
              href="https://discord.gg/natuxworld"
              target="_blank" rel="noopener noreferrer"
              style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
                letterSpacing: '0.2em', color: '#888', textTransform: 'uppercase',
                border: '1px solid #3A1017', padding: '8px 18px', borderRadius: 6,
                textDecoration: 'none', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#5865F2'; (e.currentTarget as HTMLElement).style.color = '#5865F2' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A1017'; (e.currentTarget as HTMLElement).style.color = '#888' }}
            >
              DISCORD
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
