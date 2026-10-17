import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-6', className)} {...rest} />;
}

export function SectionLabel({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-caption font-medium uppercase tracking-[0.06em] text-graphite', className)} {...rest} />;
}
