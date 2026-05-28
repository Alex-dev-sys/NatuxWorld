'use client'

import Link from 'next/link'
import { useState } from 'react'
import ServerStatus from '@/components/ServerStatus'

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
      <span>{copied ? 'Скопировано!' : 'Скопировать'}</span>
    </button>
  )
}

const features = [
  { icon: '⚔️', title: 'Хардкор PvP', desc: 'Без правил, без жалости. Чистый анархичный PvP на выживание.' },
  { icon: '🏰', title: 'Свобода строительства', desc: 'Строй где хочешь. Никаких зон мира, только рейды и приключения.' },
  { icon: '👑', title: 'Донат без p2w', desc: 'Привилегии дают комфорт, но не превосходство в бою.' },
  { icon: '🌐', title: 'Комьюнити', desc: 'Живое сообщество в Discord и VK. Турниры, события, новости.' },
]

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-site-secondary to-site-bg" />
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 31px, #FF2B4F 31px, #FF2B4F 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, #FF2B4F 31px, #FF2B4F 32px)' }}
        />

        <div className="relative max-w-7xl mx-auto px-4 py-24 md:py-36 text-center">
          <div className="inline-block mb-6">
            <ServerStatus />
          </div>

          <h1 className="font-pixel text-2xl md:text-4xl lg:text-5xl text-white mb-4 text-glow-red leading-tight">
            NATUX<br />
            <span className="text-site-accent">WORLD</span>
          </h1>

          <p className="text-site-muted text-lg md:text-xl mb-8 max-w-2xl mx-auto">
            Анархичный Minecraft-сервер без правил и ограничений.<br />
            Выживи. Победи. Стань легендой.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link
              href="/shop"
              className="px-8 py-3 bg-site-accent hover:bg-red-600 text-white font-bold rounded transition-colors glow-red text-base"
            >
              Купить привилегию
            </Link>
            <Link
              href="/join"
              className="px-8 py-3 bg-transparent border border-site-border hover:border-site-accent text-site-text hover:text-site-accent font-semibold rounded transition-colors text-base"
            >
              Как подключиться
            </Link>
          </div>

          <CopyIPButton />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <h2 className="font-pixel text-sm md:text-base text-site-accent text-center mb-12">
          ПОЧЕМУ NATUX WORLD?
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(f => (
            <div
              key={f.title}
              className="bg-site-block border border-site-border rounded-lg p-6 hover:border-site-accent transition-colors group"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-site-text font-semibold mb-2 group-hover:text-site-accent transition-colors">
                {f.title}
              </h3>
              <p className="text-site-muted text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-site-secondary border-y border-site-border">
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <h2 className="font-pixel text-sm md:text-base text-white mb-4">
            ГОТОВ НАЧАТЬ?
          </h2>
          <p className="text-site-muted mb-8 max-w-lg mx-auto">
            Выбери свой ранг, оплати и получи привилегии автоматически.
          </p>
          <Link
            href="/shop"
            className="inline-block px-10 py-4 bg-site-accent hover:bg-red-600 text-white font-bold rounded transition-colors glow-red-lg text-base"
          >
            Открыть магазин
          </Link>
        </div>
      </section>
    </div>
  )
}
