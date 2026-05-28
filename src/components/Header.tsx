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
    <header className="sticky top-0 z-50 bg-site-block border-b border-site-border border-top-accent">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <Image
            src="/logo.png"
            alt="NATUX WORLD"
            width={40}
            height={40}
            className="rounded-md group-hover:scale-105 transition-transform"
            priority
          />
          <span className="font-pixel text-site-accent text-xs md:text-sm group-hover:text-white transition-colors">
            NATUX WORLD
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-5">
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-medium transition-colors hover:text-site-accent ${
                pathname === href ? 'text-site-accent' : 'text-site-muted'
              }`}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/shop"
            className="ml-2 px-4 py-2 bg-site-accent hover:bg-red-600 text-white text-sm font-semibold rounded transition-colors glow-red"
          >
            Купить ранг
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
        <div className="md:hidden bg-site-block border-t border-site-border px-4 pb-4">
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block py-3 text-sm font-medium border-b border-site-border/50 transition-colors hover:text-site-accent ${
                pathname === href ? 'text-site-accent' : 'text-site-muted'
              }`}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/shop"
            className="block mt-3 px-4 py-2 bg-site-accent text-white text-sm font-semibold rounded text-center hover:bg-red-600 transition-colors"
            onClick={() => setOpen(false)}
          >
            Купить ранг
          </Link>
        </div>
      )}
    </header>
  )
}
