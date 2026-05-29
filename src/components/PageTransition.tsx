'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [show, setShow] = useState(true)
  const [key, setKey] = useState(0)

  useEffect(() => {
    setShow(false)
    const t = setTimeout(() => {
      setKey(k => k + 1)
      setShow(true)
    }, 40)
    return () => clearTimeout(t)
  }, [pathname])

  return (
    <div
      key={key}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.28s ease, transform 0.28s ease',
      }}
    >
      {children}
    </div>
  )
}
