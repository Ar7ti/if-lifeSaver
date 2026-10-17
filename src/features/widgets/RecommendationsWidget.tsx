import { ArrowRight, Lightbulb } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/context';
import { EmptyState } from '@/components/ui/States';

export function RecommendationsWidget() {
  const { project, ask } = useWorkspace();
  const recs = project.recommendations;
  if (recs.length === 0 && project.assumptions.length === 0)
    return (
      <EmptyState icon={<Lightbulb />} title="No suggestions right now">
        Suggestions appear as your plan takes shape.
      </EmptyState>
    );

  return (
    <div className="flex flex-col gap-4">
      {recs.length > 0 && (
        <ol className="flex flex-col gap-2">
          {recs.map((r, i) => (
            <li key={r}>
              <button
                onClick={() => ask(`Help me with this: ${r}`)}
                className="group flex w-full items-start gap-3 rounded-[10px] border border-hairline p-3 text-left transition-colors duration-200 hover:border-hairline-strong hover:bg-hover"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-peach text-caption font-semibold tabular" aria-hidden>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-body-sm">{r}</span>
                <span className="flex shrink-0 items-center gap-1 text-caption font-medium text-blue-ink">
                  Ask assistant <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {project.assumptions.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-caption font-medium tracking-[0.04em] text-graphite uppercase">What we assumed</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body-sm text-graphite">
            {project.assumptions.map(a => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
