'use client'

import Link from 'next/link'
import { useState } from 'react'
import ServerStatus from '@/components/ServerStatus'
import TopDonors from '@/components/TopDonors'
import HeroParticles from '@/components/HeroParticles'

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
      className="group flex items-center gap-3 px-5 py-2.5 bg-[#0d0d0d] border border-[#3A1017] hover:border-site-accent transition-all duration-200 clip-angle-sm"
    >
      <span className="text-[10px] text-site-muted uppercase tracking-widest" style={{ fontFamily: '"JetBrains Mono", monospace' }}>IP://</span>
      <span className="font-mono text-site-accent text-sm tracking-wider" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{ip}</span>
      {copied ? (
        <svg className="w-3.5 h-3.5 text-site-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-site-muted group-hover:text-site-accent transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
      <span className="text-[10px] text-site-muted group-hover:text-site-accent transition-colors uppercase tracking-wider" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        {copied ? 'СКОПИРОВАНО' : 'СКОПИРОВАТЬ'}
      </span>
    </button>
  )
}

const features = [
  {
    code: 'OBJ-01',
    title: 'ХАРДКОР PVP',
    desc: 'Без правил, без жалости. Чистый анархичный PvP на выживание. Только сильнейшие остаются.',
    tag: 'COMBAT',
  },
  {
    code: 'OBJ-02',
    title: 'ПОЛНАЯ СВОБОДА',
    desc: 'Строй где хочешь. Рейды, ловушки, альянсы — ты сам решаешь свою тактику.',
    tag: 'FREEDOM',
  },
  {
    code: 'OBJ-03',
    title: '15 УРОВНЕЙ ДОПУСКА',
    desc: 'От Baron до God. Каждый ранг — военный допуск к уникальным возможностям.',
    tag: 'CLEARANCE',
  },
  {
    code: 'OBJ-04',
    title: 'ЖИВОЕ КОМЬЮНИТИ',
    desc: 'Активное сообщество. Турниры, события, оперативные новости в реальном времени.',
    tag: 'INTEL',
  },
]

const stats = [
  { value: '15', label: 'УРОВНЕЙ ДОПУСКА', sub: 'RANKS' },
  { value: '24/7', label: 'ОНЛАЙН', sub: 'UPTIME' },
  { value: '1.20+', label: 'ВЕРСИЯ', sub: 'BUILD' },
  { value: '100+', label: 'ОПЕРАТИВНИКОВ', sub: 'ACTIVE' },
]

const GALLERY = [
  { title: 'ОПЕРАЦИЯ РАССВЕТ', coord: 'X:1247 Z:-883', bg: 'linear-gradient(135deg, #FF2B4F33, #8B0000, #1a0000)' },
  { title: 'КРЕПОСТЬ АЛЬФА', coord: 'X:-3341 Z:220', bg: 'linear-gradient(135deg, #1a2a4a, #0a1a3a, #001133)' },
  { title: 'ЛЕСНОЙ ФОРПОСТ', coord: 'X:567 Z:4129', bg: 'linear-gradient(135deg, #0d2b1a, #1a4a2a, #0a1f10)' },
  { title: 'ПОДЗЕМНЫЙ БУНКЕР', coord: 'X:-892 Z:-1541', bg: 'linear-gradient(135deg, #2a1a4a, #1a0a3a, #0d0020)' },
  { title: 'ОГНЕННЫЙ РУБЕЖ', coord: 'X:4401 Z:88', bg: 'linear-gradient(135deg, #4a1a00, #8B3000, #2a1000)' },
  { title: 'АРЕНА СМЕРТИ', coord: 'X:0 Z:0', bg: 'linear-gradient(135deg, #1a0808, #3A1017, #0a0000)' },
]

function GallerySection() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-20">
      <div className="flex items-center gap-4 mb-12">
        <div className="flex flex-col gap-1">
          <div
            className="font-display text-4xl md:text-5xl text-white"
            style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em' }}
          >
            АРХИВ ОПЕРАЦИЙ
          </div>
          <div
            className="text-[10px] text-site-muted tracking-[0.5em] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            ЗАДОКУМЕНТИРОВАННЫЕ МИССИИ
          </div>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-[#3A1017] to-transparent hidden md:block" />
        <span
          className="text-[9px] text-site-accent border border-site-accent/30 px-3 py-1 tracking-[0.3em] uppercase"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          ЗАСЕКРЕЧЕНО
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {GALLERY.map((item, i) => (
          <GalleryCard key={i} {...item} />
        ))}
      </div>
    </section>
  )
}

function GalleryCard({ title, coord, bg }: { title: string; coord: string; bg: string }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      style={{
        position: 'relative', aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden',
        border: '1px solid #3A1017', cursor: 'pointer',
        background: bg,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hov ? 'scale(1.02)' : 'scale(1)',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Noise texture effect */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
        pointerEvents: 'none',
      }} />
      {/* Corner bracket TL */}
      <div style={{ position: 'absolute', top: 8, left: 8, width: 12, height: 12, borderLeft: '1.5px solid #FF2B4F60', borderTop: '1.5px solid #FF2B4F60' }} />
      {/* Corner bracket BR */}
      <div style={{ position: 'absolute', bottom: 8, right: 8, width: 12, height: 12, borderRight: '1.5px solid #FF2B4F60', borderBottom: '1.5px solid #FF2B4F60' }} />

      {/* Normal state info */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '16px 14px 12px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
        opacity: hov ? 0 : 1, transition: 'opacity 0.2s',
      }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#FF2B4F', letterSpacing: '0.3em', marginBottom: 3 }}>{coord}</div>
        <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 16, color: '#fff', letterSpacing: '0.08em' }}>{title}</div>
      </div>

      {/* Hover overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.75)',
        opacity: hov ? 1 : 0, transition: 'opacity 0.2s',
      }}>
        <div style={{
          border: '2px solid #FF2B4F80', padding: '8px 18px',
          transform: 'rotate(-6deg)',
        }}>
          <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, color: '#FF2B4F', letterSpacing: '0.15em' }}>ЗАСЕКРЕЧЕНО</span>
        </div>
        <div style={{
          marginTop: 10, fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
          color: '#666', letterSpacing: '0.3em', textTransform: 'uppercase',
        }}>ДОСТУП ОГРАНИЧЕН</div>
      </div>
    </div>
  )
}

const FAQ_ITEMS = [
  {
    q: 'Как подключиться к серверу?',
    a: 'Открой Minecraft Java Edition → Мультиплеер → Добавить сервер → введи mc.natuxworld.ru. Работает с версий 1.20.1 и выше. Лицензия не обязательна.',
  },
  {
    q: 'Как применить купленный ранг?',
    a: 'Ранг выдаётся автоматически в течение 1-2 минут после оплаты через систему LuckPerms. Зайди на сервер под тем ником, который указал при покупке.',
  },
  {
    q: 'Как активировать промокод?',
    a: 'На странице магазина нажми "Применить промокод" под выбором ранга, введи код и нажми "Проверить". Скидка применится автоматически. Текущий промокод SUMMER25 даёт −25%.',
  },
  {
    q: 'Какие версии Minecraft поддерживаются?',
    a: 'Сервер работает на Java Edition 1.20.4 и совместим с клиентами от 1.20.1 до 1.21.x. Bedrock Edition (PE/мобилки) не поддерживается.',
  },
  {
    q: 'Можно ли использовать TLauncher?',
    a: 'Да, TLauncher и другие лицензионные и нелицензионные лаунчеры поддерживаются. Единственное ограничение — ник должен быть уникальным и не совпадать с другим игроком.',
  },
  {
    q: 'Возможен ли возврат средств?',
    a: 'Возврат возможен только при технической ошибке выдачи привилегии (не получил ранг после оплаты). Обратись в поддержку с номером заказа. "Не понравилось" — не основание для возврата.',
  },
]

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="max-w-3xl mx-auto px-4 py-16 border-t border-[#3A1017]">
      <div className="flex items-center gap-4 mb-10">
        <div className="flex flex-col gap-1">
          <div
            className="font-display text-4xl md:text-5xl text-white"
            style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em' }}
          >
            БРИФИНГ
          </div>
          <div
            className="text-[10px] text-site-muted tracking-[0.5em] uppercase"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ
          </div>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-[#3A1017] to-transparent hidden md:block" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {FAQ_ITEMS.map((item, i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#0e0e0e',
              border: `1px solid ${open === i ? '#FF2B4F40' : '#3A1017'}`,
              borderRadius: 10, overflow: 'hidden',
              transition: 'border-color 0.2s',
            }}
          >
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', cursor: 'pointer', background: 'transparent', border: 'none',
                textAlign: 'left', gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontFamily: '"Bebas Neue", sans-serif', fontSize: 16,
                  color: open === i ? '#FF2B4F' : '#3A1017', flexShrink: 0,
                  transition: 'color 0.2s', minWidth: 24,
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
                  color: open === i ? '#fff' : '#ccc', fontWeight: open === i ? 700 : 400,
                  transition: 'color 0.2s',
                }}>
                  {item.q}
                </span>
              </div>
              <span style={{
                color: open === i ? '#FF2B4F' : '#3A1017',
                fontSize: 18, transition: 'transform 0.2s, color 0.2s', flexShrink: 0,
                transform: open === i ? 'rotate(45deg)' : 'rotate(0deg)',
                display: 'inline-block',
              }}>+</span>
            </button>
            <div style={{
              maxHeight: open === i ? 200 : 0,
              overflow: 'hidden', transition: 'max-height 0.3s ease',
            }}>
              <div style={{
                padding: '0 20px 16px 56px',
                fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
                color: '#888', lineHeight: 1.7,
              }}>
                {item.a}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function HomePage() {
  return (
    <div>
      {/* ═══════════════════════════════
          HERO — COMMAND BRIEFING ROOM
          ═══════════════════════════════ */}
      <section className="relative overflow-hidden min-h-[92vh] flex flex-col justify-center scanline">
        {/* Grid background */}
        <div className="absolute inset-0 grid-bg opacity-60" />
        {/* Pixel particles */}
        <HeroParticles />

        {/* Radial red vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(139,0,24,0.18)_0%,transparent_70%)]" />

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-site-bg to-transparent" />

        {/* Left vertical accent */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-site-accent to-transparent opacity-30" />

        {/* Right vertical accent */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-site-accent to-transparent opacity-30" />

        {/* Top classified bar */}
        <div className="relative z-10 border-b border-[#3A1017] bg-[#0a0000]/80 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-site-accent rounded-full animate-pulse-dot" />
            <span className="text-[10px] text-site-accent tracking-[0.35em] uppercase" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              СЕКРЕТНЫЙ СЕРВЕР — УРОВЕНЬ ДОПУСКА: ALPHA
            </span>
          </div>
          <span className="text-[10px] text-[#3A1017] tracking-widest hidden sm:block" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            COORD: X:0 Y:64 Z:0
          </span>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-16 md:py-24 w-full">
          {/* Status badge */}
          <div className="flex justify-center mb-8 animate-fade-in-down">
            <div className="flex items-center gap-3 px-5 py-2.5 border border-[#3A1017] bg-[#0d0000]/60 clip-angle-sm">
              <ServerStatus compact />
              <div className="w-px h-4 bg-[#3A1017]" />
              <span className="text-[10px] text-site-muted tracking-[0.3em] uppercase" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                СТАТУС СЕРВЕРА
              </span>
            </div>
          </div>

          {/* Main title */}
          <div className="text-center mb-6 animate-fade-in-up">
            <div className="relative inline-block">
              <h1
                className="glitch font-display text-[clamp(80px,20vw,220px)] leading-none tracking-tight text-white text-glow-white"
                data-text="NATUX"
                style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '-0.02em' }}
              >
                NATUX
              </h1>
            </div>
            <div className="block">
              <span
                className="font-display text-[clamp(50px,12vw,140px)] leading-none text-site-accent text-glow-red-lg tracking-widest"
                style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.15em' }}
              >
                WORLD
              </span>
            </div>
          </div>

          {/* Tactical subtitle */}
          <div className="text-center mb-10 animate-fade-in-up delay-200">
            <div className="inline-flex items-center gap-2 md:gap-4">
              <div className="h-px w-12 md:w-24 bg-gradient-to-r from-transparent to-site-accent" />
              <p
                className="text-[11px] md:text-sm text-site-muted tracking-[0.4em] uppercase"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                АНАРХИЯ<span className="text-site-accent mx-2">·</span>PVP<span className="text-site-accent mx-2">·</span>ВЫЖИВАНИЕ
              </p>
              <div className="h-px w-12 md:w-24 bg-gradient-to-l from-transparent to-site-accent" />
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 animate-fade-in-up delay-300">
            <Link
              href="/shop"
              className="group relative px-10 py-4 bg-site-accent hover:bg-red-600 text-white font-bold clip-angle transition-all duration-200 glow-red hover:glow-red-lg uppercase tracking-widest text-sm overflow-hidden"
              style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '18px', letterSpacing: '0.2em' }}
            >
              <span className="relative z-10">▶ ВСТУПИТЬ В ОПЕРАЦИЮ</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </Link>
            <Link
              href="/join"
              className="px-10 py-4 border border-[#3A1017] hover:border-site-accent text-site-muted hover:text-site-text clip-angle transition-all duration-200 uppercase tracking-widest text-sm"
              style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', letterSpacing: '0.25em' }}
            >
              КАК ПОДКЛЮЧИТЬСЯ
            </Link>
          </div>

          {/* IP copy */}
          <div className="flex justify-center animate-fade-in-up delay-400">
            <CopyIPButton />
          </div>
        </div>

        {/* Bottom indicator */}
        <div className="relative z-10 border-t border-[#3A1017] bg-[#0a0000]/80 px-4 py-2 flex items-center justify-center gap-8">
          <span className="text-[9px] text-[#3A1017] tracking-[0.4em] uppercase" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            MINECRAFT 1.20+ · JAVA EDITION · mc.natuxworld.ru
          </span>
        </div>
      </section>

      {/* ═══════════════════════════════
          ОПЕРАТИВНЫЕ ДАННЫЕ — STATS BAR
          ═══════════════════════════════ */}
      <section className="border-y border-[#3A1017] bg-[#0d0000]/80 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg-dense opacity-30" />
        <div className="relative max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-4 bg-site-accent" />
            <span
              className="text-[10px] tracking-[0.5em] text-site-accent uppercase"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              ОПЕРАТИВНЫЕ ДАННЫЕ
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-[#3A1017] to-transparent" />
            <span className="text-[9px] text-[#3A1017] tracking-widest" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              LIVE
            </span>
            <div className="w-1.5 h-1.5 bg-site-accent rounded-full animate-pulse-dot" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={`p-5 ${i < stats.length - 1 ? 'border-r border-[#3A1017]' : ''} relative group`}
              >
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-site-accent/0 via-site-accent/30 to-site-accent/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div
                  className="font-display text-4xl md:text-5xl text-site-accent mb-1 text-glow-red"
                  style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em' }}
                >
                  {s.value}
                </div>
                <div className="text-[9px] text-site-text tracking-[0.3em] uppercase mb-0.5" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {s.label}
                </div>
                <div className="text-[8px] text-[#3A1017] tracking-[0.4em]" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  [{s.sub}]
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════
          FACTION ADVANTAGES — FEATURES
          ═══════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="flex items-center gap-4 mb-12">
          <div className="flex flex-col gap-1">
            <div
              className="font-display text-4xl md:text-5xl text-white"
              style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em' }}
            >
              ПРЕИМУЩЕСТВА
            </div>
            <div
              className="text-[10px] text-site-muted tracking-[0.5em] uppercase"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              ПОЧЕМУ NATUX WORLD?
            </div>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-[#3A1017] to-transparent hidden md:block" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group relative bg-[#0d0000]/60 border border-[#3A1017] hover:border-site-accent/60 clip-tr transition-all duration-300 p-5 hover:bg-[#130000]/80"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              {/* Corner accent */}
              <div className="absolute top-0 right-0 w-5 h-5 overflow-hidden">
                <div className="absolute top-0 right-0 w-0 h-0 border-l-[20px] border-l-transparent border-t-[20px] border-t-[#3A1017] group-hover:border-t-site-accent transition-colors" />
              </div>

              {/* Code label */}
              <div
                className="text-[9px] text-[#3A1017] group-hover:text-site-accent/50 tracking-[0.4em] mb-4 transition-colors"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                {f.code} // {f.tag}
              </div>

              <h3
                className="font-display text-2xl text-white mb-3 group-hover:text-site-accent transition-colors"
                style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em' }}
              >
                {f.title}
              </h3>

              <div className="w-8 h-px bg-site-accent mb-3 transition-all duration-300 group-hover:w-16" />

              <p
                className="text-site-muted text-xs leading-relaxed"
                style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: '1.7' }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════
          TOP DONORS
          ═══════════════════════════════ */}
      <div className="border-t border-[#3A1017]">
        <TopDonors />
      </div>

      {/* ═══════════════════════════════
          GALLERY — АРХИВ ОПЕРАЦИЙ
          ═══════════════════════════════ */}
      <GallerySection />

      {/* ═══════════════════════════════
          FAQ — БРИФИНГ
          ═══════════════════════════════ */}
      <FAQSection />

      {/* ═══════════════════════════════
          FINAL CTA — MISSION BRIEFING
          ═══════════════════════════════ */}
      <section className="relative overflow-hidden border-t border-[#3A1017]">
        <div className="absolute inset-0 bg-[#0d0000]" />
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(139,0,24,0.25)_0%,transparent_70%)]" />

        {/* Corner accents */}
        <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-site-accent/50" />
        <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-site-accent/50" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-site-accent/50" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-site-accent/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-20 text-center">
          <div
            className="text-[9px] text-site-accent tracking-[0.6em] uppercase mb-6"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            — ПРИКАЗ К ОПЕРАЦИИ —
          </div>

          <div
            className="font-display text-5xl md:text-7xl text-white mb-2 text-glow-white"
            style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em' }}
          >
            ГОТОВ К БОЮ?
          </div>

          <p
            className="text-site-muted text-xs md:text-sm mb-10 max-w-lg mx-auto leading-relaxed"
            style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: '1.8' }}
          >
            15 уровней допуска. Промокоды. Автовыдача.<br />
            <span className="text-site-accent">Привилегии активируются через минуту после оплаты.</span>
          </p>

          <Link
            href="/shop"
            className="group relative inline-flex items-center gap-3 px-12 py-5 bg-site-accent hover:bg-red-600 text-white font-bold clip-angle-lg transition-all duration-200 glow-red-lg hover:glow-red-lg uppercase overflow-hidden"
            style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '20px', letterSpacing: '0.25em' }}
          >
            <span className="relative z-10">ПОЛУЧИТЬ ДОПУСК</span>
            <span className="relative z-10 text-white/60 group-hover:text-white transition-colors" style={{ fontSize: '14px' }}>→</span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </Link>

          <div className="mt-6 flex items-center justify-center gap-2">
            <span
              className="text-[9px] text-[#3A1017] tracking-[0.4em] uppercase cursor-blink"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              mc.natuxworld.ru
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
