import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ExternalLink, Info, ShieldCheck, Sparkles } from 'lucide-react';
import type { Risk } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { Button } from '@/components/ui/Button';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { hostOf, pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';

const SEVERITY: Record<Risk['severity'], { label: string; tone: PillTone; icon: typeof Info; rank: number }> = {
  high: { label: 'High', tone: 'danger', icon: AlertOctagon, rank: 0 },
  medium: { label: 'Medium', tone: 'warn', icon: AlertTriangle, rank: 1 },
  low: { label: 'Low', tone: 'neutral', icon: Info, rank: 2 },
};
const STATUS: Record<Risk['status'], { label: string; tone: PillTone; rank: number }> = {
  open: { label: 'Open', tone: 'outline', rank: 0 },
  acknowledged: { label: 'Acknowledged', tone: 'blue', rank: 1 },
  resolved: { label: 'Resolved', tone: 'ok', rank: 2 },
};
const CATEGORY: Record<Risk['category'], string> = { budget: 'Budget', delivery: 'Delivery', seller: 'Seller', transport: 'Transport', planning: 'Planning', contract: 'Contract' };

const INITIAL = 4;

export function RiskGuardian() {
  const { project, ask } = useWorkspace();
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<Risk['category'] | 'all'>('all');

  const sorted = [...project.risks].sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || SEVERITY[a.severity].rank - SEVERITY[b.severity].rank);
  const open = project.risks.filter(r => r.status !== 'resolved');
  const counts = { high: open.filter(r => r.severity === 'high').length, medium: open.filter(r => r.severity === 'medium').length, low: open.filter(r => r.severity === 'low').length };
  const categories = [...new Set(project.risks.map(r => r.category))];
  const filtered = sorted.filter(r => filter === 'all' || r.category === filter);
  const visible = showAll ? filtered : filtered.slice(0, INITIAL);

  if (project.risks.length === 0)
    return (
      <div className="flex items-start gap-3 rounded-[10px] bg-ok-tint p-4 text-ok-ink">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-body-sm font-semibold">No open risks in your plan</p>
          <p className="mt-0.5 text-body-sm">Life Risk Guardian re-checks your plan every time it changes.</p>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] bg-midnight px-4 py-3 text-white">
        <ShieldCheck className="size-5 shrink-0 text-marigold" aria-hidden />
        <p className="min-w-0 flex-1 text-body-sm">
          {open.length === 0 ? 'Everything flagged so far is resolved.' : `${pluralize(open.length, 'thing')} to check before ${project.scenarioType === 'moving' ? 'moving day' : 'you commit'}.`}
        </p>
        <ul className="flex gap-3 text-caption" aria-label="Open risks by severity">
          <li>
            <span className="font-semibold tabular text-danger-on-dark">{counts.high}</span> high
          </li>
          <li>
            <span className="font-semibold tabular text-marigold">{counts.medium}</span> medium
          </li>
          <li>
            <span className="font-semibold tabular text-sky-wash">{counts.low}</span> low
          </li>
        </ul>
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by area">
          {(['all', ...categories] as const).map(c => (
            <button
              key={c}
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
              className={cn('rounded-full px-2.5 py-1 text-caption font-medium transition-colors duration-200', filter === c ? 'bg-ink text-white' : 'bg-ink/[0.05] text-ink/75 hover:bg-ink/[0.09]')}
            >
              {c === 'all' ? 'All' : CATEGORY[c]} <span className="tabular opacity-70">{c === 'all' ? project.risks.length : project.risks.filter(r => r.category === c).length}</span>
            </button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {visible.map(r => {
          const sev = SEVERITY[r.severity];
          const host = hostOf(r.sourceUrl);
          return (
            <li key={r.id} className={cn('rounded-[10px] border border-hairline p-4', r.status === 'resolved' && 'opacity-70')}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone={sev.tone}>
                  <sev.icon aria-hidden /> {sev.label} priority
                </Pill>
                <Pill tone="neutral">{CATEGORY[r.category]}</Pill>
                <Pill tone={STATUS[r.status].tone} className="ml-auto">
                  {r.status === 'resolved' && <CheckCircle2 aria-hidden />}
                  {STATUS[r.status].label}
                </Pill>
              </div>
              <h3 className="mt-2 text-body-sm font-semibold break-words">{r.title}</h3>
              <p className="mt-0.5 text-body-sm text-graphite">{r.explanation}</p>
              <div className="mt-3 rounded-button bg-sky-tint/70 px-3 py-2 text-body-sm">
                <span className="font-semibold text-blue-ink">What to do: </span>
                <span className="text-ink/85">{r.preventiveAction}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <details className="text-caption text-graphite">
                  <summary className="cursor-pointer font-medium hover:text-ink">Why we flagged this</summary>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {r.evidence.map(e => (
                      <li key={e} className="break-words">
                        {e}
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="flex items-center gap-1">
                  {host && (
                    <a href={r.sourceUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-button px-2 text-caption font-medium text-blue-ink hover:bg-sky-tint">
                      {host} <ExternalLink className="size-3" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                  {r.status !== 'resolved' && (
                    <Button size="sm" variant="text" icon={<Sparkles />} className="h-7 px-2 text-caption" onClick={() => ask(`Help me with this risk: ${r.title}. ${r.preventiveAction}`)}>
                      Get help
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {filtered.length > INITIAL && (
        <Button variant="text" size="sm" className="self-start" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
          {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
        </Button>
      )}
      <p className="text-caption text-graphite">Risks describe gaps in your plan&rsquo;s data and how to close them. They are not insurance advice or a probability of loss.</p>
    </div>
  );
}
