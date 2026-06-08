import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { NewsItem } from '../../electron/services/NewsService';

export function NewsModal({ item, onClose }: { item: NewsItem | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[640px] max-w-[90vw] overflow-hidden rounded-2xl glass-strong shadow-premium"
          >
            <div className="relative h-48 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/50 to-primary-glow/20" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,0,55,0.4),transparent_60%)]" />
              <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
              <button
                onClick={onClose}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-black/40 text-white/80 hover:bg-black/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-3 left-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                {item.date}
              </div>
            </div>
            <div className="p-6">
              <h2 className="font-display text-3xl tracking-wide text-white">{item.title}</h2>
              <p className="mt-3 text-sm text-muted leading-relaxed">{item.body}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
