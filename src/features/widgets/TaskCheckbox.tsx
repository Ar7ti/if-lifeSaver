import { Check } from 'lucide-react';
import type { ProjectTask } from '@contracts';
import { cn } from '@/lib/cn';

/** Native checkbox, so keyboard and screen readers behave as expected. */
export function TaskCheckbox({ task, onChange }: { task: ProjectTask; onChange: (done: boolean) => void }) {
  const done = task.status === 'done';
  return (
    <span className="relative grid size-[18px] shrink-0 place-items-center">
      <input
        type="checkbox"
        checked={done}
        onChange={e => onChange(e.target.checked)}
        aria-label={`${task.title}${done ? ', done' : ''}`}
        className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-ink/30 bg-surface transition-colors duration-200 checked:border-blue checked:bg-blue hover:border-ink/50 checked:hover:border-blue"
      />
      <Check className={cn('pointer-events-none relative size-3 text-white transition-transform duration-200', done ? 'scale-100' : 'scale-0')} strokeWidth={3} aria-hidden />
    </span>
  );
}
