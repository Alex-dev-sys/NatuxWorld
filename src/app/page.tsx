'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import ServerStatus from '@/components/ServerStatus'
import TopDonors from '@/components/TopDonors'
import { Hero3D } from '@/components/three'
import { PremiumCard } from '@/components/PremiumFX'
import type { ServerStatus as ServerStatusType } from '@/lib/types'

const MONO = { fontFamily: '"JetBrains Mono", monospace' }
const DISPLAY = { fontFamily: '"Bebas Neue", sans-serif' }

// data-URI для плёночного зерна — в inline-style (а не в <style>), иначе кавычки
// внутри url() экранируются на сервере и ломают гидрацию.
const GRAIN_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

function CopyIPButton() {
  const [copied, setCopied] = useState(false)
  const ip = 'mc.vibestudy.ru'

  const copy = () => {
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={copy}
      className="group flex items-center gap-3 px-5 py-2.5 bg-[#130a0b] border border-[#3A1017] hover:border-site-accent transition-all duration-200 clip-angle-sm"
    >
      <span className="text-[10px] text-site-muted uppercase tracking-widest" style={MONO}>IP://</span>
      <span className="font-mono text-site-accent text-sm tracking-wider" style={MONO}>{ip}</span>
      {copied ? (
        <svg className="w-3.5 h-3.5 text-site-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-site-muted group-hover:text-site-accent transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
      <span className="text-[10px] text-site-muted group-hover:text-site-accent transition-colors uppercase tracking-wider" style={MONO}>
        {copied ? 'СКОПИРОВАНО' : 'СКОПИРОВАТЬ'}
      </span>
    </button>
  )
}

/* ============================================================
   BOOT PROLOGUE — types a couple of terminal lines, then the
   title is revealed. Lives above the title; respects reduced
   motion by jumping straight to the done state.
   ============================================================ */

const BOOT_LINES = [
  '> ИНИЦИАЛИЗАЦИЯ ЗАЩИЩЁННОГО КАНАЛА...',
  '> ДЕШИФРОВКА КООРДИНАТ [ X:0 Y:64 Z:0 ]',
  '> ДОСТУП ПОДТВЕРЖДЁН — ДОБРО ПОЖАЛОВАТЬ, ОПЕРАТИВНИК',
]

function BootPrologue() {
  const [line, setLine] = useState(0)
  const [chars, setChars] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setLine(BOOT_LINES.length - 1)
      setChars(BOOT_LINES[BOOT_LINES.length - 1].length)
      setDone(true)
      return
    }

    let cancelled = false
    let l = 0
    let c = 0
    const step = () => {
      if (cancelled) return
      if (l >= BOOT_LINES.length) {
        setDone(true)
        return
      }
      const text = BOOT_LINES[l]
      if (c <= text.length) {
        setLine(l)
        setChars(c)
        c++
        setTimeout(step, 22)
      } else {
        l++
        c = 0
        setTimeout(step, 260)
      }
    }
    const start = setTimeout(step, 350)
    return () => {
      cancelled = true
      clearTimeout(start)
    }
  }, [])

  return (
    <div
      className="hp-boot mx-auto mb-8 w-full max-w-xl px-4 py-3 border border-[#3A1017] bg-[#0a0000]/70 clip-angle-sm"
      style={{ minHeight: 96 }}
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[#3A1017]/70">
        <span className="w-1.5 h-1.5 bg-site-accent animate-pulse-dot" style={{ display: 'inline-block' }} />
        <span className="text-[8px] text-site-accent tracking-[0.4em] uppercase" style={MONO}>TERMINAL // NATUX-SECURE-SHELL</span>
      </div>
      <div className="flex flex-col gap-1">
        {BOOT_LINES.map((text, i) => {
          if (i > line) return null
          const shown = i < line || done ? text : text.slice(0, chars)
          const active = i === line && !done
          return (
            <div key={i} className="text-[10px] md:text-[11px] text-[#888] tracking-wider" style={MONO}>
              <span className={i === BOOT_LINES.length - 1 && done ? 'text-site-success' : ''}>{shown}</span>
              {active && <span className="hp-caret">▌</span>}
            </div>
          )
        })}
        {done && (
          <div className="text-[10px] md:text-[11px] text-site-accent tracking-wider hp-fade" style={MONO}>
            {'>'} ЗАГРУЗКА ИНТЕРФЕЙСА<span className="hp-caret">▌</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* Ops-data ticker strip under the hero. Reuses global animate-marquee. */
const TICKER = [
  'СТАТУС: ОПЕРАЦИЯ АКТИВНА',
  'IP: mc.vibestudy.ru',
  'ПОСЛЕДНЕЕ СОБЫТИЕ: РЕЙД НА КРЕПОСТЬ АЛЬФА',
  'УРОВЕНЬ ДОПУСКА: ALPHA',
  'СЕКТОР X:1247 Z:-883 — ЗАЧИЩЕН',
  'ПРОТОКОЛ: АНАРХИЯ / БЕЗ ПРАВИЛ',
  'НОВЫЙ РЕКОРД ОНЛАЙНА ЗА СУТКИ',
  'ВЕРСИЯ КЛИЕНТА: 1.20+ JAVA',
]

function OpsTicker() {
  const row = [...TICKER, ...TICKER]
  return (
    <div className="relative z-10 border-t border-[#3A1017] bg-[#0a0000]/90 overflow-hidden">
      <div className="flex items-stretch">
        <div className="flex items-center gap-2 px-4 py-2 bg-site-accent flex-shrink-0">
          <span className="w-1.5 h-1.5 bg-black animate-pulse-dot" style={{ display: 'inline-block' }} />
          <span className="text-[9px] text-black font-bold tracking-[0.3em] uppercase" style={MONO}>LIVE</span>
        </div>
        <div className="relative flex-1 overflow-hidden flex items-center">
          <div className="flex animate-marquee whitespace-nowrap" style={{ willChange: 'transform' }}>
            {row.map((t, i) => (
              <span key={i} className="inline-flex items-center text-[10px] text-site-muted tracking-[0.2em] uppercase px-6 py-2" style={MONO}>
                <span className="text-site-accent mr-2">{'//'}</span>{t}
              </span>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#0a0000] to-transparent pointer-events-none" />
        </div>
      </div>
    </div>
  )
}

const features = [
  {
    code: 'OBJ-01',
    title: 'ХАРДКОР PVP',
    desc: 'Без правил, без жалости. Чистый анархичный PvP на выживание. Только сильнейшие остаются.',
    tag: 'COMBAT',
    detail: 'УГРОЗА: КРИТИЧЕСКАЯ · ЗОНА БЕЗ ПРАВИЛ',
  },
  {
    code: 'OBJ-02',
    title: 'ПОЛНАЯ СВОБОДА',
    desc: 'Строй где хочешь. Рейды, ловушки, альянсы — ты сам решаешь свою тактику.',
    tag: 'FREEDOM',
    detail: 'ОГРАНИЧЕНИЯ: ОТСУТСТВУЮТ · КАРТА: ∞',
  },
  {
    code: 'OBJ-03',
    title: '15 УРОВНЕЙ ДОПУСКА',
    desc: 'От Baron до God. Каждый ранг — военный допуск к уникальным возможностям.',
    tag: 'CLEARANCE',
    detail: 'ДИАПАЗОН: BARON → GOD · АВТОВЫДАЧА',
  },
  {
    code: 'OBJ-04',
    title: 'ЖИВОЕ КОМЬЮНИТИ',
    desc: 'Активное сообщество. Турниры, события, оперативные новости в реальном времени.',
    tag: 'INTEL',
    detail: 'КАНАЛ СВЯЗИ: ОТКРЫТ · СОБЫТИЯ 24/7',
  },
]

/* numeric count-up: parses leading number, preserves suffix like /, +, текст */
function parseStat(value: string): { num: number | null; suffix: string; raw: string } {
  const m = value.match(/^(\d+)(.*)$/)
  if (!m) return { num: null, suffix: '', raw: value }
  return { num: parseInt(m[1], 10), suffix: m[2] ?? '', raw: value }
}

function useCountUp(target: number | null, active: boolean, duration = 1100) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active || target === null) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setVal(target)
      return
    }
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(eased * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active, duration])
  return val
}

function StatCell({ value, label, sub, live, active, isLast }: {
  value: string; label: string; sub: string; live?: boolean; active: boolean; isLast: boolean
}) {
  const { num, suffix, raw } = parseStat(value)
  const counted = useCountUp(num, active)
  const display = num === null ? raw : `${counted}${suffix}`
  return (
    <div className={`p-5 ${!isLast ? 'border-r border-[#3A1017]' : ''} relative group`}>
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-site-accent/0 via-site-accent/30 to-site-accent/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div
        className="font-display text-4xl md:text-5xl text-site-accent mb-1 text-glow-red"
        style={{ ...DISPLAY, letterSpacing: '0.05em' }}
      >
        {display}
        {live && <span className="hp-caret text-site-accent" style={{ fontSize: '0.5em', verticalAlign: 'top', marginLeft: 2 }}>▌</span>}
      </div>
      <div className="text-[9px] text-site-text tracking-[0.3em] uppercase mb-0.5" style={MONO}>
        {label}
      </div>
      <div className="text-[8px] text-[#3A1017] tracking-[0.4em]" style={MONO}>
        [{sub}]
      </div>
    </div>
  )
}

const BASE_STATS = [
  { value: '15', label: 'УРОВНЕЙ ДОПУСКА', sub: 'RANKS' },
  { value: '24/7', label: 'ОНЛАЙН', sub: 'UPTIME' },
  { value: process.env.NEXT_PUBLIC_SERVER_VERSION ?? '1.20+', label: 'ВЕРСИЯ', sub: 'BUILD' },
]

const GALLERY = [
  { title: 'ОПЕРАЦИЯ РАССВЕТ', coord: 'X:1247 Z:-883', accent: '#FF2B4F', status: 'АКТИВНА', sector: 'СЕКТОР 07' },
  { title: 'КРЕПОСТЬ АЛЬФА', coord: 'X:-3341 Z:220', accent: '#4A90D9', status: 'ПОД КОНТРОЛЕМ', sector: 'СЕКТОР 12' },
  { title: 'ЛЕСНОЙ ФОРПОСТ', coord: 'X:567 Z:4129', accent: '#35C759', status: 'ПАТРУЛЬ', sector: 'СЕКТОР 03' },
  { title: 'ПОДЗЕМНЫЙ БУНКЕР', coord: 'X:-892 Z:-1541', accent: '#9B6BFF', status: 'ЗАСЕКРЕЧЕНО', sector: 'СЕКТОР 19' },
  { title: 'ОГНЕННЫЙ РУБЕЖ', coord: 'X:4401 Z:88', accent: '#FF8C42', status: 'ГОРЯЧАЯ ЗОНА', sector: 'СЕКТОР 24' },
  { title: 'АРЕНА СМЕРТИ', coord: 'X:0 Z:0', accent: '#FF2B4F', status: 'ЗАЧИЩЕН', sector: 'СЕКТОР 00' },
]

function GallerySection() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-20">
      <div className="hp-reveal flex items-center gap-4 mb-12">
        <div className="flex flex-col gap-1">
          <div className="font-display text-4xl md:text-5xl text-white" style={{ ...DISPLAY, letterSpacing: '0.05em' }}>
            АРХИВ ОПЕРАЦИЙ
          </div>
          <div className="text-[10px] text-site-muted tracking-[0.5em] uppercase" style={MONO}>
            ЗАДОКУМЕНТИРОВАННЫЕ МИССИИ
          </div>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-[#3A1017] to-transparent hidden md:block" />
        <span className="text-[9px] text-site-accent border border-site-accent/30 px-3 py-1 tracking-[0.3em] uppercase" style={MONO}>
          НАВЕДИ ДЛЯ РАССЕКРЕЧИВАНИЯ
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {GALLERY.map((item, i) => (
          <GalleryCard key={i} index={i} {...item} />
        ))}
      </div>
    </section>
  )
}

function GalleryCard({ title, coord, accent, status, sector, index }: {
  title: string; coord: string; accent: string; status: string; sector: string; index: number
}) {
  const [hov, setHov] = useState(false)
  // позиция радар-пинга (детерминированно от индекса, без Math.random для SSR)
  const pingX = 26 + (index * 37) % 48
  const pingY = 22 + (index * 53) % 40

  return (
    <div
      className="hp-gallery-card"
      style={{
        position: 'relative', aspectRatio: '4/3',
        clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
        overflow: 'hidden', cursor: 'pointer',
        backgroundColor: '#0a0506',
        border: `1px solid ${hov ? accent : '#3A1017'}`,
        transition: 'border-color 0.25s, transform 0.25s, box-shadow 0.25s',
        transform: hov ? 'scale(1.02)' : 'scale(1)',
        boxShadow: hov ? `0 0 26px ${accent}40` : 'none',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* акцентное свечение из угла */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(120% 90% at 18% 12%, ${accent}22, transparent 55%)`,
        opacity: hov ? 1 : 0.5, transition: 'opacity 0.3s', pointerEvents: 'none',
      }} />
      {/* топографическая карта: контурные линии (SVG) */}
      <svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <g fill="none" stroke={accent} strokeWidth="0.6" opacity={hov ? 0.45 : 0.28} style={{ transition: 'opacity 0.3s' }}>
          <ellipse cx="42" cy="40" rx="50" ry="34" />
          <ellipse cx="44" cy="42" rx="38" ry="25" />
          <ellipse cx="46" cy="44" rx="26" ry="17" />
          <ellipse cx="48" cy="46" rx="14" ry="9" />
          <path d="M-10 70 Q 30 55 70 72 T 140 66" />
          <path d="M-10 18 Q 40 30 80 14 T 150 24" />
        </g>
      </svg>
      {/* мелкая координатная сетка */}
      <div className="grid-bg-dense" style={{ position: 'absolute', inset: 0, opacity: 0.25, pointerEvents: 'none' }} />
      {/* радар-пинг */}
      <span style={{ position: 'absolute', left: `${pingX}%`, top: `${pingY}%`, width: 6, height: 6, marginLeft: -3, marginTop: -3, pointerEvents: 'none' }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <span className="hp-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${accent}` }} />
      </span>
      {/* scanlines */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)',
        pointerEvents: 'none',
      }} />
      {/* corner brackets */}
      <div style={{ position: 'absolute', top: 8, left: 8, width: 12, height: 12, borderLeft: `1.5px solid ${hov ? accent : accent + '70'}`, borderTop: `1.5px solid ${hov ? accent : accent + '70'}`, transition: 'border-color 0.25s' }} />
      <div style={{ position: 'absolute', bottom: 8, right: 8, width: 12, height: 12, borderRight: `1.5px solid ${hov ? accent : accent + '70'}`, borderBottom: `1.5px solid ${hov ? accent : accent + '70'}`, transition: 'border-color 0.25s' }} />

      {/* верхняя строка: сектор + файл-индекс */}
      <div style={{ position: 'absolute', top: 8, left: 24, right: 12, display: 'flex', justifyContent: 'space-between', fontFamily: '"JetBrains Mono", monospace', fontSize: 8, letterSpacing: '0.25em' }}>
        <span style={{ color: hov ? accent : '#ffffff55', transition: 'color 0.25s' }}>{sector}</span>
        <span style={{ color: hov ? accent : '#ffffff55', transition: 'color 0.25s' }}>ФАЙЛ-{String(index + 1).padStart(2, '0')}</span>
      </div>

      {/* caption */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '18px 14px 12px', background: 'linear-gradient(to top, rgba(5,6,8,0.92), transparent)', zIndex: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ width: 5, height: 5, background: accent, transform: 'rotate(45deg)', boxShadow: `0 0 5px ${accent}`, flexShrink: 0 }} />
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: accent, letterSpacing: '0.25em' }}>{status}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: '#ffffff66', letterSpacing: '0.15em' }}>{coord}</span>
        </div>
        <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 17, color: '#fff', letterSpacing: '0.08em', lineHeight: 1 }}>{title}</div>
      </div>

      {/* declassify panel */}
      <div
        className="hp-declassify"
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(6,7,9,0.8)',
          transform: hov ? 'translateY(-101%)' : 'translateY(0)',
          opacity: hov ? 0 : 1,
          transition: 'transform 0.45s cubic-bezier(0.65,0,0.35,1), opacity 0.45s',
          zIndex: 4,
        }}
      >
        <div style={{ border: `2px solid ${accent}90`, padding: '7px 16px', transform: 'rotate(-6deg)' }}>
          <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 20, color: accent, letterSpacing: '0.15em' }}>РАССЕКРЕТИТЬ</span>
        </div>
        <div style={{ marginTop: 9, fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: '#777', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          {'> '}НАВЕДИ ДЛЯ ДОСТУПА
        </div>
      </div>
    </div>
  )
}

const FAQ_ITEMS = [
  {
    q: 'Как подключиться к серверу?',
    a: 'Открой Minecraft Java Edition → Мультиплеер → Добавить сервер → введи mc.vibestudy.ru. Работает с версий 1.20.1 и выше. Лицензия не обязательна.',
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
      <div className="hp-reveal flex items-center gap-4 mb-10">
        <div className="flex flex-col gap-1">
          <div className="font-display text-4xl md:text-5xl text-white" style={{ ...DISPLAY, letterSpacing: '0.05em' }}>
            БРИФИНГ
          </div>
          <div className="text-[10px] text-site-muted tracking-[0.5em] uppercase" style={MONO}>
            ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ
          </div>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-[#3A1017] to-transparent hidden md:block" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = open === i
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                backgroundColor: '#140a0b',
                border: `1px solid ${isOpen ? '#FF2B4F40' : '#3A1017'}`,
                clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}
            >
              {/* left accent bar when open */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
                background: '#FF2B4F',
                transform: isOpen ? 'scaleY(1)' : 'scaleY(0)',
                transformOrigin: 'top', transition: 'transform 0.25s',
              }} />
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 20px', cursor: 'pointer', background: 'transparent', border: 'none',
                  textAlign: 'left', gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontFamily: '"Bebas Neue", sans-serif', fontSize: 16,
                    color: isOpen ? '#FF2B4F' : '#3A1017', flexShrink: 0,
                    transition: 'color 0.2s', minWidth: 24,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
                    color: isOpen ? '#fff' : '#ccc', fontWeight: isOpen ? 700 : 400,
                    transition: 'color 0.2s',
                  }}>
                    {item.q}
                  </span>
                </div>
                <span style={{
                  color: isOpen ? '#FF2B4F' : '#3A1017',
                  fontSize: 18, transition: 'transform 0.2s, color 0.2s', flexShrink: 0,
                  transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}>+</span>
              </button>
              <div style={{ maxHeight: isOpen ? 240 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                <div style={{
                  padding: '0 20px 16px 56px',
                  fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
                  color: '#888', lineHeight: 1.7,
                }}>
                  <span style={{ color: '#FF2B4F', marginRight: 6 }}>{'>'}</span>{item.a}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function HomePage() {
  const [serverStatus, setServerStatus] = useState<ServerStatusType | null>(null)
  const [statsActive, setStatsActive] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/server/status')
      .then(r => r.json())
      .then(setServerStatus)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const el = statsRef.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            setStatsActive(true)
            io.disconnect()
          }
        })
      },
      { threshold: 0.35 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // scroll-reveal: оркестрованное появление секций при входе во вьюпорт
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.hp-reveal'))
    if (!els.length) return
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }),
      { threshold: 0.2 }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  const stats = [
    ...BASE_STATS,
    {
      value: serverStatus?.online ? String(serverStatus.players.online) : '...',
      label: 'ОНЛАЙН СЕЙЧАС',
      sub: 'ACTIVE',
      live: true,
    },
  ]

  return (
    <div>
      <style>{`
        .hp-caret { animation: hp-blink 1s step-end infinite; }
        @keyframes hp-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .hp-fade { animation: hp-fadein 0.5s ease-out both; }
        @keyframes hp-fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .hp-boot { animation: hp-fadein 0.5s ease-out both; }
        .hp-title-reveal { animation: hp-rise 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes hp-rise { from { opacity: 0; transform: translateY(28px); filter: blur(6px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }
        .hp-cta-pulse { animation: hp-cta-glow 3.2s ease-in-out infinite; }
        @keyframes hp-cta-glow {
          0%, 100% { box-shadow: 0 0 28px rgba(255,43,79,0.45), 0 0 60px rgba(255,43,79,0.12); }
          50% { box-shadow: 0 0 44px rgba(255,43,79,0.7), 0 0 110px rgba(255,43,79,0.22); }
        }
        .hp-sweep { animation: hp-sweep-move 7s linear infinite; }
        @keyframes hp-sweep-move { 0% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
        .hp-detail { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 0.35s ease, opacity 0.35s ease; }
        .group:hover .hp-detail { max-height: 60px; opacity: 1; }
        .hp-ping { animation: hp-ping-pulse 2.4s ease-out infinite; }
        @keyframes hp-ping-pulse {
          0%   { transform: scale(1); opacity: 0.9; }
          70%  { transform: scale(3.4); opacity: 0; }
          100% { transform: scale(3.4); opacity: 0; }
        }
        /* плёночное зерно — filmic-текстура поверх всего */
        .hp-grain {
          position: fixed; inset: 0; z-index: 60; pointer-events: none;
          opacity: 0.05; mix-blend-mode: overlay;
        }
        /* виньетка — фокус к центру */
        .hp-vignette {
          position: fixed; inset: 0; z-index: 55; pointer-events: none;
          background: radial-gradient(ellipse 95% 80% at 50% 42%, transparent 52%, rgba(0,0,0,0.5) 100%);
        }
        /* ghost-эхо заголовка (контур) */
        .hp-ghost { -webkit-text-stroke: 1.5px rgba(255,43,79,0.13); color: transparent; }
        /* прицел-рамка вокруг заголовка */
        .hp-reticle { animation: hp-reticle-spin 26s linear infinite; }
        @keyframes hp-reticle-spin { to { transform: rotate(360deg); } }
        /* scroll-reveal секций */
        .hp-reveal { opacity: 0; transform: translateY(26px); transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1); }
        .hp-reveal.in { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: reduce) {
          .hp-caret, .hp-cta-pulse, .hp-sweep, .hp-ping, .hp-grain, .hp-reticle { animation: none !important; }
          .hp-title-reveal, .hp-fade, .hp-boot { animation: none !important; opacity: 1 !important; transform: none !important; filter: none !important; }
          .hp-reveal { opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      {/* filmic-атмосфера поверх всей главной */}
      <div className="hp-grain" aria-hidden="true" style={{ backgroundImage: GRAIN_BG }} />
      <div className="hp-vignette" aria-hidden="true" />

      <section className="relative overflow-hidden min-h-[92vh] flex flex-col justify-center scanline">
        {/* layered depth behind particles */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_120%,rgba(139,0,24,0.22)_0%,transparent_60%)]" />
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute inset-0 grid-bg-dense opacity-20" style={{ maskImage: 'radial-gradient(ellipse 60% 50% at 50% 45%, #000 0%, transparent 75%)' }} />
        <Hero3D className="absolute inset-0 z-[2] pointer-events-none opacity-90 mix-blend-screen" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(139,0,24,0.18)_0%,transparent_70%)]" />
        {/* moving scan sweep for depth */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="hp-sweep absolute top-0 bottom-0 w-1/3" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,43,79,0.05), transparent)' }} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-site-bg to-transparent" />
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-site-accent to-transparent opacity-30" />
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-site-accent to-transparent opacity-30" />

        <div className="relative z-10 border-b border-[#3A1017] bg-[#0a0000]/80 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-site-accent rounded-full animate-pulse-dot" />
            <span className="text-[10px] text-site-accent tracking-[0.35em] uppercase" style={MONO}>
              СЕКРЕТНЫЙ СЕРВЕР — УРОВЕНЬ ДОПУСКА: ALPHA
            </span>
          </div>
          <span className="text-[10px] text-[#3A1017] tracking-widest hidden sm:block" style={MONO}>
            COORD: X:0 Y:64 Z:0
          </span>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-12 md:py-16 w-full">
          <div className="flex justify-center mb-8 animate-fade-in-down">
            <div className="flex items-center gap-3 px-5 py-2.5 border border-[#3A1017] bg-[#0d0000]/60 clip-angle-sm">
              <ServerStatus compact />
            </div>
          </div>

          <div className="relative text-center mb-6 hp-title-reveal" style={{ animationDelay: '0.15s' }}>
            <div className="relative inline-block">
              {/* ghost-эхо: крупный контур позади */}
              <span
                className="hp-ghost pointer-events-none select-none absolute left-1/2 -translate-x-1/2 font-display leading-none hidden sm:block"
                aria-hidden="true"
                style={{ ...DISPLAY, top: '-0.18em', fontSize: 'clamp(110px,26vw,300px)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', zIndex: 0 }}
              >
                NATUX
              </span>
              <h1
                className="glitch relative font-display text-[clamp(80px,20vw,220px)] leading-none tracking-tight text-white text-glow-white"
                data-text="NATUX"
                style={{ ...DISPLAY, letterSpacing: '-0.02em', zIndex: 1 }}
              >
                NATUX
              </h1>
            </div>
            <div className="relative block" style={{ zIndex: 1 }}>
              <span
                className="font-display text-[clamp(50px,12vw,140px)] leading-none text-site-accent text-glow-red-lg tracking-widest"
                style={{ ...DISPLAY, letterSpacing: '0.15em' }}
              >
                WORLD
              </span>
            </div>
          </div>

          <div className="text-center mb-10 animate-fade-in-up delay-200">
            <div className="inline-flex items-center gap-2 md:gap-4">
              <div className="h-px w-12 md:w-24 bg-gradient-to-r from-transparent to-site-accent" />
              <p className="text-[11px] md:text-sm text-site-muted tracking-[0.4em] uppercase" style={MONO}>
                АНАРХИЯ<span className="text-site-accent mx-2">·</span>PVP<span className="text-site-accent mx-2">·</span>ВЫЖИВАНИЕ
              </p>
              <div className="h-px w-12 md:w-24 bg-gradient-to-l from-transparent to-site-accent" />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 animate-fade-in-up delay-300">
            <Link
              href="/shop"
              className="group relative px-10 py-4 bg-site-accent hover:bg-red-600 text-white font-bold clip-angle transition-all duration-200 glow-red hover:glow-red-lg uppercase tracking-widest text-sm overflow-hidden"
              style={{ ...DISPLAY, fontSize: '18px', letterSpacing: '0.2em' }}
            >
              <span className="relative z-10">▶ ВСТУПИТЬ В ОПЕРАЦИЮ</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </Link>
            <Link
              href="/join"
              className="px-10 py-4 border border-[#3A1017] hover:border-site-accent text-site-muted hover:text-site-text clip-angle transition-all duration-200 uppercase tracking-widest text-sm"
              style={{ ...MONO, fontSize: '12px', letterSpacing: '0.25em' }}
            >
              КАК ПОДКЛЮЧИТЬСЯ
            </Link>
          </div>

          <div className="flex justify-center animate-fade-in-up delay-400">
            <CopyIPButton />
          </div>
        </div>

        <OpsTicker />
      </section>

      <section ref={statsRef} className="border-y border-[#3A1017] bg-[#0d0000]/80 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg-dense opacity-30" />
        <div className="relative max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-4 bg-site-accent" />
            <span className="text-[10px] tracking-[0.5em] text-site-accent uppercase" style={MONO}>
              ОПЕРАТИВНЫЕ ДАННЫЕ
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-[#3A1017] to-transparent" />
            <span className="text-[9px] text-[#3A1017] tracking-widest" style={MONO}>
              LIVE
            </span>
            <div className="w-1.5 h-1.5 bg-site-accent rounded-full animate-pulse-dot" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
            {stats.map((s, i) => (
              <StatCell
                key={s.label}
                value={s.value}
                label={s.label}
                sub={s.sub}
                live={'live' in s ? (s.live as boolean) : false}
                active={statsActive}
                isLast={i === stats.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="hp-reveal flex items-center gap-4 mb-12">
          <div className="flex flex-col gap-1">
            <div className="font-display text-4xl md:text-5xl text-white" style={{ ...DISPLAY, letterSpacing: '0.05em' }}>
              ПРЕИМУЩЕСТВА
            </div>
            <div className="text-[10px] text-site-muted tracking-[0.5em] uppercase" style={MONO}>
              ПОЧЕМУ NATUX WORLD?
            </div>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-[#3A1017] to-transparent hidden md:block" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <PremiumCard
              key={f.title}
              color="#FF2B4F"
              tilt={3}
              className="group bg-[#0d0000]/60 border border-[#3A1017] hover:border-site-accent/60 clip-tr transition-all duration-300 p-5 hover:bg-[#130000]/80 overflow-hidden"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              {/* scanline overlay on hover */}
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,43,79,0.04) 3px, rgba(255,43,79,0.04) 4px)',
              }} />
              {/* bottom-left corner bracket */}
              <div className="absolute bottom-2 left-2 w-3 h-3 border-l border-b border-[#3A1017] group-hover:border-site-accent transition-colors" />
              <div className="absolute top-0 right-0 w-5 h-5 overflow-hidden">
                <div className="absolute top-0 right-0 w-0 h-0 border-l-[20px] border-l-transparent border-t-[20px] border-t-[#3A1017] group-hover:border-t-site-accent transition-colors" />
              </div>
              <div className="relative text-[9px] text-[#3A1017] group-hover:text-site-accent/50 tracking-[0.4em] mb-4 transition-colors" style={MONO}>
                {f.code} {'//'} {f.tag}
              </div>
              <h3 className="relative font-display text-2xl text-white mb-3 group-hover:text-site-accent transition-colors" style={{ ...DISPLAY, letterSpacing: '0.05em' }}>
                {f.title}
              </h3>
              <div className="relative w-8 h-px bg-site-accent mb-3 transition-all duration-300 group-hover:w-16" />
              <p className="relative text-site-muted text-xs leading-relaxed" style={{ ...MONO, lineHeight: '1.7' }}>
                {f.desc}
              </p>
              {/* tactical detail line revealed on hover */}
              <div className="hp-detail relative mt-4">
                <div className="pt-3 border-t border-[#3A1017] text-[8px] text-site-accent/80 tracking-[0.25em] uppercase" style={MONO}>
                  {'>'} {f.detail}
                </div>
              </div>
            </PremiumCard>
          ))}
        </div>
      </section>

      <div className="border-t border-[#3A1017]">
        <TopDonors />
      </div>

      <GallerySection />
      <FAQSection />

      <section className="relative overflow-hidden border-t border-[#3A1017]">
        <div className="absolute inset-0 bg-[#0d0000]" />
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(139,0,24,0.25)_0%,transparent_70%)]" />
        {/* slow moving sweep */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="hp-sweep absolute top-0 bottom-0 w-1/3" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,43,79,0.06), transparent)' }} />
        </div>
        <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-site-accent/50" />
        <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-site-accent/50" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-site-accent/50" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-site-accent/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-24 text-center">
          <div className="text-[9px] text-site-accent tracking-[0.6em] uppercase mb-6" style={MONO}>
            — ПРИКАЗ К ОПЕРАЦИИ —
          </div>
          <div className="font-display text-5xl md:text-7xl text-white mb-2 text-glow-white" style={{ ...DISPLAY, letterSpacing: '0.05em' }}>
            ГОТОВ К БОЮ?
          </div>
          <p className="text-site-muted text-xs md:text-sm mb-10 max-w-lg mx-auto leading-relaxed" style={{ ...MONO, lineHeight: '1.8' }}>
            15 уровней допуска. Промокоды. Автовыдача.<br />
            <span className="text-site-accent">Привилегии активируются через минуту после оплаты.</span>
          </p>
          <Link
            href="/shop"
            className="hp-cta-pulse group relative inline-flex items-center gap-3 px-12 py-5 bg-site-accent hover:bg-red-600 text-white font-bold clip-angle-lg transition-all duration-200 uppercase overflow-hidden"
            style={{ ...DISPLAY, fontSize: '20px', letterSpacing: '0.25em' }}
          >
            <span className="relative z-10">ПОЛУЧИТЬ ДОПУСК</span>
            <span className="relative z-10 text-white/60 group-hover:text-white transition-colors" style={{ fontSize: '14px' }}>→</span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </Link>
          <div className="mt-6 flex items-center justify-center gap-2">
            <span className="text-[9px] text-[#3A1017] tracking-[0.4em] uppercase cursor-blink" style={MONO}>
              mc.vibestudy.ru
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
