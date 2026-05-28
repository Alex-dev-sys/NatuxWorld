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

  const styles: Record<ToastType, string> = {
    success: 'bg-site-success text-black',
    error: 'bg-site-danger text-white',
    warning: 'bg-yellow-500 text-black',
    info: 'bg-site-block border border-site-border text-site-text',
  }

  const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  }

  return (
    <div
      className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium max-w-sm animate-slide-in-right ${styles[item.type]}`}
    >
      <span className="flex-shrink-0 font-bold">{icons[item.type]}</span>
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
