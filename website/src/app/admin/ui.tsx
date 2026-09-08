'use client'

import { useEffect } from 'react'

export function StatCard({ label, value, sub, color = 'text-site-text' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-site-block border border-site-border rounded-lg p-4">
      <div className="text-site-muted text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-site-muted text-xs mt-1">{sub}</div>}
    </div>
  )
}

export function Table({ cols, children, empty }: { cols: string[]; children: React.ReactNode; empty?: string }) {
  const isEmpty = !children || (Array.isArray(children) && children.filter(Boolean).length === 0)
  return (
    <div className="bg-site-block border border-site-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-site-border text-site-muted text-xs uppercase tracking-wider">
              {cols.map(c => <th key={c} className="text-left px-4 py-3 font-medium whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>{isEmpty ? null : children}</tbody>
        </table>
        {isEmpty && <div className="py-8 text-center text-site-muted text-sm">{empty ?? 'Нет данных'}</div>}
      </div>
    </div>
  )
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-site-border/40 hover:bg-white/[0.02] transition-colors">{children}</tr>
}
export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-site-bg border border-site-border rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-site-border shrink-0">
          <h2 className="font-pixel text-sm text-site-text">{title}</h2>
          <button onClick={onClose} className="text-site-muted hover:text-site-text transition-colors text-lg leading-none px-2">x</button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}
