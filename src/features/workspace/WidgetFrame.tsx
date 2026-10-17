import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, MoreHorizontal, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';

export interface FrameControls {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onHide: () => void;
  onMove: (dir: -1 | 1) => void;
  onResize: (() => void) | null;
  isFull: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export function WidgetFrame({ id, title, icon, meta, actions, children, controls, className }: {
  id: string;
  title: string;
  icon: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  controls: FrameControls;
  className?: string;
}) {
  const headingId = `widget-${id}`;
  const bodyId = `widget-body-${id}`;
  const items: MenuItem[] = [
    { label: 'Move up', icon: <ArrowUp />, onSelect: () => controls.onMove(-1), disabled: controls.isFirst },
    { label: 'Move down', icon: <ArrowDown />, onSelect: () => controls.onMove(1), disabled: controls.isLast },
  ];
  if (controls.onResize) items.push({ label: controls.isFull ? 'Make half width' : 'Make full width', icon: controls.isFull ? <Minimize2 /> : <Maximize2 />, onSelect: controls.onResize });
  items.push({ label: 'Hide from workspace', icon: <EyeOff />, onSelect: controls.onHide });

  return (
    <section aria-labelledby={headingId} className={cn('card flex min-w-0 flex-col', className)}>
      <header className={cn('flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4 sm:px-6', controls.collapsed ? 'pb-4' : 'pb-1')}>
        <h2 id={headingId} className="-ml-1.5 flex min-w-0 flex-1 text-[17px] font-semibold tracking-[-0.2px]">
          <button
            onClick={controls.onToggleCollapse}
            aria-expanded={!controls.collapsed}
            aria-controls={bodyId}
            className="group flex min-w-0 items-center gap-2.5 rounded-button py-1 pr-2 pl-1.5 text-left hover:bg-hover"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-canvas text-ink/75 [&_svg]:size-4" aria-hidden>
              {icon}
            </span>
            <span className="min-w-0 truncate" title={title}>{title}</span>
            <ChevronDown className={cn('size-4 shrink-0 text-graphite transition-transform duration-200', controls.collapsed && '-rotate-90')} aria-hidden />
          </button>
        </h2>
        {meta && <div className="flex shrink-0 items-center gap-2">{meta}</div>}
        <div className="flex shrink-0 items-center gap-1">
          {!controls.collapsed && actions}
          <Menu
            label={`${title} options`}
            items={items}
            trigger={props => (
              <button {...props} aria-label={`${title} options`} className="grid size-8 place-items-center rounded-button text-graphite transition-colors duration-200 hover:bg-hover hover:text-ink">
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            )}
          />
        </div>
      </header>
      <AnimatePresence initial={false}>
        {!controls.collapsed && (
          <motion.div
            id={bodyId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pt-3 pb-5 sm:px-6 sm:pb-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
