import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-site-block border-t border-site-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <p className="font-pixel text-site-accent text-xs mb-3">NATUX WORLD</p>
            <p className="text-site-muted text-xs leading-relaxed mb-3">
              Анархичный Minecraft-сервер.<br />
              No rules. No mercy.
            </p>
            <p className="font-mono text-site-accent text-xs">mc.natuxworld.ru</p>
          </div>

          {/* Navigation */}
          <div>
            <p className="text-site-muted text-xs uppercase tracking-wider mb-3">Навигация</p>
            <ul className="space-y-2">
              {[
                { href: '/shop', label: 'Магазин' },
                { href: '/compare', label: 'Сравнение рангов' },
                { href: '/rules', label: 'Правила' },
                { href: '/join', label: 'Подключиться' },
                { href: '/map', label: 'Карта' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-xs text-site-muted hover:text-site-accent transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-site-muted text-xs uppercase tracking-wider mb-3">Документы</p>
            <ul className="space-y-2">
              {[
                { href: '/offer', label: 'Публичная оферта' },
                { href: '/privacy', label: 'Политика конфиденциальности' },
                { href: '/refund', label: 'Правила возврата' },
                { href: 'https://vk.com/natuxworld', label: 'Поддержка в VK', external: true },
              ].map(({ href, label, external }) => (
                <li key={href}>
                  {external ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-site-muted hover:text-site-accent transition-colors">
                      {label}
                    </a>
                  ) : (
                    <Link href={href} className="text-xs text-site-muted hover:text-site-accent transition-colors">
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-site-border/50 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-site-muted text-xs">© 2025 natuxworld.ru</p>
          <p className="text-site-muted text-xs opacity-50">
            Не является официальным сервером Mojang / Microsoft
          </p>
        </div>
      </div>
    </footer>
  )
}
