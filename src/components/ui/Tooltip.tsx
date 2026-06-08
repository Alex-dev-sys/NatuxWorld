import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-card-2 px-2 py-1 text-[11px] font-medium text-white/80 ring-1 ring-white/10 shadow-premium z-50"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
