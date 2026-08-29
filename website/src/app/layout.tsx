import type { Metadata, Viewport } from 'next'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import PageTransition from '@/components/PageTransition'
import { ToastProvider } from '@/components/Toast'
import { BRAND } from '@/lib/brand'

export const viewport: Viewport = {
  themeColor: '#070707',
}

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteOrigin),
  title: {
    default: `${BRAND.name} — Minecraft Server`,
    template: `%s — ${BRAND.name}`,
  },
  description: `Minecraft сервер ${BRAND.name}. Анархия, PvP, донат-магазин. IP: ${BRAND.serverHost}`,
  keywords: 'minecraft, server, natux, pvp, anarchy, donate',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: `${BRAND.name} — Minecraft Server`,
    description: `Анархичный Minecraft-сервер без правил. IP: ${BRAND.serverHost}`,
    siteName: BRAND.name,
    images: [{ url: '/logo.png', width: 1080, height: 1080, alt: BRAND.name }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-site-bg text-site-text min-h-screen flex flex-col font-mono-code">
        <ToastProvider>
          <Header />
          <main className="flex-1"><PageTransition>{children}</PageTransition></main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  )
}
