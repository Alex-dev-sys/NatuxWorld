import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLauncherStore, VERSIONS } from '../store/useLauncherStore';

export function VersionSelector() {
  const [open, setOpen] = useState(false);
  const selected = useLauncherStore((s) => s.selectedVersion);
  const setVersion = useLauncherStore((s) => s.setVersion);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5 text-left text-sm text-white/85 hover:border-white/[0.12] hover:bg-white/[0.05] transition"
      >
        <span className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-primary/15 text-[10px] font-bold uppercase text-primary">
            {selected.loader[0]}
          </span>
          <span className="font-medium">Версия {selected.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl glass-strong shadow-premium"
          >
            <ul className="max-h-64 overflow-y-auto p-1">
              {VERSIONS.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => {
                      setVersion(v);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-white/[0.06]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="grid h-5 w-5 place-items-center rounded-md bg-primary/15 text-[10px] font-bold uppercase text-primary">
                        {v.loader[0]}
                      </span>
                      <span className="text-white/85">{v.label}</span>
                      {v.recommended && (
                        <span className="rounded-md bg-success/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-success">
                          рек.
                        </span>
                      )}
                    </span>
                    {v.id === selected.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
