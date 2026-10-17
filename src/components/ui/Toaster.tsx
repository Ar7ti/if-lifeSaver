import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToasts } from '@/stores/toast';
import { cn } from '@/lib/cn';

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:bottom-6">
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card bg-surface p-4 shadow-float"
          >
            {t.tone === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok-ink" aria-hidden />}
            {t.tone === 'error' && <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger-ink" aria-hidden />}
            {t.tone === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-blue-ink" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className={cn('text-body-sm font-semibold', t.tone === 'error' && 'text-danger-ink')}>{t.title}</p>
              {t.detail && <p className="mt-0.5 text-body-sm text-graphite">{t.detail}</p>}
            </div>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="-my-1 rounded-button px-2 py-1 text-body-sm font-semibold text-blue-ink hover:bg-sky-tint"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="-m-1 rounded-md p-1 text-graphite hover:bg-hover hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
