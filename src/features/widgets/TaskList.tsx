import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, ListChecks, Star } from 'lucide-react';
import type { ProjectTask } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { useUi } from '@/stores/ui';
import { EmptyState } from '@/components/ui/States';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useTaskStatus } from './useTaskStatus';

type SectionId = 'prep' | 'furniture' | 'services' | 'home' | 'final';
const SECTIONS: { id: SectionId; emoji: string; title: string }[] = [
  { id: 'prep', emoji: '📦', title: 'Preparation' },
  { id: 'furniture', emoji: '🛏️', title: 'Furniture' },
  { id: 'services', emoji: '🚚', title: 'Moving services' },
  { id: 'home', emoji: '🏠', title: 'New home' },
  { id: 'final', emoji: '✅', title: 'Final tasks' },
];

/** Tasks carry only a free category, so sections come from category and title keywords. */
function sectionOf(t: ProjectTask): SectionId {
  const text = `${t.category} ${t.title}`.toLowerCase();
  if (/moving day|handover|hand over|unpack|settle in|final|clean the old|move in/.test(text)) return 'final';
  if (/furniture|appliance|essential|bed|sofa|desk|fridge|buy|purchase|shop/.test(text)) return 'furniture';
  if (/utilit|electric|internet|broadband|insur|address|posti|dvv|lease|rent|key|registration|home/.test(text)) return 'home';
  if (/service|transport|mover|moving company|van|clean|storage|quote/.test(text)) return 'services';
  return 'prep';
}

function TaskRow({ task, starred, onToggle, onStar }: { task: ProjectTask; starred: boolean; onToggle: (done: boolean) => void; onStar: () => void }) {
  const done = task.status === 'done';
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !done && task.dueDate !== null && task.dueDate < today;
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
      <div className={cn('group flex items-start gap-3 rounded-[12px] px-3 py-2.5 transition-colors duration-150 hover:bg-canvas', done && 'opacity-55')}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
          <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
            <input
              type="checkbox"
              checked={done}
              onChange={e => onToggle(e.target.checked)}
              className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full border-[1.5px] border-ink/25 bg-surface transition-colors duration-200 checked:border-blue checked:bg-blue hover:border-blue/60"
            />
            <motion.span initial={false} animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={{ type: 'spring', stiffness: 600, damping: 28 }} className="pointer-events-none relative text-white" aria-hidden>
              <Check className="size-3" strokeWidth={3.2} />
            </motion.span>
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('block text-[15px] leading-snug text-ink transition-colors duration-200', done && 'text-graphite line-through decoration-ink/30')}>{task.title}</span>
          </span>
        </label>
        {task.notes && !done && (
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={open ? `Hide details for ${task.title}` : `Show details for ${task.title}`}
            className="grid size-8 shrink-0 place-items-center rounded-button text-graphite transition-colors duration-150 hover:bg-hover hover:text-ink"
          >
            <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
          </button>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          {task.status === 'in_progress' && <span className="rounded-full bg-sky-tint px-2 py-0.5 text-caption font-medium text-blue-ink">In progress</span>}
          {task.dueDate && (
            <span className={cn('rounded-full px-2 py-0.5 text-caption tabular', overdue ? 'bg-danger-tint font-medium text-danger-ink' : 'bg-ink/[0.05] text-graphite')}>
              {overdue ? 'Overdue · ' : ''}
              {formatDate(task.dueDate, true)}
            </span>
          )}
          {!done && (
            <button
              onClick={onStar}
              aria-pressed={starred}
              aria-label={starred ? `Remove priority from ${task.title}` : `Mark ${task.title} as priority`}
              title={starred ? 'Priority' : 'Mark as priority'}
              className={cn(
                'grid size-8 place-items-center rounded-button transition-[color,opacity] duration-150 hover:bg-hover',
                starred ? 'text-saffron' : 'text-ink/30 hover:text-ink/60 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
              )}
            >
              <Star className="size-4" fill={starred ? 'currentColor' : 'none'} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {open && task.notes && <p className="-mt-1 pr-3 pb-2 pl-11 text-caption text-graphite">{task.notes}</p>}
    </motion.li>
  );
}

export function TaskList() {
  const { project } = useWorkspace();
  const setStatus = useTaskStatus();
  const starred = useUi(s => s.starred[project.id]) ?? [];
  const toggleStar = useUi(s => s.toggleStar);
  const [showDone, setShowDone] = useState(false);
  // Just-completed tasks linger briefly so the check is seen before they tuck away.
  const [recent, setRecent] = useState<string[]>([]);
  const tasks = project.tasks;
  const done = tasks.filter(t => t.status === 'done').length;

  const sections = useMemo(() => {
    const map = new Map<SectionId, ProjectTask[]>();
    for (const t of tasks) map.set(sectionOf(t), [...(map.get(sectionOf(t)) ?? []), t]);
    return SECTIONS.map(s => ({ ...s, tasks: map.get(s.id) ?? [] })).filter(s => s.tasks.length > 0);
  }, [tasks]);

  if (tasks.length === 0)
    return (
      <EmptyState icon={<ListChecks />} title="No tasks yet">
        Ask the assistant to create a checklist for your plan.
      </EmptyState>
    );

  const pct = Math.round((done / tasks.length) * 100);
  const order = (list: ProjectTask[]) =>
    [...list].sort((a, b) => Number(starred.includes(b.id)) - Number(starred.includes(a.id)) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="relative size-14 shrink-0">
          <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgb(0 0 0 / 0.07)" strokeWidth="3" />
            <motion.circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-blue)" strokeWidth="3" strokeLinecap="round" initial={false} animate={{ strokeDasharray: `${(pct / 100) * 97.4} 97.4` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-caption font-semibold tabular">{pct}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-[17px] font-semibold tracking-[-0.2px]" aria-live="polite">
            {done === tasks.length ? 'All done' : `${tasks.length - done} left to do`}
          </p>
          <p className="text-body-sm text-graphite">
            {done} of {tasks.length} completed{starred.length > 0 ? ` · ${starred.length} starred` : ''}
          </p>
        </div>
      </div>

      {sections.map(section => {
        const open = order(section.tasks.filter(t => t.status !== 'done'));
        const closed = section.tasks.filter(t => t.status === 'done');
        const shown = showDone ? [...open, ...closed] : [...open, ...closed.filter(t => recent.includes(t.id))];
        return (
          <div key={section.id}>
            <div className="mb-1 flex items-center justify-between gap-3 px-3">
              <h3 className="flex items-center gap-2 text-body-sm font-medium text-ink">
                <span className="emoji text-[15px]" aria-hidden>
                  {section.emoji}
                </span>
                {section.title}
              </h3>
              <span className="text-caption text-graphite tabular">
                {closed.length}/{section.tasks.length}
              </span>
            </div>
            {shown.length === 0 ? (
              <p className="flex items-center gap-2 px-3 py-2 text-body-sm text-ok-ink">
                <Check className="size-4" aria-hidden /> Section complete
              </p>
            ) : (
              <ul className="flex flex-col">
                <AnimatePresence initial={false}>
                  {shown.map(t => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      starred={starred.includes(t.id)}
                      onToggle={d => {
                        setStatus.mutate({ id: t.id, status: d ? 'done' : 'todo' });
                        if (d) {
                          setRecent(r => [...r, t.id]);
                          setTimeout(() => setRecent(r => r.filter(x => x !== t.id)), 900);
                        }
                      }}
                      onStar={() => toggleStar(project.id, t.id)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        );
      })}

      {done > 0 && (
        <button onClick={() => setShowDone(v => !v)} aria-expanded={showDone} className="self-start rounded-button px-3 text-body-sm font-medium text-graphite hover:text-ink">
          {showDone ? 'Hide completed' : `Show completed (${done})`}
        </button>
      )}
    </div>
  );
}
