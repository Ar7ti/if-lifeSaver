import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type PillTone = 'neutral' | 'blue' | 'yellow' | 'peach' | 'ok' | 'warn' | 'danger' | 'midnight' | 'outline';

const tones: Record<PillTone, string> = {
  neutral: 'bg-ink/[0.06] text-ink/80',
  blue: 'bg-sky-tint text-blue-ink',
  yellow: 'bg-marigold text-ink',
  peach: 'bg-peach text-ink',
  ok: 'bg-ok-tint text-ok-ink',
  warn: 'bg-warn-tint text-warn-ink',
  danger: 'bg-danger-tint text-danger-ink',
  midnight: 'bg-midnight text-white',
  outline: 'border border-hairline-strong text-ink/80',
};

export function Pill({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
