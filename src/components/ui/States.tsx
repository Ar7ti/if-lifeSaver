import type { ReactNode } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { describeError } from '@/api';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-hairline-strong px-6 py-8 text-center', className)}>
      {icon && <div className="mb-1 grid size-10 place-items-center rounded-full bg-canvas text-graphite [&_svg]:size-5">{icon}</div>}
      <p className="text-body-sm font-semibold text-ink">{title}</p>
      {children && <div className="max-w-sm text-body-sm text-graphite">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className, compact }: { error: unknown; onRetry?: () => void; className?: string; compact?: boolean }) {
  const { title, detail } = describeError(error);
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-[10px] bg-danger-tint p-4 text-danger-ink', className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-semibold">{title}</p>
        {!compact && <p className="mt-0.5 text-body-sm text-danger-ink/90">{detail}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} icon={<RotateCw />} className="border-danger-ink/30 text-danger-ink">
          Try again
        </Button>
      )}
    </div>
  );
}
