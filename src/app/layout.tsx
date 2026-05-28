import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'NATUX WORLD — Minecraft Server',
  description: 'Minecraft сервер NATUX WORLD. Анархия, PvP, донат-магазин. IP: mc.natuxworld.ru',
  keywords: 'minecraft, server, natux, pvp, anarchy, donate',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-site-bg text-site-text min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
