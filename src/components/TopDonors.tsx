const DONORS = [
  { nick: 'xX_DarkLord_Xx', rank: 'God', color: '#F9FAFB', spent: 8999, emoji: '👑' },
  { nick: 'IronForge228', rank: 'King', color: '#FFD700', spent: 6599, emoji: '🏆' },
  { nick: 'StarlightGG', rank: 'Elite', color: '#FF2B4F', spent: 4999, emoji: '⭐' },
  { nick: 'NightRaider', rank: 'Demon', color: '#C62828', spent: 4399, emoji: '🔥' },
  { nick: 'VoidWalker99', rank: 'Head', color: '#F44336', spent: 3599, emoji: '💀' },
  { nick: 'CreeperSlayer', rank: 'Phantom', color: '#00BCD4', spent: 3099, emoji: '👻' },
  { nick: 'DiamondBlade', rank: 'Squid', color: '#FF9800', spent: 2599, emoji: '🦑' },
]

export default function TopDonors() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-16">
      <h2 className="font-pixel text-xs md:text-sm text-site-accent text-center mb-2">
        ЗАЛ ЧЕСТИ
      </h2>
      <p className="text-site-muted text-sm text-center mb-10">
        Игроки, которые держат NATUX WORLD живым
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {DONORS.map((d, i) => (
          <div
            key={d.nick}
            className={`bg-site-block border rounded-lg px-4 py-4 flex items-center gap-3 hover:border-opacity-80 transition-colors ${
              i === 0 ? 'border-yellow-500/60' : 'border-site-border'
            }`}
            style={i === 0 ? { boxShadow: '0 0 20px rgba(255,215,0,0.15)' } : {}}
          >
            <span className="text-2xl flex-shrink-0">{d.emoji}</span>
            <div className="min-w-0">
              <div className="font-mono font-semibold text-sm text-site-text truncate">{d.nick}</div>
              <div className="text-xs font-semibold" style={{ color: d.color }}>{d.rank}</div>
            </div>
            {i === 0 && (
              <span className="ml-auto text-yellow-400 text-xs font-bold flex-shrink-0">№1</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-site-muted text-xs text-center mt-6 opacity-60">
        Купи ранг — и твоё имя появится здесь
      </p>
    </section>
  )
}
