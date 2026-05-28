import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-site-block border-t border-site-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="font-pixel text-site-accent text-xs mb-2">NATUX WORLD</p>
            <p className="text-site-muted text-xs">© 2024 natuxworld.ru — No rules. No mercy.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 text-xs text-site-muted">
            <Link href="/rules" className="hover:text-site-accent transition-colors">Правила</Link>
            <Link href="/join" className="hover:text-site-accent transition-colors">Подключиться</Link>
            <Link href="/shop" className="hover:text-site-accent transition-colors">Магазин</Link>
            <a
              href="https://vk.com/natuxworld"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-site-accent transition-colors"
            >
              VK
            </a>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-site-border/50 text-center">
          <p className="text-site-muted text-xs opacity-60">
            Не является официальным сервером Mojang / Microsoft
          </p>
        </div>
      </div>
    </footer>
  )
}
