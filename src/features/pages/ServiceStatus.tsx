import { CircleCheck, CircleAlert, Loader2 } from 'lucide-react';
import { useHealth } from '@/hooks/useHealth';
import { useSettings } from '@/stores/settings';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';

const researchLabel = { live: 'Live web research', demo: 'Fictional demo offers', unavailable: 'Research off' } as const;
const aiLabel = { openai: 'AI planner', local: 'Basic local planner' } as const;

export function ServiceStatus() {
  const health = useHealth();
  const { dataSource, setDataSource } = useSettings();

  if (health.isPending)
    return (
      <p className="flex items-center gap-2 text-body-sm text-graphite">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Checking the Life Simulator service…
      </p>
    );

  if (health.isError)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card bg-warn-tint p-4 text-warn-ink" role="status">
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 text-body-sm">
          <strong className="font-semibold">Can&rsquo;t reach the Life Simulator service.</strong> Start it with <code className="rounded bg-white/60 px-1">cd server &amp;&amp; npm run dev</code>, or explore with demo data.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => health.refetch()}>
            Check again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDataSource('mock')}>
            Use demo data
          </Button>
        </div>
      </div>
    );

  const c = health.data.configuration;
  return (
    <div className="flex flex-wrap items-center gap-2 text-body-sm text-graphite">
      <CircleCheck className="size-4 text-ok-ink" aria-hidden />
      <span>{dataSource === 'mock' ? 'Demo mode' : 'Connected'}</span>
      <Pill tone={c.ai === 'openai' ? 'blue' : 'neutral'}>{aiLabel[c.ai]}</Pill>
      <Pill tone={c.research === 'live' ? 'ok' : c.research === 'demo' ? 'warn' : 'neutral'}>{researchLabel[c.research]}</Pill>
    </div>
  );
}
