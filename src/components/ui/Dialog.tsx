import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/**
 * Built on the native <dialog>: showModal() gives focus containment, Escape to close
 * and an inert background for free. On narrow screens it becomes a bottom sheet.
 */
export function Dialog({ open, onClose, title, description, children, footer, className, wide }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={e => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        'm-0 mt-auto w-full max-w-none rounded-t-[16px] bg-surface p-0 text-ink shadow-float backdrop:bg-midnight/30 open:flex open:flex-col',
        'max-h-[92dvh] sm:m-auto sm:max-h-[86dvh] sm:rounded-card',
        wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        className,
      )}
    >
      {open && (
        <>
          <header className="flex items-start gap-3 border-b border-hairline px-6 pt-5 pb-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-heading-sm font-semibold">
                {title}
              </h2>
              {description && <div className="mt-1 text-body-sm text-graphite">{description}</div>}
            </div>
            <Button size="icon-sm" onClick={onClose} aria-label="Close" icon={<X />} className="-mr-2" />
          </header>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-hairline px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}
