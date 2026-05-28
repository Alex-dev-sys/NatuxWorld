export const metadata = {
  title: 'Карта — NATUX WORLD',
}

export default function MapPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center">
      <h1 className="font-pixel text-sm md:text-base text-site-accent mb-4">
        КАРТА МИРА
      </h1>
      <p className="text-site-muted mb-10 text-sm">
        Онлайн-карта мира NATUX WORLD
      </p>

      <div className="bg-site-block border border-site-border rounded-lg p-12 flex flex-col items-center gap-4">
        <div className="text-6xl opacity-40">🗺️</div>
        <h2 className="text-site-text font-semibold">Карта временно недоступна</h2>
        <p className="text-site-muted text-sm max-w-md">
          Интерактивная карта мира (Dynmap / BlueMap) будет добавлена после запуска сервера.
          Следи за обновлениями в VK.
        </p>
        <a
          href="https://vk.com/natuxworld"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 px-6 py-2 border border-site-border hover:border-site-accent text-site-muted hover:text-site-accent rounded transition-colors text-sm"
        >
          Перейти в VK
        </a>
      </div>
    </div>
  )
}
