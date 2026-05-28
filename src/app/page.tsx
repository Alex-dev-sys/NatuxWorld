'use client'

import Link from 'next/link'
import { useState } from 'react'
import ServerStatus from '@/components/ServerStatus'
import TopDonors from '@/components/TopDonors'

function CopyIPButton() {
  const [copied, setCopied] = useState(false)
  const ip = 'mc.natuxworld.ru'

  const copy = () => {
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 px-4 py-2 bg-site-block border border-site-border rounded hover:border-site-accent transition-colors text-sm text-site-muted hover:text-site-text"
    >
      <span className="font-mono text-site-accent">{ip}</span>
      {copied ? (
        <svg className="w-4 h-4 text-site-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
      <span className="text-xs">{copied ? 'Скопировано!' : 'Скопировать IP'}</span>
    </button>
  )
}

const features = [
  { icon: '⚔️', title: 'Хардкор PvP', desc: 'Без правил, без жалости. Чистый анархичный PvP на выживание.' },
  { icon: '🏰', title: 'Свобода', desc: 'Строй где хочешь. Рейды, ловушки, альянсы — ты сам решаешь.' },
  { icon: '👑', title: '15 рангов', desc: 'От Baron до God. Каждый ранг — уникальные привилегии.' },
  { icon: '🌐', title: 'Комьюнити', desc: 'Живое сообщество в VK. Турниры, события, новости.' },
]

const stats = [
  { value: '15', label: 'рангов' },
  { value: '24/7', label: 'онлайн' },
  { value: '1.20+', label: 'версия' },
  { value: '100+', label: 'игроков' },
]

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-site-secondary to-site-bg" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg,transparent,transparent 31px,#FF2B4F 31px,#FF2B4F 32px),repeating-linear-gradient(90deg,transparent,transparent 31px,#FF2B4F 31px,#FF2B4F 32px)',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-32 text-center animate-fade-in-up">
          <div className="inline-flex mb-6">
            <ServerStatus />
          </div>

          <h1 className="font-pixel text-3xl md:text-5xl lg:text-6xl text-white mb-4 text-glow-red leading-tight">
            NATUX<br />
            <span className="text-site-accent">WORLD</span>
          </h1>

          <p className="text-site-muted text-lg md:text-xl mb-8 max-w-xl mx-auto">
            Анархичный Minecraft без правил и ограничений.<br />
            Выживи. Победи. Стань легендой.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <Link
              href="/shop"
              className="px-8 py-3 bg-site-accent hover:bg-red-600 text-white font-bold rounded transition-colors glow-red text-base"
            >
              Получить привилегию →
            </Link>
            <Link
              href="/join"
              className="px-8 py-3 border border-site-border hover:border-site-accent text-site-text hover:text-site-accent font-semibold rounded transition-colors text-base"
            >
              Как подключиться
            </Link>
          </div>

          <CopyIPButton />
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-site-border bg-site-block">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {stats.map(s => (
              <div key={s.label}>
                <div className="font-pixel text-xl md:text-2xl text-site-accent">{s.value}</div>
                <div className="text-site-muted text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <h2 className="font-pixel text-xs md:text-sm text-site-accent text-center mb-10">
          ПОЧЕМУ NATUX WORLD?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map(f => (
            <div
              key={f.title}
              className="bg-site-block border border-site-border rounded-lg p-5 hover:border-site-accent transition-colors group"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-site-text font-semibold mb-2 group-hover:text-site-accent transition-colors">
                {f.title}
              </h3>
              <p className="text-site-muted text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Top donors */}
      <div className="border-t border-site-border">
        <TopDonors />
      </div>

      {/* CTA */}
      <section className="bg-site-secondary border-t border-site-border">
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <h2 className="font-pixel text-xs md:text-sm text-white mb-4">ГОТОВ НАЧАТЬ?</h2>
          <p className="text-site-muted mb-8 max-w-lg mx-auto text-sm">
            15 рангов, промокоды, автовыдача. Оплата — и привилегии у тебя через минуту.
          </p>
          <Link
            href="/shop"
            className="inline-block px-10 py-4 bg-site-accent hover:bg-red-600 text-white font-bold rounded transition-colors glow-red-lg"
          >
            Присоединиться к NATUX WORLD →
          </Link>
        </div>
      </section>
    </div>
  )
}
