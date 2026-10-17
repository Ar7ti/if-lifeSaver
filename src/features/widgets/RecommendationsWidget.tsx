import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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

const GENERIC = /^(next step|step|suggestion|recommendation)s?$/i;

interface Item {
  key: string;
  title: string;
  detail: string | null;
  priority: 'high' | 'medium' | 'low' | null;
  prompt: string;
}

const PRIORITY_LABEL = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' } as const;

export function RecommendationsWidget() {
  const { project, ask } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const reduce = useReducedMotion();
  const recs = project.recommendations;

  if (recs.length === 0 && project.assumptions.length === 0)
    return (
      <EmptyState icon={<Lightbulb />} title="No suggestions right now">
        Suggestions appear as your plan takes shape.
      </EmptyState>
    );

  // Structured details when the backend provides them; a generic title falls back to the item's own words.
  const items: Item[] = recs.map((r, i) => {
    const d = project.recommendationDetails?.[i];
    const words = split(d && GENERIC.test(d.title.trim()) ? d.explanation : r);
    const title = d && !GENERIC.test(d.title.trim()) ? d.title : words.title;
    const detail = d && !GENERIC.test(d.title.trim()) ? d.explanation : words.detail;
    return { key: `${i}-${r}`, title, detail: detail && detail !== title ? detail : null, priority: d?.priority ?? null, prompt: d?.action ?? r };
  });
  const [first, ...rest] = items;
  const shown = expanded ? rest : rest.slice(0, VISIBLE - 1);

  return (
    <div className="flex flex-col gap-3">
      {first && (
        <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-3 rounded-[16px] bg-canvas p-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-caption font-medium text-blue-ink">
              <span className="relative flex size-2" aria-hidden>
                {!reduce && <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue/40 [animation-iteration-count:2]" />}
                <span className="relative inline-flex size-2 rounded-full bg-blue" />
              </span>
              Up next
              {first.priority === 'high' && <span className="text-graphite">· {PRIORITY_LABEL.high}</span>}
            </p>
            <p className="mt-1.5 text-[16px] leading-snug font-medium text-ink">{first.title}</p>
            {first.detail && <p className="mt-0.5 text-body-sm text-graphite">{first.detail}</p>}
          </div>
          <Button size="sm" variant="primary" icon={<ArrowRight />} onClick={() => ask(`Help me with this: ${first.prompt}`)} className="flex-row-reverse self-start sm:self-center" aria-label={`Start: ${first.title}`}>
            Start
          </Button>
        </motion.div>
      )}

      {shown.length > 0 && (
        <ol className="flex flex-col" start={2}>
          <AnimatePresence initial={false}>
            {shown.map((it, i) => (
              <motion.li key={it.key} initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={reduce ? undefined : { opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                <button onClick={() => ask(`Help me with this: ${it.prompt}`)} className="group flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-canvas">
                  <span className="mt-px grid size-6 shrink-0 place-items-center rounded-full text-caption font-medium text-graphite tabular shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" aria-hidden>
                    {i + 2}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm font-medium text-ink">{it.title}</span>
                    {it.detail && <span className="mt-0.5 block text-caption text-graphite">{it.detail}</span>}
                    {it.priority === 'high' && <span className="mt-1 inline-block text-caption font-medium text-warn-ink">{PRIORITY_LABEL.high}</span>}
                  </span>
                  <span className="mt-0.5 flex shrink-0 items-center gap-1 text-caption font-medium text-graphite transition-colors duration-150 group-hover:text-ink">
                    Start <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        {rest.length > VISIBLE - 1 ? (
          <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="text-body-sm font-medium text-graphite hover:text-ink">
            {expanded ? 'Show fewer' : `Show ${pluralize(rest.length - (VISIBLE - 1), 'more step')}`}
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
