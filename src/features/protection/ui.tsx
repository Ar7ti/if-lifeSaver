import { useId, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Check, CircleDashed, Clock3, FlaskConical, Loader2, ShieldCheck } from 'lucide-react';
import type { InsuranceType, ProtectionRecommendation } from '@contracts';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

/** Native emoji marker per product, matching the workspace widget headers. */
export const PRODUCT_EMOJI: Record<InsuranceType, string> = { home: '🏠', car: '🚗', travel: '✈️' };
export const PRODUCT_NAME: Record<InsuranceType, string> = { home: 'Home insurance', car: 'Car insurance', travel: 'Travel insurance' };

type Tone = 'neutral' | 'blue' | 'ok' | 'warn';
const STATUS: Record<ProtectionRecommendation['status'], { label: string; tone: Tone; icon: typeof Check }> = {
  detected: { label: 'Not checked yet', tone: 'neutral', icon: CircleDashed },
  suggested: { label: 'Not checked yet', tone: 'neutral', icon: CircleDashed },
  in_progress: { label: 'In progress', tone: 'blue', icon: Clock3 },
  quote_available: { label: 'Price ready', tone: 'ok', icon: Check },
  quote_expired: { label: 'Price expired', tone: 'warn', icon: AlertTriangle },
  quote_unavailable: { label: 'Price needs review', tone: 'warn', icon: AlertTriangle },
  already_insured_self_reported: { label: 'Already insured (your note)', tone: 'neutral', icon: ShieldCheck },
  reviewed: { label: 'Reviewed', tone: 'neutral', icon: Check },
  dismissed: { label: 'Postponed', tone: 'neutral', icon: Clock3 },
};
const TONES: Record<Tone, string> = {
  neutral: 'bg-ink/[0.05] text-ink/75',
  blue: 'bg-sky-tint text-blue-ink',
  ok: 'bg-ok-tint text-ok-ink',
  warn: 'bg-warn-tint text-warn-ink',
};

/** Status always pairs an icon and words with its color. */
export function StatusPill({ status, className }: { status: ProtectionRecommendation['status']; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium whitespace-nowrap', TONES[s.tone], className)}>
      <s.icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

export type QuoteSource = 'demo' | 'sandbox' | 'live';
const SOURCE: Record<QuoteSource, { label: string; className: string; icon: typeof Check }> = {
  demo: { label: 'Fictional demo price · not from If', className: 'bg-warn-tint text-warn-ink', icon: FlaskConical },
  sandbox: { label: 'If sandbox · test data', className: 'bg-ink/[0.05] text-ink/75', icon: FlaskConical },
  live: { label: 'Price returned by If', className: 'bg-sky-tint text-blue-ink', icon: ShieldCheck },
};

/** Says where a price came from. A demo price can never look like an official If price. */
export function SourceBadge({ source, className }: { source: QuoteSource; className?: string }) {
  const s = SOURCE[source];
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium', s.className, className)}>
      <s.icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

/** Product marker tile used on cards and rows. */
export function ProductTile({ product, size = 'md' }: { product: InsuranceType; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('emoji grid shrink-0 place-items-center rounded-[12px] bg-canvas', size === 'md' ? 'size-11 text-[22px]' : 'size-9 text-[18px]')} aria-hidden>
      {PRODUCT_EMOJI[product]}
    </span>
  );
}

/** Compact progress for the quote flow: details, price, budget. */
export function StepRail({ step, labels = ['Details', 'Price', 'Budget'] }: { step: 0 | 1 | 2 | 3; labels?: string[] }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Quote progress">
      {labels.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex items-center gap-1.5" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span className={cn('h-px w-4 sm:w-6', done || current ? 'bg-blue/60' : 'bg-ink/15')} aria-hidden />}
            <span className={cn('grid size-5 place-items-center rounded-full text-[10px] font-semibold transition-colors duration-200', done ? 'bg-blue text-white' : current ? 'bg-ink text-white' : 'bg-ink/[0.07] text-ink/60')}>
              {done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-caption', current ? 'font-medium text-ink' : 'text-graphite')}>
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Segmented single choice built on native radios (keyboard and screen readers for free). */
export function ChoiceGroup<T extends string>({ legend, value, options, onChange, disabled, hint }: {
  legend: string;
  value: T | undefined;
  options: { value: T; label: string; detail?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 text-body-sm font-medium text-ink/90">{legend}</legend>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
        {options.map(o => (
          <label
            key={o.value}
            className={cn(
              'relative flex min-h-10 cursor-pointer flex-col justify-center rounded-button px-3 py-2 text-body-sm transition-[background-color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-blue has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
              value === o.value ? 'bg-surface font-medium text-ink shadow-[0_0_0_1.5px_var(--color-ink)]' : 'bg-canvas text-ink/80 hover:bg-fill',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="absolute inset-0 size-full cursor-pointer appearance-none rounded-button opacity-0" />
            <span>{o.label}</span>
            {o.detail && <span className="text-caption font-normal text-graphite">{o.detail}</span>}
          </label>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-caption text-graphite">{hint}</p>}
    </fieldset>
  );
}

/** The price is the focal point: amount, period, then the source. */
export function PriceHero({ amountMinor, period, source, children }: { amountMinor: number | undefined; period: string | undefined; source: QuoteSource; children?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={`${amountMinor}-${period}`}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[16px] bg-canvas px-5 py-5"
    >
      <SourceBadge source={source} />
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span className={cn('text-[40px] leading-none font-semibold tracking-[-1.2px] tabular', source === 'demo' && 'text-ink/85')}>{formatMoney(amountMinor, { exact: true })}</span>
        {period && <span className="text-body text-graphite">/ {period}</span>}
      </p>
      {children && <div className="mt-2 text-caption text-graphite">{children}</div>}
    </motion.div>
  );
}

/** Shown while a quote request is in flight. */
export function QuoteLoading({ label }: { label: string }) {
  return (
    <div role="status" className="rounded-[16px] bg-canvas p-5">
      <p className="flex items-center gap-2 text-body-sm font-medium">
        <Loader2 className="size-4 animate-spin text-blue-ink" aria-hidden /> {label}
      </p>
      <div className="mt-4 flex flex-col gap-2" aria-hidden>
        <span className="skeleton h-9 w-40" />
        <span className="skeleton h-3 w-56" />
        <span className="skeleton h-3 w-44" />
      </div>
    </div>
  );
}

/** Inline feedback for the quote flows: success notes and recoverable errors. */
export function FlowMessage({ tone, children }: { tone: 'info' | 'error'; children: ReactNode }) {
  return tone === 'error' ? (
    <p role="alert" className="flex items-start gap-2 rounded-button bg-danger-tint px-3.5 py-2.5 text-body-sm text-danger-ink">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  ) : (
    <p role="status" className="flex items-start gap-2 rounded-button bg-ok-tint px-3.5 py-2.5 text-body-sm text-ok-ink">
      <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
