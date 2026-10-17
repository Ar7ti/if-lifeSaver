import { useState } from 'react';
import { AlertOctagon, AlertTriangle, ExternalLink, Info, ShieldCheck } from 'lucide-react';
import type { Risk } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { Button } from '@/components/ui/Button';
import type { PillTone } from '@/components/ui/Pill';
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

const INITIAL = 3;

export function RiskGuardian() {
  const { project, ask } = useWorkspace();
  const [showAll, setShowAll] = useState(false);

  const sorted = [...project.risks].sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || SEVERITY[a.severity].rank - SEVERITY[b.severity].rank);
  const open = project.risks.filter(r => r.status !== 'resolved');
  const high = open.filter(r => r.severity === 'high').length;
  const visible = showAll ? sorted : sorted.slice(0, INITIAL);

  if (project.risks.length === 0)
    return (
      <p className="flex items-start gap-2.5 text-body-sm text-ok-ink">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        No open risks in your plan. Life Risk Guardian re-checks it every time something changes.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-body-sm text-graphite">
        <ShieldCheck className="size-4 shrink-0 text-blue-ink" aria-hidden />
        {open.length === 0 ? 'Everything flagged so far is resolved.' : `${pluralize(open.length, 'thing')} to check before ${project.scenarioType === 'moving' ? 'moving day' : 'you commit'}${high ? `, ${high} urgent` : ''}.`}
      </p>

      <ul className="flex flex-col divide-y divide-hairline">
        {visible.map(r => {
          const sev = SEVERITY[r.severity];
          const host = hostOf(r.sourceUrl);
          return (
            <li key={r.id} className={cn('flex gap-3 py-3.5 first:pt-0', r.status === 'resolved' && 'opacity-60')}>
              <sev.icon className={cn('mt-0.5 size-4 shrink-0', r.severity === 'high' ? 'text-danger-ink' : r.severity === 'medium' ? 'text-warn-ink' : 'text-graphite')} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-body-sm">
                  <span className="font-medium break-words text-ink">{r.title}</span>
                  <span className="text-caption text-graphite">
                    {sev.label} · {CATEGORY[r.category]}
                    {r.status !== 'open' && ` · ${STATUS[r.status].label}`}
                  </span>
                </p>
                <p className="mt-0.5 text-body-sm text-graphite">{r.preventiveAction}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3">
                  <details className="text-caption text-graphite">
                    <summary className="cursor-pointer font-medium hover:text-ink">Why</summary>
                    <p className="mt-1">{r.explanation}</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {r.evidence.map(e => (
                        <li key={e} className="break-words">
                          {e}
                        </li>
                      ))}
                    </ul>
                  </details>
                  {host && (
                    <a href={r.sourceUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-caption font-medium text-blue-ink hover:underline">
                      {host} <ExternalLink className="size-3" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                  {r.status !== 'resolved' && (
                    <button onClick={() => ask(`Help me with this risk: ${r.title}. ${r.preventiveAction}`)} className="text-caption font-medium text-blue-ink hover:underline">
                      Get help
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {sorted.length > INITIAL && (
        <Button variant="text" size="sm" className="-ml-2 self-start text-graphite" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
          {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
        </Button>
      )}
      <p className="text-caption text-graphite">Risks point out gaps in your plan&rsquo;s data and how to close them. They are not insurance advice.</p>
    </div>
  );
}
