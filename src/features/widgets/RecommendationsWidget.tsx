import { useState } from 'react';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/context';
import { EmptyState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { pluralize } from '@/lib/format';

const VISIBLE = 3;

/**
 * Splits a recommendation into a short title and a one-sentence explanation, using only its
 * own words: a second sentence, or the clause after a connective such as "before" or "so".
 */
function split(text: string): { title: string; detail: string | null } {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const first = (sentences[0] ?? text).replace(/[.]$/, '');
  if (sentences.length > 1) return { title: first, detail: sentences.slice(1).join(' ') };
  const m = /^(.{18,}?)\s(before|so that|so|until|rather than|because|while|to avoid|and then)\s(.+)$/i.exec(first);
  if (!m) return { title: first, detail: null };
  const rest = `${m[2]} ${m[3]}`;
  return { title: m[1]!, detail: `${rest.charAt(0).toUpperCase()}${rest.slice(1)}.` };
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
        <ol className="flex flex-col gap-2">
          {shown.map((r, i) => {
            const structured=project.recommendationDetails?.[i];
            const { title, detail } = structured ? {title:structured.title,detail:structured.explanation} : split(r);
            return (
              <li key={r} className="flex flex-col gap-3 rounded-[16px] bg-canvas p-3.5 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface text-body-sm font-medium tabular shadow-[0_0_0_1px_rgb(0_0_0/0.05)]" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] leading-snug font-medium text-ink">{title}</p>
                    {detail && <p className="mt-0.5 text-body-sm text-graphite">{detail}</p>}
                  </div>
                </div>
                <Button size="sm" variant="primary" icon={<ArrowRight />} onClick={() => ask(`Help me with this: ${project.recommendationDetails?.[i]?.action ?? r}`)} className="flex-row-reverse self-start sm:self-center" aria-label={`Start: ${title}`}>
                  Start
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
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
