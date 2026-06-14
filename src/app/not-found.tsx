import Link from 'next/link'
import dynamic from 'next/dynamic'

const NotFound3D = dynamic(() => import('@/components/three/NotFound3D'), { ssr: false })

export default function NotFound() {
  return (
    <section className="relative overflow-hidden min-h-[80vh] flex flex-col items-center justify-center scanline">
      {/* 3D voxel backdrop */}
      <NotFound3D />
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(139,0,24,0.2)_0%,transparent_70%)]" />
      <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-site-accent/50" />
      <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-site-accent/50" />
      <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-site-accent/50" />
      <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-site-accent/50" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-20 text-center animate-fade-in-up">
        <div
          className="text-[10px] text-site-accent tracking-[0.4em] uppercase mb-6"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {'// ОШИБКА 404'}
        </div>

        <h1
          className="glitch font-display text-[clamp(100px,25vw,220px)] leading-none text-site-accent text-glow-red-lg mb-4"
          data-text="404"
          style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em' }}
        >
          404
        </h1>

        <div
          className="font-display text-2xl md:text-4xl text-white mb-6"
          style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.1em' }}
        >
          ОБЪЕКТ НЕ НАЙДЕН ИЛИ ЗАСЕКРЕЧЕН
        </div>

        <p
          className="text-[11px] text-site-muted tracking-[0.2em] uppercase mb-12 cursor-blink"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        >
          {'> ЗАПРОШЕННЫЙ ФАЙЛ ОТСУТСТВУЕТ В АРХИВЕ'}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/"
            className="px-10 py-4 bg-site-accent hover:bg-red-600 text-white font-bold clip-angle transition-all duration-200 glow-red hover:glow-red-lg uppercase tracking-widest"
            style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '18px', letterSpacing: '0.2em' }}
          >
            НА ГЛАВНУЮ
          </Link>
          <Link
            href="/shop"
            className="px-10 py-4 border border-[#3A1017] hover:border-site-accent text-site-muted hover:text-site-text clip-angle transition-all duration-200 uppercase tracking-widest"
            style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', letterSpacing: '0.25em' }}
          >
            В МАГАЗИН
          </Link>
        </div>
      </div>
    </section>
  )
}
