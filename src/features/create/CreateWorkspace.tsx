import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, CircleDashed, FlaskConical, Loader2, Search } from 'lucide-react';
import type { CreateProjectResponse } from '@contracts';
import { useApi } from '@/api';
import { projectKey } from '@/hooks/useProject';
import { recommendedPatch } from '@/features/workspace/layout';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { formatMoney, pluralize } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';
import { Logo } from '@/features/shell/Logo';
import { DataSourceBanner } from '@/features/shell/DataSourceBanner';
import { cn } from '@/lib/cn';

interface Stage {
  label: string;
  /** Filled from the real response; null while the planner is still working. */
  detail: (r: CreateProjectResponse) => string;
}

const STAGES: Stage[] = [
  { label: 'Understanding your goal', detail: r => r.project.title + (r.project.location ? ` · ${r.project.location}` : '') },
  { label: 'Identifying essential tasks', detail: r => pluralize(r.project.tasks.length, 'task') + ' to start with' },
  {
    label: 'Allocating your budget',
    detail: r =>
      r.project.budget.totalMinor > 0
        ? `${formatMoney(r.project.budget.allocatedMinor)} across ${pluralize(r.project.budget.categories.length, 'category', 'categories')} · ${formatMoney(r.project.budget.emergencyReserveMinor)} reserve`
        : 'No budget given yet. You can add one in the workspace',
  },
  { label: 'Preparing your workspace', detail: r => `${pluralize(r.workspace.widgets.filter(w => w.visible).length, 'tool')} arranged for you` },
];

function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [running]);
  return s;
}

export function CreateWorkspace() {
  const location = useLocation();
  const message = (location.state as { message?: string } | null)?.message;
  const api = useApi();
  const setDataSource = useSettings(s => s.setDataSource);
  const remember = useProjects(s => s.remember);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState(0);
  const started = useRef(false);

  const create = useMutation({
    mutationFn: async (text: string) => {
      const res = await api.createProject({ message: text, locale: 'en' });
      // Arrange the new workspace in the recommended reading order. Best effort: the
      // AI's own order is kept if this fails.
      const patch = recommendedPatch(res.workspace.widgets);
      if (!patch.length) return res;
      try {
        const arranged = await api.patchWorkspace(res.project.id, { widgets: patch });
        const project = { ...res.project, workspace: arranged.workspace, revision: arranged.revision };
        return { ...res, project, workspace: arranged.workspace };
      } catch {
        return res;
      }
    },
    onSuccess: res => {
      qc.setQueryData(projectKey(api.source, res.project.id), res.project);
      remember(res.project, api.source);
    },
  });

  useEffect(() => {
    if (!message || started.current) return;
    started.current = true;
    create.mutate(message);
  }, [message]);

  // Check stages off one by one only after the real result exists.
  useEffect(() => {
    if (!create.data) return;
    if (reduce) {
      setRevealed(STAGES.length);
      return;
    }
    if (revealed >= STAGES.length) return;
    const t = setTimeout(() => setRevealed(r => r + 1), revealed === 0 ? 150 : 320);
    return () => clearTimeout(t);
  }, [create.data, revealed, reduce]);

  const done = Boolean(create.data) && revealed >= STAGES.length;
  const open = () => create.data && navigate(`/app/p/${create.data.project.id}`, { state: { fresh: true }, replace: true });

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(open, reduce ? 1200 : 900);
    return () => clearTimeout(t);
  }, [done]);

  // The adapter switches on the next render; retry once it has.
  const [retryWithDemo, setRetryWithDemo] = useState(false);
  useEffect(() => {
    if (!retryWithDemo || api.source !== 'mock' || !message) return;
    setRetryWithDemo(false);
    create.mutate(message);
  }, [retryWithDemo, api.source]);

  const elapsed = useElapsed(create.isPending);

  if (!message) return <Navigate to="/app/new" replace />;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <DataSourceBanner />
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <Logo />
        <Link to="/app/new" className="inline-flex items-center gap-1.5 rounded-button px-3 py-2 text-body-sm font-medium text-ink/60 hover:bg-hover hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Edit request
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 26 }} className="w-full max-w-xl">
          <blockquote className="mb-6 font-serif text-[20px] leading-[1.5] text-ink/85 sm:text-[22px]">&ldquo;{message}&rdquo;</blockquote>

          <section aria-labelledby="progress-heading" className="card p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h1 id="progress-heading" className="text-heading-sm font-semibold">
                {create.isError ? 'We could not create your workspace' : done ? 'Your workspace is ready' : 'Building your workspace'}
              </h1>
              {create.isPending && (
                <span className="tabular flex items-center gap-1.5 text-caption text-graphite" aria-hidden>
                  <Loader2 className="size-3.5 animate-spin" /> {elapsed}s
                </span>
              )}
            </div>

            {create.isError ? (
              <div className="flex flex-col gap-4">
                <ErrorState error={create.error} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => create.mutate(message)}>
                    Try again
                  </Button>
                  {api.source === 'live' && (
                    <Button
                      variant="ghost"
                      icon={<FlaskConical />}
                      onClick={() => {
                        setDataSource('mock');
                        setRetryWithDemo(true);
                      }}
                    >
                      Explore with demo data
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <ol className="flex flex-col gap-1" aria-live="polite">
                {STAGES.map((stage, i) => {
                  const isDone = Boolean(create.data) && i < revealed;
                  return (
                    <li key={stage.label} className="flex items-start gap-3 rounded-button px-1 py-2">
                      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-200', isDone ? 'bg-blue text-white' : 'text-ink/30')}>
                        <AnimatePresence mode="wait" initial={false}>
                          {isDone ? (
                            <motion.span key="done" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 24 }}>
                              <Check className="size-3" strokeWidth={3} aria-hidden />
                            </motion.span>
                          ) : (
                            <motion.span key="wait" exit={{ opacity: 0 }}>
                              <CircleDashed className={cn('size-5', create.isPending && 'animate-[spin_3s_linear_infinite]')} aria-hidden />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                      <div className="min-w-0">
                        <p className={cn('text-body-sm font-medium', isDone ? 'text-ink' : 'text-ink/60')}>
                          {stage.label}
                          <span className="sr-only">{isDone ? ' — done' : ' — in progress'}</span>
                        </p>
                        {isDone && create.data && (
                          <motion.p initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} className="text-body-sm text-graphite">
                            {stage.detail(create.data)}
                          </motion.p>
                        )}
                      </div>
                    </li>
                  );
                })}
                <li className="flex items-start gap-3 rounded-button px-1 py-2">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-ink/30">
                    <Search className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-body-sm font-medium text-ink/60">Finding suitable options</p>
                    <p className="text-body-sm text-graphite">Starts in your workspace when you choose what to research.</p>
                  </div>
                </li>
              </ol>
            )}

            {create.isPending && (
              <p className="mt-5 border-t border-hairline pt-4 text-caption text-graphite">
                The AI planner works on these together. Each step is checked off when its result arrives{elapsed > 20 ? '; this one is taking a little longer than usual.' : '.'}
              </p>
            )}

            {done && create.data && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex flex-col gap-3 border-t border-hairline pt-4">
                {create.data.questions.length > 0 && (
                  <p className="text-body-sm text-graphite">
                    {pluralize(create.data.questions.length, 'question')} to answer in the workspace for a sharper plan.
                  </p>
                )}
                <Button variant="primary" onClick={open} icon={<ArrowRight />} className="flex-row-reverse self-start">
                  Open my workspace
                </Button>
              </motion.div>
            )}
          </section>
        </motion.div>
      </main>
    </div>
  );
}
