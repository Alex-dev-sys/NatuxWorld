'use client'

// Client-only обёртки для 3D-компонентов (WebGL не рендерится на сервере).
// next/dynamic ssr:false держит three вне серверного бандла и убирает риск
// hydration mismatch.

import dynamic from 'next/dynamic'

export const RankModel3D = dynamic(() => import('./RankModel3D'), {
  ssr: false,
  loading: () => null,
})

export const Hero3D = dynamic(() => import('./Hero3D'), {
  ssr: false,
  loading: () => null,
})
