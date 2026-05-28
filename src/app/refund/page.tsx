export const metadata = {
  title: 'Возврат средств — NATUX WORLD',
}

export default function RefundPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="font-pixel text-xs md:text-sm text-site-accent text-center mb-2">
        ПРАВИЛА ВОЗВРАТА
      </h1>
      <p className="text-site-muted text-xs text-center mb-10">
        Прочитай перед покупкой
      </p>

      <div className="mb-8 p-4 bg-site-secondary border border-site-dark-red/50 rounded-lg">
        <p className="text-site-text text-sm font-semibold mb-1">Важно</p>
        <p className="text-site-muted text-sm">
          Привилегии — цифровой товар. После активации отменить покупку нельзя, кроме случаев технической ошибки.
          Убедись в правильности ника перед оплатой.
        </p>
      </div>

      <div className="space-y-4 text-sm">
        {[
          {
            icon: '✅',
            title: 'Когда возврат возможен',
            items: [
              'Привилегии не были активированы в течение 24 часов после оплаты',
              'Ранг активирован не тому игроку по вине системы',
              'Двойное списание средств',
              'Технический сбой на стороне сервера привёл к невозможности использования',
            ],
            good: true,
          },
          {
            icon: '❌',
            title: 'Когда возврат невозможен',
            items: [
              'Игрок передумал после активации',
              'Игрок указал неверный ник (проверяй перед оплатой)',
              'Игрок был заблокирован за нарушение правил',
              'Истёк срок действия временного ранга',
              'Покупка была сделана в подарок и уже активирована',
            ],
            good: false,
          },
        ].map(({ icon, title, items, good }) => (
          <div key={title} className="bg-site-block border border-site-border rounded-lg p-5">
            <h2 className="font-semibold text-site-text mb-4 flex items-center gap-2">
              <span>{icon}</span> {title}
            </h2>
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item} className="flex items-start gap-2 text-site-muted">
                  <span className={good ? 'text-site-success' : 'text-site-danger'}>›</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="bg-site-block border border-site-border rounded-lg p-5">
          <h2 className="font-semibold text-site-text mb-3">Как запросить возврат</h2>
          <ol className="space-y-2 text-site-muted">
            <li className="flex gap-2"><span className="text-site-accent font-bold">1.</span> Напишите в поддержку в VK: <a href="https://vk.com/natuxworld" className="text-site-accent hover:underline">vk.com/natuxworld</a></li>
            <li className="flex gap-2"><span className="text-site-accent font-bold">2.</span> Укажите номер заказа и Minecraft-ник</li>
            <li className="flex gap-2"><span className="text-site-accent font-bold">3.</span> Опишите проблему</li>
            <li className="flex gap-2"><span className="text-site-accent font-bold">4.</span> Мы рассмотрим обращение в течение 5 рабочих дней</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
