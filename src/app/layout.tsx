import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SaleBanner from '@/components/SaleBanner'
import { ToastProvider } from '@/components/Toast'

export const metadata: Metadata = {
  title: {
    default: 'NATUX WORLD — Minecraft Server',
    template: '%s — NATUX WORLD',
  },
  description: 'Minecraft сервер NATUX WORLD. Анархия, PvP, донат-магазин. IP: mc.natuxworld.ru',
  keywords: 'minecraft, server, natux, pvp, anarchy, donate',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'NATUX WORLD — Minecraft Server',
    description: 'Анархичный Minecraft-сервер без правил. IP: mc.natuxworld.ru',
    siteName: 'NATUX WORLD',
    images: [{ url: '/logo.png', width: 1080, height: 1080, alt: 'NATUX WORLD' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-site-bg text-site-text min-h-screen flex flex-col font-mono-code">
        <ToastProvider>
          <SaleBanner />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  )
}
