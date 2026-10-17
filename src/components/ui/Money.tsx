import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Euro amount from cents that eases between values when it changes. */
export function Money({ minor, className, exact }: { minor: number | null; className?: string; exact?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(minor);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    const from = prev.current;
    prev.current = minor;
    if (!el || minor === null || from === null || from === minor || reduce) {
      if (el) el.textContent = formatMoney(minor, { exact });
      return;
    }
    const controls = animate(from, minor, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: v => {
        el.textContent = formatMoney(Math.round(v), { exact });
      },
      onComplete: () => {
        el.textContent = formatMoney(minor, { exact });
      },
    });
    return () => controls.stop();
  }, [minor, reduce, exact]);

  return (
    <span ref={ref} className={cn('tabular', className)}>
      {formatMoney(minor, { exact })}
    </span>
  );
}
