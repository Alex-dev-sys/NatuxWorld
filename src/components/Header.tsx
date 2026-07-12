'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { BRAND } from '@/lib/brand'

const navItems = [
  { href: '/', label: 'Главная' },
  { href: '/shop', label: 'Магазин' },
  { href: '/news', label: 'Новости' },
  { href: '/leaderboard', label: 'Лидерборд' },
  { href: '/rules', label: 'Правила' },
  { href: '/join', label: 'Подключиться' },
]

export default function Header() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="hdr-root sticky top-0 z-50 bg-[#070707]/95 backdrop-blur-sm border-b border-[#3A1017] border-top-accent">
      {/* Top accent hairline */}
      <div className="absolute inset-x-0 top-0 h-px bg-site-accent" />
      {/* Subtle scanline texture across the bar */}
      <div className="hdr-scan pointer-events-none absolute inset-0" />

      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between relative">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <div className="hdr-logo-mark relative flex-shrink-0">
            {/* Corner brackets framing the mark */}
            <span className="hdr-bracket hdr-bracket--tl" />
            <span className="hdr-bracket hdr-bracket--br" />
            {/* Аватарка-логотип */}
            <Image src="/logo.png" alt={BRAND.name} width={38} height={38} className="block" priority />
            {/* Glow behind logo */}
            <div className="absolute inset-0 bg-site-accent/20 blur-sm scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          </div>
          <div className="flex flex-col leading-none">
            <span
              className="text-[28px] text-white tracking-wider group-hover:text-site-accent transition-colors duration-200"
              style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.1em', lineHeight: 1 }}
            >
              NATUX
            </span>
            <span
              className="flex items-center gap-1.5 text-[8px] text-site-accent tracking-[0.5em] uppercase group-hover:text-white transition-colors duration-200"
              style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.2 }}
            >
              WORLD
              <span className="hdr-id text-[#3A1017] group-hover:text-site-accent/60 transition-colors">{'//77'}</span>
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-5">
          {navItems.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`hdr-nav-item nav-underline relative text-[10px] tracking-[0.3em] uppercase font-medium transition-colors duration-200 pb-0.5 ${
                  active ? 'text-site-accent active' : 'text-[#888] hover:text-site-text'
                }`}
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                {active && <span className="hdr-nav-tick" aria-hidden="true">[</span>}
                {label}
                {active && <span className="hdr-nav-tick hdr-nav-tick--r" aria-hidden="true">]</span>}
              </Link>
            )
          })}

          {/* Live status hint */}
          <div className="hdr-status flex items-center gap-2 pl-4 ml-1 border-l border-[#3A1017]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="hdr-ping absolute inline-flex h-full w-full rounded-full bg-[#35C759] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#35C759]" />
            </span>
            <span
              className="text-[8px] text-[#35C759] tracking-[0.3em] uppercase leading-none"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              ONLINE
            </span>
          </div>

          <Link
            href="/shop"
            className="hdr-cta group relative ml-1 px-5 py-2.5 bg-site-accent hover:bg-red-600 text-white clip-angle-sm transition-all duration-200 glow-red hover:glow-red-lg overflow-hidden"
            style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '14px', letterSpacing: '0.15em' }}
          >
            <span className="relative z-10 flex items-center gap-1.5">
              <span className="hdr-cta-caret">▶</span> КУПИТЬ РАНГ
            </span>
            <span className="hdr-cta-shine absolute inset-0 pointer-events-none" />
          </Link>
        </nav>

        {/* Burger */}
        <button
          className="md:hidden text-[#888] hover:text-white transition-colors p-2 relative"
          onClick={() => setOpen(v => !v)}
          aria-label="Меню"
          aria-expanded={open}
        >
          {open ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="hdr-mobile md:hidden bg-[#070707] border-t border-[#3A1017] px-4 pb-4 overflow-hidden">
          <div className="pt-3 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1 h-3 bg-site-accent" />
              <span className="text-[9px] text-[#888] tracking-[0.4em] uppercase" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                НАВИГАЦИЯ
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="hdr-ping absolute inline-flex h-full w-full rounded-full bg-[#35C759] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#35C759]" />
              </span>
              <span className="text-[8px] text-[#35C759] tracking-[0.3em] uppercase" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                ONLINE
              </span>
            </div>
          </div>
          {navItems.map(({ href, label }, i) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className={`hdr-mobile-item flex items-center gap-3 py-3 text-[11px] font-medium uppercase tracking-[0.25em] border-b border-[#3A1017]/40 transition-colors hover:text-site-accent ${
                pathname === href ? 'text-site-accent' : 'text-[#888]'
              }`}
              style={{ fontFamily: '"JetBrains Mono", monospace', animationDelay: `${i * 45}ms` }}
              onClick={() => setOpen(false)}
            >
              <span className={pathname === href ? 'text-site-accent' : 'text-site-accent/40'}>{'//'}</span>
              {label}
            </Link>
          ))}
          <Link
            href="/shop"
            className="hdr-mobile-item flex items-center justify-center gap-2 mt-4 px-4 py-3.5 bg-site-accent hover:bg-red-600 text-white text-[13px] font-bold uppercase tracking-[0.2em] clip-angle-sm transition-colors glow-red"
            style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.2em', animationDelay: `${navItems.length * 45}ms` }}
            onClick={() => setOpen(false)}
          >
            ▶ КУПИТЬ РАНГ
          </Link>
        </div>
      )}

      <style>{`
        .hdr-scan {
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.16) 2px,
            rgba(0, 0, 0, 0.16) 3px
          );
          opacity: 0.5;
          z-index: 0;
        }

        .hdr-logo-mark { padding: 3px; }
        .hdr-bracket {
          position: absolute;
          width: 7px;
          height: 7px;
          border: 0 solid #FF2B4F;
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: 20;
        }
        .hdr-bracket--tl { top: 0; left: 0; border-width: 1.5px 0 0 1.5px; }
        .hdr-bracket--br { bottom: 0; right: 0; border-width: 0 1.5px 1.5px 0; }
        .group:hover .hdr-bracket { opacity: 1; }

        .hdr-nav-tick {
          color: #FF2B4F;
          opacity: 0.7;
          margin-right: 3px;
          animation: hdr-tick-in 0.25s ease both;
        }
        .hdr-nav-tick--r { margin-right: 0; margin-left: 3px; }
        @keyframes hdr-tick-in {
          from { opacity: 0; transform: translateY(-2px); }
          to   { opacity: 0.7; transform: translateY(0); }
        }

        .hdr-ping { animation: hdr-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite; }
        @keyframes hdr-ping {
          75%, 100% { transform: scale(2.4); opacity: 0; }
        }

        .hdr-cta-shine {
          background: linear-gradient(120deg, transparent 20%, rgba(255,255,255,0.28) 50%, transparent 80%);
          transform: translateX(-130%);
        }
        .hdr-cta:hover .hdr-cta-shine { animation: hdr-shine 0.7s ease forwards; }
        @keyframes hdr-shine {
          to { transform: translateX(130%); }
        }
        .hdr-cta-caret {
          display: inline-block;
          transition: transform 0.2s ease;
          font-size: 10px;
        }
        .hdr-cta:hover .hdr-cta-caret { transform: translateX(2px); }

        .hdr-mobile { animation: hdr-mobile-drop 0.28s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes hdr-mobile-drop {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hdr-mobile-item { animation: hdr-mobile-item 0.32s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes hdr-mobile-item {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hdr-ping, .hdr-cta-shine, .hdr-mobile, .hdr-mobile-item, .hdr-nav-tick { animation: none !important; }
          .hdr-cta-shine { display: none; }
        }
      `}</style>
    </header>
  )
}
