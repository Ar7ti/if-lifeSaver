import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';

export interface Slice {
  id: string;
  label: string;
  minor: number;
  /** A CSS color (token var). */
  color: string;
}

const R = 42;
const C = 2 * Math.PI * R;
const GAP = 2.2; // surface gap between segments, in px of arc length

/**
 * Part-to-whole donut. Identity is never color-alone: the legend beside it lists every
 * slice with its amount, and hovering or focusing a legend row highlights the slice.
 */
export function BudgetDonut({ slices, total, centerLabel }: { slices: Slice[]; total: number; centerLabel: string }) {
  const [active, setActive] = useState<string | null>(null);
  const visible = slices.filter(s => s.minor > 0);
  const sum = Math.max(total, visible.reduce((a, s) => a + s.minor, 0), 1);
  let offset = 0;
  const current = visible.find(s => s.id === active);

  return (
    <div className="flex flex-col items-center gap-6 @md:flex-row @md:items-center">
      <div className="relative size-44 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={visible.map(s => `${s.label} ${formatMoney(s.minor)}`).join(', ')}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(0 0 0 / 0.06)" strokeWidth="11" />
          {visible.map(s => {
            const len = (s.minor / sum) * C;
            const dash = Math.max(len - (visible.length > 1 ? GAP : 0), 0.5);
            const el = (
              <circle
                key={s.id}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={active === s.id ? 13 : 11}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                className={cn('transition-[stroke-width,opacity] duration-200', active && active !== s.id && 'opacity-35')}
                onMouseEnter={() => setActive(s.id)}
                onMouseLeave={() => setActive(null)}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center" aria-hidden>
          <div>
            <p className="text-caption text-graphite">{current ? current.label : centerLabel}</p>
            <p className="text-[20px] font-semibold tracking-[-0.4px] tabular">{formatMoney(current ? current.minor : total)}</p>
            {current && <p className="text-caption text-graphite tabular">{Math.round((current.minor / sum) * 100)}%</p>}
          </div>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-1">
        {slices.map(s => (
          <li
            key={s.id}
            tabIndex={0}
            onMouseEnter={() => setActive(s.id)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(s.id)}
            onBlur={() => setActive(null)}
            className={cn('flex items-center gap-2.5 rounded-button px-2 py-1.5 text-body-sm transition-colors duration-150', active === s.id && 'bg-hover')}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink/85" title={s.label}>
              {s.label}
            </span>
            <span className="shrink-0 font-medium tabular">{formatMoney(s.minor)}</span>
            <span className="w-9 shrink-0 text-right text-caption text-graphite tabular">{Math.round((s.minor / sum) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
