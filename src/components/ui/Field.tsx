import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const inputClass =
  'w-full rounded-button border border-hairline-strong bg-surface px-3 text-body sm:text-body-sm text-ink placeholder:text-stone transition-colors duration-200 hover:border-ink/25 focus-visible:border-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/25 disabled:bg-canvas disabled:text-ink/50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputClass, 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputClass, 'py-2 leading-normal', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cn(inputClass, 'h-9 pr-8', className)} {...rest} />;
});

/** Label + control + optional hint, with the hint wired to aria-describedby. */
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; className?: string; children: (props: { id: string; 'aria-describedby'?: string }) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-body-sm font-medium text-ink/90">
        {label}
      </label>
      {children({ id, 'aria-describedby': hintId })}
      {hint && (
        <p id={hintId} className="text-caption text-graphite">
          {hint}
        </p>
      )}
    </div>
  );
}
