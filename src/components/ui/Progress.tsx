import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

export function Progress({ value, max = 100, tone = 'blue', label, className, height = 6 }: {
  value: number;
  max?: number;
  tone?: 'blue' | 'ink' | 'warn' | 'danger' | 'ok' | 'sky' | 'marigold';
  label: string;
  className?: string;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const fills = { blue: 'bg-blue', ink: 'bg-ink/80', warn: 'bg-saffron', danger: 'bg-coral', ok: 'bg-ok-fill', sky: 'bg-sky-wash', marigold: 'bg-marigold' };
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('w-full overflow-hidden rounded-full bg-ink/[0.07]', className)}
      style={{ height }}
    >
      <motion.div
        className={cn('h-full rounded-full', fills[tone])}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
