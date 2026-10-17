import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ListChecks } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/context';
import { Progress } from '@/components/ui/Progress';
import { Pill } from '@/components/ui/Pill';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/States';
import { formatDate, humanizeCategory } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useTaskStatus } from './useTaskStatus';
import { TaskCheckbox } from './TaskCheckbox';

export function TaskList() {
  const { project } = useWorkspace();
  const setStatus = useTaskStatus();
  const [show, setShow] = useState<'open' | 'all' | 'done'>('open');
  const tasks = project.tasks;
  const done = tasks.filter(t => t.status === 'done').length;

  if (tasks.length === 0)
    return (
      <EmptyState icon={<ListChecks />} title="No tasks yet">
        Ask the assistant to create a checklist for your plan.
      </EmptyState>
    );

  const list = tasks.filter(t => (show === 'all' ? true : show === 'done' ? t.status === 'done' : t.status !== 'done'));
  const groups = new Map<string, typeof list>();
  for (const t of list) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-body-sm">
          <span className="font-medium">
            {done} of {tasks.length} done
          </span>
          <span className="text-caption text-graphite tabular">{Math.round((done / tasks.length) * 100)}%</span>
        </div>
        <Progress value={done} max={tasks.length} label="Tasks completed" />
      </div>
      <Segmented
        size="sm"
        label="Show tasks"
        value={show}
        onChange={setShow}
        options={[
          { value: 'open', label: `To do (${tasks.length - done})` },
          { value: 'done', label: `Done (${done})` },
          { value: 'all', label: 'All' },
        ]}
        className="self-start"
      />
      {list.length === 0 ? (
        <p className="py-4 text-center text-body-sm text-graphite">{show === 'open' ? 'Everything is done. Nicely planned.' : 'Nothing completed yet.'}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {[...groups.entries()].map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-1 text-caption font-medium tracking-[0.04em] text-graphite uppercase">{humanizeCategory(category)}</h3>
              <ul className="flex flex-col">
                <AnimatePresence initial={false}>
                  {items.map(t => (
                    <motion.li key={t.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                      <div className="flex items-start gap-3 rounded-button px-2 py-2 hover:bg-hover">
                        <span className="mt-px">
                          <TaskCheckbox task={t} onChange={d => setStatus.mutate({ id: t.id, status: d ? 'done' : 'todo' })} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-body-sm', t.status === 'done' && 'text-graphite line-through decoration-ink/30')}>{t.title}</p>
                          {t.notes && <p className="mt-0.5 text-caption text-graphite">{t.notes}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {t.status === 'in_progress' && <Pill tone="blue">In progress</Pill>}
                          {t.dueDate && <span className="text-caption text-graphite tabular">{formatDate(t.dueDate, true)}</span>}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
