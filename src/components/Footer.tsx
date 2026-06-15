import Link from 'next/link'

const NAV_LINKS = [
  { href: '/shop', label: 'Магазин' },
  { href: '/news', label: 'Новости' },
  { href: '/leaderboard', label: 'Лидерборд' },
  { href: '/rules', label: 'Правила' },
  { href: '/join', label: 'Подключиться' },
  { href: '/compare', label: 'Сравнение рангов' },
  { href: '/map', label: 'Карта' },
]

const LEGAL_LINKS = [
  { href: '/offer', label: 'Публичная оферта' },
  { href: '/privacy', label: 'Политика конфиденциальности' },
  { href: '/refund', label: 'Правила возврата' },
]

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <span className="w-px h-3 bg-site-accent" />
      <p className="text-[9px] uppercase tracking-[0.4em] text-site-accent" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        {'// '}
        {children}
      </p>
      <span className="ftr-rule h-px flex-1 bg-gradient-to-r from-[#3A1017] to-transparent" />
    </div>
  )
}

export default function Footer() {
  return (
    <footer className="ftr-root bg-[#070707] border-t border-[#3A1017] mt-auto relative overflow-hidden">
      <div className="h-px bg-site-accent" />
      <div className="absolute inset-0 grid-bg-dense opacity-20 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 pt-12 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">

          {/* Brand */}
          <div className="ftr-brand relative pt-3 pl-3">
            {/* Corner bracket framing the brand block */}
            <span className="ftr-bracket ftr-bracket--tl" />
            <div className="mb-1 leading-none">
              <span
                className="text-[56px] leading-none text-white tracking-wider"
                style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.08em' }}
              >
                NATUX
              </span>
            </div>
            <div className="flex items-center gap-2 mb-5">
              <span
                className="text-[11px] text-site-accent tracking-[0.6em] uppercase"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                WORLD
              </span>
              <span
                className="text-[8px] text-[#888] tracking-[0.2em] uppercase border border-[#3A1017] px-1.5 py-0.5 clip-angle-sm"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                EST. 2025
              </span>
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
              <span className="w-1.5 h-1.5 bg-site-accent rounded-full animate-pulse-dot" />
              <span
                className="text-site-accent text-[11px] tracking-wider cursor-blink"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                mc.vibestudy.ru
              </span>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <SectionLabel>НАВИГАЦИЯ</SectionLabel>
            <ul className="space-y-3">
              {NAV_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="ftr-link text-[11px] text-[#888] hover:text-site-accent transition-colors duration-200 flex items-center gap-3 group"
                    style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    <span className="text-[#3A1017] group-hover:text-site-accent transition-colors font-bold">{'//'}</span>
                    <span className="ftr-link-label">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <SectionLabel>СВЯЗЬ</SectionLabel>
            <div className="space-y-3">
              {/* Discord */}
              <a
                href="https://discord.gg/natuxworld"
                target="_blank"
                rel="noopener noreferrer"
                className="ftr-social clip-angle-sm relative flex items-center gap-3 px-4 py-3 border border-[#3A1017] bg-[#130a0b] hover:border-[#FF2B4F] hover:bg-[#130000] transition-all duration-200 overflow-hidden"
                style={{ textDecoration: 'none' }}
              >
                <span className="ftr-social-sweep absolute inset-0 pointer-events-none" />
                <svg className="relative z-10" width="18" height="18" viewBox="0 0 24 24" fill="#5865F2">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.113 18.1.133 18.115a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                </svg>
                <div className="relative z-10">
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 700, color: '#FFFFFF' }}>DISCORD</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#888', letterSpacing: '0.1em' }}>Чат · Ивенты · Поддержка</div>
                </div>
                <span className="ftr-social-arrow relative z-10 ml-auto text-[#3A1017] text-[12px] transition-all duration-200" style={{ fontFamily: '"JetBrains Mono", monospace' }}>↗</span>
              </a>

              {/* VK */}
              <a
                href="https://vk.com/natuxworld"
                target="_blank"
                rel="noopener noreferrer"
                className="ftr-social clip-angle-sm relative flex items-center gap-3 px-4 py-3 border border-[#3A1017] bg-[#130a0b] hover:border-[#FF2B4F] hover:bg-[#130000] transition-all duration-200 overflow-hidden"
                style={{ textDecoration: 'none' }}
              >
                <span className="ftr-social-sweep absolute inset-0 pointer-events-none" />
                <svg className="relative z-10" width="18" height="18" viewBox="0 0 24 24" fill="#4C75A3">
                  <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.714-1.033-1.01-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.594v1.566c0 .424-.135.678-1.253.678-1.846 0-3.896-1.12-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.743c.372 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.253-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.762-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.78 1.202 1.253.745.847 1.32 1.558 1.473 2.049.17.474-.085.712-.576.712z"/>
                </svg>
                <div className="relative z-10">
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 700, color: '#FFFFFF' }}>ВКонтакте</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: '#888', letterSpacing: '0.1em' }}>Новости · Поддержка</div>
                </div>
                <span className="ftr-social-arrow relative z-10 ml-auto text-[#3A1017] text-[12px] transition-all duration-200" style={{ fontFamily: '"JetBrains Mono", monospace' }}>↗</span>
              </a>
            </div>
          </div>

          {/* Legal */}
          <div>
            <SectionLabel>ДОКУМЕНТЫ</SectionLabel>
            <ul className="space-y-3">
              {LEGAL_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="ftr-link text-[11px] text-[#888] hover:text-site-accent transition-colors duration-200 flex items-center gap-3 group"
                    style={{ fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    <span className="text-[#3A1017] group-hover:text-site-accent transition-colors font-bold">{'//'}</span>
                    <span className="ftr-link-label">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[#3A1017]/60 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-1 h-3 bg-[#3A1017]" />
            <p
              className="text-[#3A1017] text-[10px] tracking-[0.3em] uppercase"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              © 2025 vibestudy.ru — <span className="text-site-accent/40">CLASSIFIED</span>
            </p>
          </div>
          <p
            className="text-[#3A1017] text-[10px] tracking-wider"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}
          >
            Не является официальным сервером Mojang / Microsoft
          </p>
        </div>

        {/* Transmission line */}
        <div className="ftr-transmission mt-6 flex items-center gap-3 overflow-hidden" aria-hidden="true">
          <span className="text-[8px] text-[#3A1017] tracking-[0.3em] uppercase shrink-0" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            {'// TRANSMISSION'}
          </span>
          <span className="ftr-transmission-track flex-1 h-px relative overflow-hidden">
            <span className="ftr-transmission-beam absolute inset-y-0 w-1/3" />
          </span>
          <span className="w-1.5 h-1.5 bg-site-accent/60 animate-pulse-dot shrink-0" />
        </div>
      </div>

      <style>{`
        .ftr-bracket {
          position: absolute;
          width: 12px;
          height: 12px;
          border: 0 solid #FF2B4F;
        }
        .ftr-bracket--tl { top: 0; left: 0; border-width: 2px 0 0 2px; }

        .ftr-link-label {
          position: relative;
          transition: letter-spacing 0.2s ease;
        }
        .ftr-link:hover .ftr-link-label { letter-spacing: 0.04em; }

        .ftr-social-sweep {
          background: linear-gradient(120deg, transparent 30%, rgba(255,43,79,0.08) 50%, transparent 70%);
          transform: translateX(-130%);
        }
        .ftr-social:hover .ftr-social-sweep { animation: ftr-sweep 0.8s ease forwards; }
        @keyframes ftr-sweep { to { transform: translateX(130%); } }

        .ftr-social:hover .ftr-social-arrow {
          color: #FF2B4F;
          transform: translate(2px, -2px);
        }

        .ftr-transmission-track {
          background: linear-gradient(90deg, transparent, rgba(58,16,23,0.9), transparent);
        }
        .ftr-transmission-beam {
          background: linear-gradient(90deg, transparent, rgba(255,43,79,0.7), transparent);
          animation: ftr-transmit 4.5s linear infinite;
        }
        @keyframes ftr-transmit {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }

        @media (prefers-reduced-motion: reduce) {
          .ftr-social-sweep { display: none; }
          .ftr-transmission-beam { animation: none; opacity: 0.4; }
        }
      `}</style>
    </footer>
  )
}
