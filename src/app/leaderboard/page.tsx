import type { Metadata } from 'next'
import LeaderboardClient from '@/components/LeaderboardClient'

export const metadata: Metadata = {
  title: 'Лидерборд',
  description: 'Таблица лидеров NATUX WORLD — лучшие игроки по убийствам, времени онлайн и K/D рейтингу.',
}

export default function LeaderboardPage() {
  return <LeaderboardClient />
}
