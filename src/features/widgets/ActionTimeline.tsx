import { CalendarClock, Flag } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/context';
import { EmptyState } from '@/components/ui/States';
import { formatDate, humanizeCategory, pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useTaskStatus } from './useTaskStatus';
import { TaskCheckbox } from './TaskCheckbox';

type Entry = { kind: 'task'; id: string; date: string | null } | { kind: 'milestone'; id: string; date: string; label: string };

/** Tasks in date order around the move date. Undated tasks are listed honestly as not scheduled. */
export function ActionTimeline() {
  const { project } = useWorkspace();
  const setStatus = useTaskStatus();
  const moveDate = project.preferences.moveDate;
  const today = new Date().toISOString().slice(0, 10);

  const dated: Entry[] = project.tasks.filter(t => t.dueDate).map(t => ({ kind: 'task', id: t.id, date: t.dueDate }));
  if (moveDate) dated.push({ kind: 'milestone', id: 'move', date: moveDate, label: project.scenarioType === 'moving' ? 'Moving day' : 'Target date' });
  dated.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const undated = project.tasks.filter(t => !t.dueDate);
  const byId = new Map(project.tasks.map(t => [t.id, t]));

  if (project.tasks.length === 0 && !moveDate)
    return (
      <EmptyState icon={<CalendarClock />} title="Nothing scheduled yet">
        Set your date in the overview and tasks with deadlines will line up here.
      </EmptyState>
    );

  return (
    <div className="flex flex-col gap-4">
      {!moveDate && (
        <p className="rounded-[10px] bg-canvas px-3 py-2 text-body-sm text-graphite">Add your {project.scenarioType === 'moving' ? 'move date' : 'target date'} in the overview to anchor this timeline.</p>
      )}
      {dated.length > 0 && (
        <ol className="relative flex flex-col">
          {dated.map((e, i) => {
            const last = i === dated.length - 1;
            if (e.kind === 'milestone')
              return (
                <li key={e.id} className="relative flex gap-3 pb-4">
                  {!last && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-hairline-strong" aria-hidden />}
                  <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-marigold" aria-hidden>
                    <Flag className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-body-sm font-semibold">{e.label}</p>
                    <p className="text-caption text-graphite">{formatDate(e.date)}</p>
                  </div>
                </li>
              );
            const t = byId.get(e.id)!;
            const overdue = t.status !== 'done' && t.dueDate! < today;
            return (
              <li key={e.id} className="relative flex gap-3 pb-4">
                {!last && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-hairline-strong" aria-hidden />}
                <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-surface">
                  <TaskCheckbox task={t} onChange={d => setStatus.mutate({ id: t.id, status: d ? 'done' : 'todo' })} />
                </span>
                <div className="min-w-0">
                  <p className={cn('text-body-sm', t.status === 'done' && 'text-graphite line-through decoration-ink/30')}>{t.title}</p>
                  <p className={cn('text-caption', overdue ? 'font-medium text-danger-ink' : 'text-graphite')}>
                    {formatDate(t.dueDate)}
                    {overdue && ' · overdue'} · {humanizeCategory(t.category)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {undated.length > 0 && (
        <details className="group rounded-[10px] border border-hairline px-4 py-2.5" open={dated.length === 0}>
          <summary className="cursor-pointer text-body-sm font-medium">
            Not scheduled yet <span className="font-normal text-graphite">· {pluralize(undated.length, 'task')}</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {undated.map(t => (
              <li key={t.id} className="flex items-start gap-3 py-1">
                <span className="mt-px">
                  <TaskCheckbox task={t} onChange={d => setStatus.mutate({ id: t.id, status: d ? 'done' : 'todo' })} />
                </span>
                <span className={cn('text-body-sm', t.status === 'done' && 'text-graphite line-through decoration-ink/30')}>{t.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
