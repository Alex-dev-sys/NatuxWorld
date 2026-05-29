'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'Главная' },
  { href: '/shop', label: 'Магазин' },
  { href: '/rules', label: 'Правила' },
  { href: '/map', label: 'Карта' },
  { href: '/join', label: 'Подключиться' },
]

export default function Header() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-[#070707]/95 backdrop-blur-sm border-b border-[#3A1017] border-top-accent">
      {/* Scanline-style subtle line */}
      <div className="absolute inset-x-0 top-0 h-px bg-site-accent" />

      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between relative">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <div className="relative flex-shrink-0">
            <Image
              src="/logo.png"
              alt="NATUX WORLD"
              width={34}
              height={34}
              className="group-hover:scale-110 transition-transform duration-200"
              style={{ imageRendering: 'pixelated' }}
              priority
            />
            {/* Glow behind logo */}
            <div className="absolute inset-0 bg-site-accent/20 blur-sm scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
          </div>
          <div className="flex flex-col leading-none">
            <span
              className="text-[28px] text-white tracking-wider group-hover:text-site-accent transition-colors duration-200"
              style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.1em', lineHeight: 1 }}
            >
              NATUX
            </span>
            <span
              className="text-[8px] text-site-accent tracking-[0.5em] uppercase group-hover:text-white transition-colors duration-200"
              style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.2 }}
            >
              WORLD
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-5">
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-underline text-[10px] tracking-[0.3em] uppercase font-medium transition-colors duration-200 pb-0.5 ${
                pathname === href
                  ? 'text-site-accent active'
                  : 'text-[#888] hover:text-site-text'
              }`}
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              {label}
            </Link>
          ))}

          <Link
            href="/shop"
            className="group relative ml-2 px-5 py-2.5 bg-site-accent hover:bg-red-600 text-white text-[11px] font-bold tracking-[0.2em] uppercase clip-angle-sm transition-all duration-200 glow-red hover:glow-red-lg overflow-hidden"
            style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '14px', letterSpacing: '0.15em' }}
          >
            <span className="relative z-10">▶ КУПИТЬ РАНГ</span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
          </Link>
        </nav>

        {/* Burger */}
        <button
          className="md:hidden text-[#888] hover:text-white transition-colors p-2 relative"
          onClick={() => setOpen(v => !v)}
          aria-label="Меню"
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
        <div className="md:hidden bg-[#070707] border-t border-[#3A1017] px-4 pb-4">
          <div className="pt-2 pb-1 flex items-center gap-2">
            <div className="w-1 h-3 bg-site-accent" />
            <span className="text-[9px] text-[#3A1017] tracking-[0.4em] uppercase" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              НАВИГАЦИЯ
            </span>
          </div>
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 py-3 text-[11px] font-medium uppercase tracking-[0.25em] border-b border-[#3A1017]/40 transition-colors hover:text-site-accent ${
                pathname === href ? 'text-site-accent' : 'text-[#888]'
              }`}
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
              onClick={() => setOpen(false)}
            >
              <span className="text-site-accent/40">//</span>
              {label}
            </Link>
          ))}
          <Link
            href="/shop"
            className="flex items-center justify-center gap-2 mt-4 px-4 py-3.5 bg-site-accent hover:bg-red-600 text-white text-[13px] font-bold uppercase tracking-[0.2em] clip-angle-sm transition-colors glow-red"
            style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.2em' }}
            onClick={() => setOpen(false)}
          >
            ▶ КУПИТЬ РАНГ
          </Link>
        </div>
      )}
    </header>
  )
}
