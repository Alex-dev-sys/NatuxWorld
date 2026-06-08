import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../utils/cn';
import type { ReactNode } from 'react';

type Variant = 'ghost' | 'glass' | 'primary' | 'discord';

type Props = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: Variant;
  icon?: ReactNode;
  children?: ReactNode;
};

const styles: Record<Variant, string> = {
  ghost:
    'bg-transparent hover:bg-white/5 text-white/80 hover:text-white border border-transparent',
  glass:
    'glass text-white/90 hover:text-white hover:border-white/15',
  primary:
    'bg-play-gradient text-white shadow-glow hover:shadow-glow-strong',
  discord: 'bg-discord text-white hover:brightness-110',
};

export function Button({ variant = 'glass', className, icon, children, ...rest }: Props) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
        styles[variant],
        className,
      )}
    >
      {icon}
      {children}
    </motion.button>
  );
}
