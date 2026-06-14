'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

function ToastItem({ item, onRemove }: { item: ToastItem; onRemove: () => void }) {
  useEffect(() => {
    const t = setTimeout(onRemove, 4000)
    return () => clearTimeout(t)
  }, [onRemove])

  const colors: Record<ToastType, string> = {
    success: '#35C759',
    error: '#FF3B30',
    warning: '#eab308',
    info: '#3A1017',
  }

  const markers: Record<ToastType, string> = {
    success: '[ OK ]',
    error: '[ ОШИБКА ]',
    warning: '[ ВНИМАНИЕ ]',
    info: '[ INFO ]',
  }

  const color = colors[item.type]

  return (
    <div
      className="clip-angle-sm flex items-start gap-2 px-4 py-3 max-w-sm animate-slide-in-right"
      style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 12,
        background: '#130a0b',
        border: `1px solid ${color}`,
        borderLeft: `3px solid ${color}`,
        color: '#F2F2F2',
      }}
    >
      <span className="flex-shrink-0 font-bold tracking-wider" style={{ color }}>{markers[item.type]}</span>
      <span className="flex-1">{item.message}</span>
      <button onClick={onRemove} className="flex-shrink-0 opacity-60 hover:opacity-100 ml-2">×</button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-4), { id, message, type }])
  }, [])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(item => (
          <div key={item.id} className="pointer-events-auto">
            <ToastItem item={item} onRemove={() => remove(item.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
