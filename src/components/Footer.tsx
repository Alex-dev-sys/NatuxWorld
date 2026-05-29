import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-[#0a0a0a] border-t border-site-border mt-auto">
      {/* Top accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-site-accent to-transparent" />

      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">

          {/* Brand */}
          <div>
            <p
              className="text-5xl text-white mb-1 tracking-wider"
              style={{ fontFamily: '"Bebas Neue", sans-serif' }}
            >
              NATUX
            </p>
            <p
              className="text-xs text-site-accent tracking-[0.5em] uppercase mb-4"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              WORLD
            </p>
            <p className="text-site-muted text-xs leading-relaxed mb-3 border-l-2 border-site-border pl-3"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              Анархичный Minecraft-сервер.<br />
              <span className="text-site-accent">No rules. No mercy.</span>
            </p>
            <p
              className="text-site-accent text-xs mt-3 cursor-blink"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              mc.natuxworld.ru
            </p>
          </div>

          {/* Navigation */}
          <div>
            <p
              className="text-site-muted text-[10px] uppercase tracking-[0.3em] mb-4"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              // навигация
            </p>
            <ul className="space-y-2">
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
                    className="text-xs text-site-muted hover:text-site-accent transition-colors duration-200 flex items-center gap-2 group"
                    style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    <span className="text-site-border group-hover:text-site-accent transition-colors">›</span>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p
              className="text-site-muted text-[10px] uppercase tracking-[0.3em] mb-4"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              // документы
            </p>
            <ul className="space-y-2">
              {[
                { href: '/offer', label: 'Публичная оферта' },
                { href: '/privacy', label: 'Политика конфиденциальности' },
                { href: '/refund', label: 'Правила возврата' },
                { href: 'https://vk.com/natuxworld', label: 'Поддержка в VK', external: true },
              ].map(({ href, label, external }) => (
                <li key={href}>
                  {external ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-site-muted hover:text-site-accent transition-colors duration-200 flex items-center gap-2 group"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      <span className="text-site-border group-hover:text-site-accent transition-colors">›</span>
                      {label}
                    </a>
                  ) : (
                    <Link
                      href={href}
                      className="text-xs text-site-muted hover:text-site-accent transition-colors duration-200 flex items-center gap-2 group"
                      style={{ fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      <span className="text-site-border group-hover:text-site-accent transition-colors">›</span>
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-site-border/40 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p
            className="text-site-muted text-[10px] tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            © 2025 natuxworld.ru — <span className="text-site-border">CLASSIFIED</span>
          </p>
          <p
            className="text-site-border text-[10px] tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            Не является официальным сервером Mojang / Microsoft
          </p>
        </div>
      </div>
    </footer>
  )
}
