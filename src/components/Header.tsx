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
    <header className="sticky top-0 z-50 bg-site-block/95 backdrop-blur-sm border-b border-site-border border-top-accent">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <div className="relative">
            <Image
              src="/logo.png"
              alt="NATUX WORLD"
              width={36}
              height={36}
              className="group-hover:scale-110 transition-transform duration-200"
              style={{ imageRendering: 'pixelated' }}
              priority
            />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display text-2xl text-site-accent tracking-wider group-hover:text-glow-red transition-all duration-200"
              style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.12em' }}>
              NATUX
            </span>
            <span className="font-pixel text-[6px] text-site-muted tracking-[0.3em] group-hover:text-site-accent transition-colors duration-200">
              WORLD
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-underline text-xs tracking-widest uppercase font-semibold transition-colors duration-200 pb-0.5 ${
                pathname === href
                  ? 'text-site-accent active'
                  : 'text-site-muted hover:text-site-text'
              }`}
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              {label}
            </Link>
          ))}

          <Link
            href="/shop"
            className="ml-2 px-5 py-2 bg-site-accent hover:bg-red-600 text-white text-xs font-bold tracking-widest uppercase clip-angle-sm transition-all duration-200 glow-red hover:glow-red-lg"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            ▶ КУПИТЬ РАНГ
          </Link>
        </nav>

        {/* Burger */}
        <button
          className="md:hidden text-site-muted hover:text-white transition-colors p-2"
          onClick={() => setOpen(v => !v)}
          aria-label="Меню"
        >
          {open ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-[#0a0a0a] border-t border-site-border px-4 pb-4">
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 py-3 text-xs font-semibold uppercase tracking-widest border-b border-site-border/40 transition-colors hover:text-site-accent ${
                pathname === href ? 'text-site-accent' : 'text-site-muted'
              }`}
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
              onClick={() => setOpen(false)}
            >
              <span className="text-site-border">/</span>
              {label}
            </Link>
          ))}
          <Link
            href="/shop"
            className="block mt-4 px-4 py-3 bg-site-accent text-white text-xs font-bold uppercase tracking-widest text-center clip-angle-sm hover:bg-red-600 transition-colors glow-red"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
            onClick={() => setOpen(false)}
          >
            ▶ КУПИТЬ РАНГ
          </Link>
        </div>
      )}
    </header>
  )
}
