import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-8 sm:py-10', className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-1px] sm:text-heading">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-body text-graphite">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
