import { useId } from 'react';
import { cn } from '@/lib/cn';

/** A native radio group styled as a segmented control: keyboard behavior comes from the platform. */
export function Segmented<T extends string>({ label, value, options, onChange, className, size = 'md' }: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const name = useId();
  return (
    <fieldset className={cn('inline-flex rounded-button bg-ink/[0.05] p-0.5', className)}>
      <legend className="sr-only">{label}</legend>
      {options.map(o => (
        <label
          key={o.value}
          className={cn(
            'relative flex cursor-pointer items-center justify-center rounded-[6px] font-medium text-ink/60 transition-colors duration-200 hover:text-ink',
            'has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgba(0,0,0,0.08)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue',
            size === 'sm' ? 'h-7 px-2.5 text-caption' : 'h-8 px-3 text-body-sm',
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
