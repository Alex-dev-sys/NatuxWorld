export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-28 text-center">
      <div className="font-pixel text-5xl md:text-7xl text-site-accent mb-6 text-glow-red">
        404
      </div>
      <h1 className="font-pixel text-xs md:text-sm text-site-text mb-4">
        СТРАНИЦА НЕ НАЙДЕНА
      </h1>
      <p className="text-site-muted mb-2">
        Эту страницу поглотила Пустота.
      </p>
      <p className="text-site-muted text-sm mb-10">
        Может, её снёс рейд, или она никогда не существовала.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <a
          href="/"
          className="px-6 py-3 bg-site-accent hover:bg-red-600 text-white font-semibold rounded transition-colors glow-red"
        >
          На главную
        </a>
        <a
          href="/shop"
          className="px-6 py-3 border border-site-border hover:border-site-accent text-site-muted hover:text-site-text rounded transition-colors"
        >
          Магазин
        </a>
      </div>
    </div>
  )
}
