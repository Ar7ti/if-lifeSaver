import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EXAMPLES } from './examples';

export function ExampleCards({ onPick, className }: { onPick: (prompt: string) => void; className?: string }) {
  return (
    <ul className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-5', className)} aria-label="Example plans">
      {EXAMPLES.map(ex => (
        <li key={ex.id}>
          <button
            onClick={() => onPick(ex.prompt)}
            className="group flex h-full w-full flex-col gap-3 rounded-card border border-hairline bg-surface p-4 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-hairline-strong active:translate-y-0"
          >
            <span className="flex items-center justify-between">
              <span className={cn('grid size-10 place-items-center rounded-full border-2 bg-surface', ex.ring)} aria-hidden>
                <ex.icon className="size-[18px] text-ink" />
              </span>
              <ArrowUpRight className="size-4 text-stone opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
            </span>
            <span className="text-body-sm font-semibold text-ink">{ex.title}</span>
            <span className="text-caption text-graphite">{ex.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
