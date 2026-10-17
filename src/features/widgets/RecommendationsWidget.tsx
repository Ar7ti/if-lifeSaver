import { useState } from 'react';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/context';
import { EmptyState } from '@/components/ui/States';
import { pluralize } from '@/lib/format';

const VISIBLE = 3;

/** First sentence only: the full text goes to the assistant when the person acts on it. */
function headline(text: string) {
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return first.replace(/[.]$/, '');
}

export function RecommendationsWidget() {
  const { project, ask } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const recs = project.recommendations;

  if (recs.length === 0 && project.assumptions.length === 0)
    return (
      <EmptyState icon={<Lightbulb />} title="No suggestions right now">
        Suggestions appear as your plan takes shape.
      </EmptyState>
    );

  const shown = expanded ? recs : recs.slice(0, VISIBLE);

  return (
    <div className="flex flex-col gap-4">
      {recs.length > 0 && (
        <ol className="flex flex-col gap-1">
          {shown.map((r, i) => (
            <li key={r}>
              <button
                onClick={() => ask(`Help me with this: ${r}`)}
                className="group flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left transition-colors duration-150 hover:bg-hover"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sky-tint text-caption font-semibold text-blue-ink tabular" aria-hidden>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug text-ink">{headline(r)}</span>
                <span className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium text-blue-ink transition-colors duration-150 group-hover:bg-sky-tint">
                  Do this <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3">
        {recs.length > VISIBLE ? (
          <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="text-body-sm font-medium text-graphite hover:text-ink">
            {expanded ? 'Show fewer' : `Show ${pluralize(recs.length - VISIBLE, 'more step')}`}
          </button>
        ) : (
          <span />
        )}
        {project.assumptions.length > 0 && (
          <details className="text-caption text-graphite [&[open]]:basis-full">
            <summary className="cursor-pointer font-medium hover:text-ink">What we assumed ({project.assumptions.length})</summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {project.assumptions.map(a => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
