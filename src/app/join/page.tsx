'use client'

import { useState } from 'react'
import ServerStatus from '@/components/ServerStatus'

const steps = [
  {
    n: 1,
    title: 'Скачай Minecraft Java Edition',
    desc: 'Подойдёт любая версия 1.20.1 и выше. Лицензионный или TLauncher.',
  },
  {
    n: 2,
    title: 'Добавь сервер',
    desc: 'В меню выбери «Мультиплеер» → «Добавить сервер» и введи IP.',
  },
  {
    n: 3,
    title: 'Введи IP сервера',
    desc: 'Скопируй и вставь адрес: mc.natuxworld.ru',
  },
  {
    n: 4,
    title: 'Подключись и играй',
    desc: 'Нажми «Войти» — ты в игре. Добро пожаловать на NATUX WORLD!',
  },
]

export default function JoinPage() {
  const [copied, setCopied] = useState(false)
  const ip = 'mc.natuxworld.ru'

  const copy = () => {
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="font-pixel text-sm md:text-base text-site-accent text-center mb-2">
        КАК ПОДКЛЮЧИТЬСЯ
      </h1>
      <p className="text-site-muted text-sm text-center mb-10">
        Следуй инструкции — это займёт меньше минуты
      </p>

      {/* Server info */}
      <div className="bg-site-block border border-site-border rounded-lg p-6 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <div className="text-site-muted text-xs uppercase tracking-wider mb-1">IP сервера</div>
            <div className="font-mono text-site-accent font-semibold">{ip}</div>
          </div>
          <div>
            <div className="text-site-muted text-xs uppercase tracking-wider mb-1">Версия</div>
            <div className="text-site-text font-medium">1.20.1 – 1.21.x</div>
          </div>
          <div>
            <div className="text-site-muted text-xs uppercase tracking-wider mb-1">Статус</div>
            <ServerStatus compact />
          </div>
        </div>

        <button
          onClick={copy}
          className="w-full flex items-center justify-center gap-2 py-3 border border-site-border hover:border-site-accent rounded transition-colors text-sm text-site-muted hover:text-site-text"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-site-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-site-success">Скопировано!</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Скопировать IP</span>
            </>
          )}
        </button>
      </div>

      {/* Steps */}
      <div className="space-y-4 mb-10">
        {steps.map(step => (
          <div key={step.n} className="flex gap-4 bg-site-block border border-site-border rounded-lg p-5">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-site-secondary border border-site-accent flex items-center justify-center text-site-accent font-bold text-sm">
              {step.n}
            </div>
            <div>
              <div className="font-semibold text-site-text mb-1">{step.title}</div>
              <div className="text-site-muted text-sm">{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Social links */}
      <div className="text-center">
        <p className="text-site-muted text-sm mb-4">Есть вопросы? Мы в соцсетях:</p>
        <div className="flex justify-center gap-4">
          <a
            href="https://vk.com/natuxworld"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 border border-site-border hover:border-site-accent text-site-muted hover:text-site-accent rounded transition-colors text-sm"
          >
            VK
          </a>
        </div>
      </div>
    </div>
  )
}
