import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CalendarDays, Check, ChevronDown, ExternalLink, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ProtectionMilestone, ProtectionTimeline as Timeline } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { Progress } from '@/components/ui/Progress';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';

const labels: Record<ProtectionMilestone['status'], string> = {
  upcoming: 'Upcoming', ready: 'Ready to review', past_suggested_date: 'Past suggested date',
  completed: 'Completed', needs_review: 'Needs renewed review',
};

export function ProtectionTimeline() {
  const { project, writer, editDetails } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState<string | null>(null);
  const key = ['protection-timeline', writer.api.source, project.id] as const;
  const query = useQuery({ queryKey: key, queryFn: () => writer.api.protectionTimeline(project.id), retry: false });
  useEffect(() => { void qc.invalidateQueries({ queryKey: key }); }, [project.revision, project.id, writer.api.source, qc]);
  useEffect(() => {
    const now = new Date();
    const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const timer = window.setTimeout(() => { void query.refetch(); }, nextDay - now.getTime() + 100);
    return () => window.clearTimeout(timer);
  }, [query.data?.asOfDate, project.id, writer.api.source]);
  const mutation = useMutation({
    onMutate: async () => { await qc.cancelQueries({ queryKey: key }); },
    mutationFn: (item: ProtectionMilestone) => writer.api.patchProtectionMilestone(project.id, item.id, {
      completed: item.status !== 'completed', expectedContextFingerprint: item.contextFingerprint, expectedRevision: project.revision,
    }),
    onSuccess: result => { writer.setProject(result.project); qc.setQueryData(key, result.timeline); },
    onError: error => { writer.fail(error); void query.refetch(); },
  });
  if (query.isPending) return <div role="status" aria-label="Loading protection timeline"><Skeleton className="h-12 w-full" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data: Timeline = query.data;
  const next = data.milestones.find(m => m.status === 'needs_review') ?? data.milestones.find(m => m.status !== 'completed');

  return <section aria-label="If Protection Timeline" className="min-w-0">
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-sky-wash"><ShieldCheck className="size-5 text-blue-ink" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-body font-semibold tracking-tight">If Protection Timeline</h3>
        <p className="mt-0.5 break-words text-body-sm text-graphite">{data.origin ? `${data.origin} → ` : 'Moving to '}{data.destination || 'your new home'}</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 text-body-sm"><CalendarDays className="size-4 text-graphite" aria-hidden />{data.moveDate ? formatDate(data.moveDate) : 'Move date not set'}</span>
      <Button variant="text" size="sm" onClick={editDetails}>{data.moveDate ? 'Edit move date' : 'Add move date'}</Button>
    </div>
    {!data.moveDate && <p className="mt-2 text-body-sm text-graphite">Your steps are ready. Add a move date to see suggested dates.</p>}
    <div className="mt-4 rounded-[12px] bg-canvas p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-caption">
        <span className="font-semibold" aria-live="polite">{data.completed} of {data.total} steps completed</span><span className="text-graphite">Planning, not policy verification</span>
      </div>
      <Progress value={data.completed} max={data.total} label="Protection planning steps reviewed" tone="blue" />
      <p className="mt-3 text-body-sm">{next ? <><span className="text-graphite">Next to review: </span>{next.title}</> : 'All planning steps reviewed.'}</p>
    </div>
    <p className="mt-3 text-caption leading-relaxed text-graphite">{data.reviewNote}</p>
    <ol className="mt-5">
      {data.milestones.map((item, index) => {
        const done = item.status === 'completed';
        const open = expanded === item.id;
        const pending = mutation.isPending && mutation.variables?.id === item.id;
        const detailId = `${project.id}-protection-${item.id}`;
        return <li key={item.id} className="relative flex min-w-0 gap-3 pb-4 last:pb-0">
          {index < data.total - 1 && <span aria-hidden className="absolute top-9 bottom-0 left-4 w-px bg-hairline-strong" />}
          <button type="button" title={done ? 'Reopen this planning step' : 'Mark this planning step reviewed'} aria-pressed={done} aria-label={`${done ? 'Reopen' : 'Complete'}: ${item.title}`} disabled={mutation.isPending}
            onClick={() => mutation.mutate(item)}
            className={cn('relative mt-1 grid size-8 shrink-0 place-items-center rounded-full border text-caption font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-60', done ? 'border-blue bg-blue text-white' : 'border-hairline-strong bg-surface text-graphite')}>
            {pending ? <span className="size-3 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" /> : done ? <Check className="size-4" aria-hidden /> : index + 1}
          </button>
          <div className={cn('min-w-0 flex-1 rounded-[12px] border border-hairline bg-surface', item.status === 'needs_review' && 'border-saffron/60')}>
            <button type="button" onClick={() => setExpanded(open ? null : item.id)} aria-expanded={open} aria-controls={detailId}
              className="flex w-full items-start gap-2 rounded-[12px] p-3 text-left focus-visible:outline-2 focus-visible:outline-blue sm:p-4">
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-semibold">{item.title}</span>
                <span className="mt-1 block text-caption text-graphite">{item.suggestedDate ? formatDate(item.suggestedDate) : item.timing}</span>
                <span className={cn('mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium', done ? 'bg-sky-wash text-blue-ink' : item.status === 'needs_review' || item.status === 'past_suggested_date' ? 'bg-canvas text-ink' : 'bg-canvas text-graphite')}>{labels[item.status]}</span>
              </span>
              <ChevronDown className={cn('mt-1 size-4 shrink-0 text-graphite transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
              {open && <motion.div key="details" id={detailId} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }} className="overflow-hidden">
                <div className="space-y-3 border-t border-hairline p-3 pt-4 text-body-sm sm:p-4">
                  {item.status === 'needs_review' && <p className="font-medium">Your moving details changed since this step was reviewed. Check it again when ready.</p>}
                  <p className="text-graphite">{item.explanation}</p>
                  <p><span className="font-medium">If overlooked: </span><span className="text-graphite">{item.overlooked}</span></p>
                  <ul className="list-disc space-y-1 pl-4 text-graphite">{item.steps.map(step => <li key={step}>{step}</li>)}</ul>
                  <a href={item.resource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-blue-ink hover:underline">{item.resource.title}<ExternalLink className="size-3.5 shrink-0" aria-hidden /></a>
                  <p className="text-caption text-graphite">Official If guidance · Finnish. Opening a link does not complete a review.</p>
                  <Button variant="ghost" size="sm" loading={pending} disabled={mutation.isPending} onClick={() => mutation.mutate(item)}>{done ? 'Reopen step' : 'Mark step reviewed'}</Button>
                  {item.reviewAction && <Button variant="outline" size="sm" className="h-auto whitespace-normal" onClick={() => { navigate(`/app/p/${project.id}#protection`); document.getElementById('protection')?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' }); }}>{data.reviewStatus === 'dismissed' ? 'Review when ready' : 'Review home protection'}</Button>}
                </div>
              </motion.div>}
            </AnimatePresence>
          </div>
        </li>;
      })}
    </ol>
    <p className="mt-4 text-caption leading-relaxed text-graphite">Suggested dates help you plan; they are not insurance deadlines. Completing a step does not confirm coverage or purchase a policy.</p>
  </section>;
}
