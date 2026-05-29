import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-[#070707] border-t border-[#3A1017] mt-auto relative overflow-hidden">
      {/* Top accent line */}
      <div className="h-px bg-site-accent" />

      {/* Subtle grid bg */}
      <div className="absolute inset-0 grid-bg-dense opacity-20 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 pt-12 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">

          {/* Brand */}
          <div>
            <div className="mb-1">
              <span
                className="text-[56px] leading-none text-white tracking-wider"
                style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.08em' }}
              >
                NATUX
              </span>
            </div>
            <div
              className="text-[11px] text-site-accent tracking-[0.6em] uppercase mb-5"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              WORLD
            </div>

            <div className="border-l-2 border-site-accent pl-4 mb-5">
              <p
                className="text-[#888] text-[11px] leading-relaxed"
                style={{ fontFamily: '"JetBrains Mono", monospace', lineHeight: '1.8' }}
              >
                Анархичный Minecraft-сервер.<br />
                <span className="text-site-accent">No rules. No mercy.</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-site-accent rounded-full animate-pulse-dot" />
              <span
                className="text-site-accent text-[11px] tracking-wider cursor-blink"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                mc.natuxworld.ru
              </span>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-px h-3 bg-site-accent" />
              <p
                className="text-[9px] uppercase tracking-[0.4em] text-site-accent"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                НАВИГАЦИЯ
              </p>
            </div>
            <ul className="space-y-3">
              {[
                { href: '/shop', label: 'Магазин' },
                { href: '/compare', label: 'Сравнение рангов' },
                { href: '/rules', label: 'Правила' },
                { href: '/join', label: 'Подключиться' },
                { href: '/map', label: 'Карта' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-[11px] text-[#888] hover:text-site-accent transition-colors duration-200 flex items-center gap-3 group"
                    style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    <span className="text-[#3A1017] group-hover:text-site-accent transition-colors font-bold">//</span>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-px h-3 bg-site-accent" />
              <p
                className="text-[9px] uppercase tracking-[0.4em] text-site-accent"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                ДОКУМЕНТЫ
              </p>
            </div>
            <ul className="space-y-3">
              {[
                { href: '/offer', label: 'Публичная оферта', external: false },
                { href: '/privacy', label: 'Политика конфиденциальности', external: false },
                { href: '/refund', label: 'Правила возврата', external: false },
                { href: 'https://vk.com/natuxworld', label: 'Поддержка в VK', external: true },
              ].map(({ href, label, external }) => (
                <li key={href}>
                  {external ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#888] hover:text-site-accent transition-colors duration-200 flex items-center gap-3 group"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      <span className="text-[#3A1017] group-hover:text-site-accent transition-colors font-bold">//</span>
                      {label}
                    </a>
                  ) : (
                    <Link
                      href={href}
                      className="text-[11px] text-[#888] hover:text-site-accent transition-colors duration-200 flex items-center gap-3 group"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      <span className="text-[#3A1017] group-hover:text-site-accent transition-colors font-bold">//</span>
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[#3A1017]/60 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-3 bg-[#3A1017]" />
            <p
              className="text-[#3A1017] text-[10px] tracking-[0.3em] uppercase"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              © 2025 natuxworld.ru — <span className="text-site-accent/40">CLASSIFIED</span>
            </p>
          </div>
          <p
            className="text-[#3A1017] text-[10px] tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            Не является официальным сервером Mojang / Microsoft
          </p>
        </div>
      </div>
    </footer>
  )
}
