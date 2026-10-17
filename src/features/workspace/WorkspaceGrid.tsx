import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import { WorkspaceSchema, type LifeProject, type WorkspacePatch, type WorkspaceWidget } from '@contracts';
import { ApiError } from '@/api';
import { useUi } from '@/stores/ui';
import { toast } from '@/stores/toast';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { useWorkspace } from './context';
import { REGISTRY } from './registry';
import { WidgetFrame } from './WidgetFrame';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { byPosition, recommendedPatch, reflow } from './layout';

function useLayoutMutation() {
  const { project, writer } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: WorkspacePatch) => writer.api.patchWorkspace(project.id, patch),
    onMutate: async patch => {
      await qc.cancelQueries({ queryKey: writer.key });
      const previous = qc.getQueryData<LifeProject>(writer.key);
      qc.setQueryData<LifeProject>(writer.key, old => {
        if (!old) return old;
        const widgets = old.workspace.widgets.map(w => {
          const u = patch.widgets.find(p => p.id === w.id);
          return u ? { ...w, ...Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)) } : w;
        });
        return { ...old, workspace: { ...old.workspace, widgets } };
      });
      return { previous };
    },
    onSuccess: res => {
      qc.setQueryData<LifeProject>(writer.key, old => (old ? { ...old, workspace: res.workspace, revision: res.revision } : old));
    },
    onError: (error, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(writer.key, ctx.previous);
      writer.fail(error);
    },
  });
}

const span = (w: WorkspaceWidget) => Math.max(w.position.w, REGISTRY[w.type].minSpan) >= 12 ? 12 : 6;

export function WorkspaceGrid({ fresh }: { fresh: boolean }) {
  const { project } = useWorkspace();
  const collapsed = useUi(s => s.collapsed[project.id]);
  const toggleCollapsed = useUi(s => s.toggleCollapsed);
  const layout = useLayoutMutation();
  const reduce = useReducedMotion();
  const [customizing, setCustomizing] = useState(false);

  // Only validated, declarative specs reach the renderer; unknown types cannot render.
  const parsed = useMemo(() => WorkspaceSchema.safeParse(project.workspace), [project.workspace]);
  const ordered = useMemo(() => (parsed.success ? [...parsed.data.widgets].sort(byPosition) : []), [parsed]);
  const visible = ordered.filter(w => w.visible);
  const hidden = ordered.filter(w => !w.visible);

  if (!parsed.success) return <ErrorState error={new ApiError('CONTRACT_MISMATCH', 'Invalid workspace', 0)} />;

  function move(widget: WorkspaceWidget, dir: -1 | 1) {
    const list = [...visible];
    const i = list.findIndex(w => w.id === widget.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    const patch = reflow([...list, ...hidden].map(w => ({ widget: w, w: w.position.w })));
    if (patch.length) layout.mutate({ widgets: patch });
  }

  function resize(widget: WorkspaceWidget) {
    const next = span(widget) === 12 ? 6 : 12;
    const patch = reflow([...visible, ...hidden].map(w => ({ widget: w, w: w.id === widget.id ? next : w.position.w })));
    if (patch.length) layout.mutate({ widgets: patch });
  }

  function setVisible(widget: WorkspaceWidget, value: boolean) {
    layout.mutate(
      { widgets: [{ id: widget.id, visible: value }] },
      {
        onSuccess: () => {
          if (!value) toast.info(`${widget.title} hidden`, 'Bring it back from Customize.', { label: 'Undo', onClick: () => layout.mutate({ widgets: [{ id: widget.id, visible: true }] }) });
        },
      },
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-body-sm font-semibold text-graphite">
          <LayoutGrid className="size-4" aria-hidden /> Your workspace
        </h2>
        <Button size="sm" variant="text" icon={<SlidersHorizontal />} onClick={() => setCustomizing(true)}>
          Customize{hidden.length > 0 && <span className="text-graphite">· {hidden.length} hidden</span>}
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-body font-semibold">All tools are hidden</p>
          <Button variant="ghost" onClick={() => setCustomizing(true)}>
            Choose what to show
          </Button>
        </div>
      ) : (
        <div className="@container">
          <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-12">
            {visible.map((w, i) => {
              const def = REGISTRY[w.type];
              const s = span(w);
              return (
                <motion.div
                  key={w.id}
                  layout={reduce ? false : 'position'}
                  initial={fresh && !reduce ? { opacity: 0, y: 28, scale: 0.97 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 210, damping: 26, delay: fresh ? 0.12 + i * 0.07 : 0 }}
                  className={cn('min-w-0', s === 12 ? '@4xl:col-span-12' : '@4xl:col-span-6')}
                >
                  <WidgetFrame
                    id={w.id}
                    title={w.title}
                    icon={def.icon}
                    controls={{
                      collapsed: Boolean(collapsed?.[w.id]),
                      onToggleCollapse: () => toggleCollapsed(project.id, w.id),
                      onHide: () => setVisible(w, false),
                      onMove: dir => move(w, dir),
                      onResize: def.minSpan === 12 ? null : () => resize(w),
                      isFull: s === 12,
                      isFirst: i === 0,
                      isLast: i === visible.length - 1,
                    }}
                    className="h-full"
                  >
                    <ErrorBoundary compact label={`${w.title} could not be shown`}>
                      <def.Component widget={w} />
                    </ErrorBoundary>
                  </WidgetFrame>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog
        open={customizing}
        onClose={() => setCustomizing(false)}
        title="Customize workspace"
        description="Choose which tools appear and in what order. Changes are saved to your project."
        footer={
          <Button
            variant="text"
            onClick={() => {
              const patch = recommendedPatch(ordered);
              if (patch.length) layout.mutate({ widgets: patch });
              else toast.info('Already using the recommended layout');
            }}
            disabled={layout.isPending}
          >
            Use recommended layout
          </Button>
        }
      >
        <ul className="flex flex-col divide-y divide-hairline">
          {[...visible, ...hidden].map(w => {
            const vi = visible.findIndex(v => v.id === w.id);
            return (
              <li key={w.id} className="flex items-center gap-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-canvas text-ink/75 [&_svg]:size-4" aria-hidden>
                  {REGISTRY[w.type].icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-body-sm font-medium', !w.visible && 'text-graphite')} title={w.title}>
                    {w.title}
                  </p>
                  <p className="text-caption text-graphite">{REGISTRY[w.type].label}</p>
                </div>
                {w.visible && (
                  <>
                    <Button size="icon-sm" variant="text" aria-label={`Move ${w.title} up`} icon={<ArrowUp />} disabled={vi === 0 || layout.isPending} onClick={() => move(w, -1)} />
                    <Button size="icon-sm" variant="text" aria-label={`Move ${w.title} down`} icon={<ArrowDown />} disabled={vi === visible.length - 1 || layout.isPending} onClick={() => move(w, 1)} />
                  </>
                )}
                <Button size="sm" variant={w.visible ? 'outline' : 'ghost'} icon={w.visible ? <EyeOff /> : <Eye />} onClick={() => layout.mutate({ widgets: [{ id: w.id, visible: !w.visible }] })} disabled={layout.isPending}>
                  {w.visible ? 'Hide' : 'Show'}
                </Button>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
