import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'ghost' | 'text' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  // The one filled chromatic button. Use once per view.
  primary: 'bg-blue text-white hover:bg-blue-hover active:bg-blue-hover disabled:bg-blue/45',
  ghost: 'bg-sky-tint text-blue-ink hover:bg-sky-tint-hover disabled:opacity-50',
  text: 'bg-transparent text-ink/90 hover:bg-hover active:bg-pressed disabled:text-ink/40',
  outline: 'bg-surface text-ink/90 border border-hairline-strong hover:bg-hover disabled:text-ink/40',
  danger: 'bg-transparent text-danger-ink hover:bg-danger-tint disabled:opacity-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-body-sm gap-1.5',
  md: 'h-9 px-[15px] text-body-sm gap-2',
  lg: 'h-12 px-5 text-body gap-2',
  icon: 'size-9 justify-center',
  'icon-sm': 'size-8 justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'text', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-button font-medium select-none',
        // Colors ease over 200ms; the press scale is quicker (150ms) and never applies when disabled.
        'transition-[color,background-color,border-color,scale] ease-out [transition-duration:200ms,200ms,200ms,150ms] enabled:active:scale-[0.96]',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
