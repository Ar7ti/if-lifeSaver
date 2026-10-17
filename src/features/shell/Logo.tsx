import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#02093a" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="#ffb110" strokeWidth="2.6" />
      <circle cx="16" cy="16" r="2.6" fill="#62aef0" />
    </svg>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && <span className="text-[17px] font-semibold tracking-[-0.3px] text-ink">Life Simulator</span>}
    </span>
  );
}
