import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../utils/cn';

type Props = HTMLMotionProps<'div'> & {
  strong?: boolean;
  glow?: boolean;
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
