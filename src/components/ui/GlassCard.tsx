import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

type Props = Omit<HTMLMotionProps<'div'>, 'children'> & {
  strong?: boolean;
  glow?: boolean;
  children?: ReactNode;
};

export function GlassCard({ className, strong, glow, children, ...rest }: Props) {
  return (
    <motion.div
      {...rest}
      className={cn(
        'relative overflow-hidden rounded-2xl',
        strong ? 'glass-strong' : 'glass',
        glow && 'glow-red',
        className,
      )}
    >
      <div className="noise" />
      {children}
    </motion.div>
  );
}
