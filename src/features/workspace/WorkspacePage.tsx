import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { ApiError } from '@/api';
import { useProject, useProjectWriter } from '@/hooks/useProject';
import { useUi } from '@/stores/ui';
import { useAssistant } from '@/stores/assistant';
import { useProjects } from '@/stores/projects';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { AssistantPanel } from '@/features/assistant/AssistantPanel';
import { WorkspaceContext, type WorkspaceContextValue } from './context';
import { ProjectOverview } from './ProjectOverview';
import { QuestionsBlock } from './QuestionsBlock';
import { scrollToSection } from './scroll';
import { WorkspaceGrid } from './WorkspaceGrid';

function useIsDesktop() {
  const query = '(min-width: 1280px)';
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return match;
}

function LoadingWorkspace() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8" aria-busy="true" aria-label="Loading workspace">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-10 w-80 max-w-full" />
      <Skeleton className="mt-6 h-24 w-full rounded-card" />
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} className="h-64 rounded-card" />
        ))}
      </div>
    </div>
  );
}

/** Mobile/tablet assistant: a native modal dialog styled as a bottom sheet. */
function AssistantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
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
      onClick={e => e.target === ref.current && onClose()}
      aria-label="Assistant"
      className="m-0 mt-auto h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[16px] bg-surface p-0 shadow-float backdrop:bg-midnight/30 sm:mx-auto sm:max-w-lg"
    >
      {open && <AssistantPanel onClose={onClose} />}
    </dialog>
  );
}

export function WorkspacePage() {
  const { projectId = '' } = useParams();
  const location = useLocation();
  const fresh = Boolean((location.state as { fresh?: boolean } | null)?.fresh);
  const query = useProject(projectId);
  const writer = useProjectWriter(projectId);
  const forget = useProjects(s => s.forget);
  const { assistantOpen, setAssistantOpen } = useUi();
  const isDesktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { setDraft, requestFocus } = useAssistant();

  const ask = useCallback(
    (message?: string) => {
      if (message) setDraft(projectId, message);
      if (isDesktop) setAssistantOpen(true);
      else setSheetOpen(true);
      setTimeout(requestFocus, 60);
    },
    [isDesktop, projectId, setAssistantOpen, setDraft, requestFocus],
  );

  // Sidebar shortcuts: #tasks and #shopping scroll to their widget, #assistant opens the assistant.
  const hasData = Boolean(query.data);
  useEffect(() => {
    if (!hasData || !location.hash) return;
    if (location.hash === '#assistant') {
      ask();
      return;
    }
    const target = ({ '#tasks': 'w-task_list', '#shopping': 'w-shopping_cart' } as Record<string, string>)[location.hash];
    if (target) requestAnimationFrame(() => scrollToSection(target));
  }, [location.hash, hasData]);

  const ctx = useMemo<WorkspaceContextValue | null>(() => (query.data ? { project: query.data, writer, ask } : null), [query.data, writer, ask]);

  useEffect(() => {
    if (query.data) document.title = `${query.data.title} · Life Simulator`;
    return () => {
      document.title = 'Life Simulator';
    };
  }, [query.data?.title]);

  if (query.isPending) return <LoadingWorkspace />;

  if (query.isError || !ctx) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />
        <div className="mt-4 flex gap-3 text-body-sm">
          <Link to="/app/projects" className="font-medium text-blue-ink hover:underline" onClick={() => notFound && forget(projectId)}>
            {notFound ? 'Remove it and go to my projects' : 'Go to my projects'}
          </Link>
        </div>
      </div>
    );
  }

  const panelOpen = isDesktop && assistantOpen;

  return (
    <WorkspaceContext.Provider value={ctx}>
      <div className="flex">
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1280px] px-4 pt-6 pb-24 sm:px-8 sm:pt-8">
            <ProjectOverview project={ctx.project} />
            <QuestionsBlock />
            <WorkspaceGrid fresh={fresh} />
          </div>
        </div>
        <AnimatePresence initial={false}>
          {panelOpen && (
            <motion.aside
              key="assistant"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="sticky top-2 h-[calc(100dvh-1rem)] shrink-0 overflow-hidden rounded-r-[24px] border-l border-hairline"
              aria-label="Assistant"
            >
              <div className="h-full w-[380px]">
                <AssistantPanel onClose={() => setAssistantOpen(false)} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {!panelOpen && (
        <motion.button
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26, delay: fresh ? 0.8 : 0 }}
          onClick={() => ask()}
          aria-label="Ask assistant"
          className="fixed right-4 bottom-20 z-30 flex size-12 items-center justify-center gap-2 rounded-full bg-ink text-body-sm font-medium text-white shadow-float transition-transform duration-200 hover:scale-[1.03] active:scale-[0.96] sm:w-auto sm:pr-5 sm:pl-4 md:hidden"
        >
          <Sparkles className="size-4 text-marigold" aria-hidden /> <span className="max-sm:sr-only">Ask assistant</span>
        </motion.button>
      )}
      {!isDesktop && <AssistantSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </WorkspaceContext.Provider>
  );
}
