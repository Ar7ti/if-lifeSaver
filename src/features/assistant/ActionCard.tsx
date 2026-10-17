import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, LayoutGrid, ListPlus, Loader2, MessageSquareText, RotateCw, Search, ShieldCheck, ShoppingBag, Wallet, X, type LucideIcon } from 'lucide-react';
import type { AgentAction, AgentCommand, LifeProject } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { ErrorState } from '@/components/ui/States';
import { formatMoney, humanizeCategory, pluralize } from '@/lib/format';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';

interface Described {
  icon: LucideIcon;
  title: string;
  details: string[];
  slow?: boolean;
}

/** Turns a validated command into plain language. Unknown details are omitted, never invented. */
export function describeCommand(c: AgentCommand, project: LifeProject): Described {
  const widget = (id: string) => project.workspace.widgets.find(w => w.id === id)?.title ?? 'a tool';
  const offer = (id: string) => project.researchResults.flatMap(r => r.offers).find(o => o.id === id);
  switch (c.type) {
    case 'protection_action':return {icon:ShieldCheck,title:c.arguments.operation==='overview'?'Open My Protection':`Review ${c.arguments.product} protection`,details:['Uses your workspace’s saved protection state. No automatic quote request or purchase.']};
    case 'propose_budget_allocation':
      return {
        icon: Wallet,
        title: 'Update budget allocation',
        details: [...c.arguments.categories.map(x => `${x.title}: ${formatMoney(x.allocatedMinor)}`), `Emergency reserve: ${formatMoney(c.arguments.emergencyReserveMinor)}`],
      };
    case 'research_products':
    case 'research_services': {
      const a = c.arguments;
      const bits = [a.maxPrice !== undefined ? `under ${formatMoney(Math.round(a.maxPrice * 100))}` : null, a.location ? `in ${a.location}` : project.location ? `near ${project.location}` : null].filter(Boolean);
      return {
        icon: Search,
        title: `${c.type === 'research_services' ? 'Find services' : 'Research'}: ${humanizeCategory(a.category).toLowerCase()} ${bits.join(' ')}`.trim(),
        details: (a.preferences ?? []).map(p => `Preference: ${p}`),
        slow: true,
      };
    }
    case 'update_workspace':
      return {
        icon: LayoutGrid,
        title: 'Change your workspace',
        details: c.arguments.widgets.map(w =>
          w.visible === false ? `Hide ${widget(w.id)}` : w.visible === true ? `Show ${widget(w.id)}` : w.title ? `Rename ${widget(w.id)} to “${w.title}”` : w.position ? `Move ${widget(w.id)}` : `Adjust ${widget(w.id)}`,
        ),
      };
    case 'create_tasks':
      return { icon: ListPlus, title: `Add ${pluralize(c.arguments.tasks.length, 'task')}`, details: c.arguments.tasks.map(t => t.title) };
    case 'propose_cart_item': {
      const o = offer(c.arguments.offerId);
      return { icon: ShoppingBag, title: `Add ${o ? `“${o.title}”` : 'an option'} to your plan`, details: [o?.priceMinor != null ? `${c.arguments.quantity} × ${formatMoney(o.priceMinor)}` : `Quantity ${c.arguments.quantity}`, 'Planning only; nothing is bought'] };
    }
    case 'compare_scenarios':
      return { icon: RotateCw, title: 'Recalculate scenarios', details: ['Economy, Balanced and Comfort from your current plan'] };
    case 'identify_risks':
      return { icon: ShieldCheck, title: 'Refresh the risk check', details: [] };
    case 'draft_seller_message': {
      const o = offer(c.arguments.offerId);
      return { icon: MessageSquareText, title: `Draft a message about ${o ? `“${o.title}”` : 'an option'}`, details: ['You review and send it yourself'] };
    }
  }
}

export function ActionCard({ action }: { action: AgentAction }) {
  const { project, writer } = useWorkspace();
  const navigate=useNavigate();
  const live = project.actions.find(a => a.id === action.id) ?? action;
  const d = describeCommand(live.command, project);
  const [copied, setCopied] = useState(false);

  const review = useMutation({
    mutationFn: (approved: boolean) => writer.api.confirmAction(project.id, live.id, { approved }),
    onSuccess: (p, approved) => {
      writer.setProject(p);
      const updated = p.actions.find(a => a.id === live.id);
      if (approved && updated?.status === 'applied') {toast.success('Done', updated.result ?? d.title);if(live.command.type==='protection_action')navigate(live.command.arguments.operation==='overview'?'/app/protection':`/app/p/${project.id}#protection`);}
    },
    onError: writer.reloadOnConflict,
  });

  const status = live.status;
  const isDraft = live.command.type === 'draft_seller_message' && status === 'applied' && live.result;

  return (
    <div className={cn('rounded-[10px] border bg-surface p-3', status === 'proposed' ? 'border-blue/30' : 'border-hairline')}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[7px] bg-sky-tint text-blue-ink" aria-hidden>
          <d.icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold break-words">{d.title}</p>
          {live.explanation && <p className="mt-0.5 text-caption text-graphite">{live.explanation}</p>}
          {d.details.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5 text-caption text-ink/75">
              {d.details.slice(0, 6).map(x => (
                <li key={x} className="break-words">
                  · {x}
                </li>
              ))}
              {d.details.length > 6 && <li className="text-graphite">+{d.details.length - 6} more</li>}
            </ul>
          )}
        </div>
      </div>

      {status === 'proposed' && (
        <div className="mt-3 flex flex-col gap-2">
          {review.isPending && d.slow && review.variables && (
            <p className="flex items-center gap-2 text-caption text-blue-ink" role="status">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Researching. This can take up to 90 seconds.
            </p>
          )}
          {review.isError && <ErrorState error={review.error} compact />}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<Check />} loading={review.isPending && review.variables === true} disabled={review.isPending} onClick={() => review.mutate(true)}>
              Apply
            </Button>
            <Button size="sm" variant="text" icon={<X />} disabled={review.isPending} onClick={() => review.mutate(false)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      {status === 'applied' && !isDraft && (
        <p className="mt-2 flex items-start gap-1.5 text-caption text-ok-ink">
          <Check className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{live.result ?? 'Applied'}</span>
        </p>
      )}
      {isDraft && (
        <div className="mt-2 rounded-button bg-canvas p-2.5">
          <p className="text-caption whitespace-pre-wrap text-ink/85">{live.result}</p>
          <Button
            size="sm"
            variant="text"
            icon={copied ? <Check /> : <Copy />}
            className="mt-1 -ml-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(live.result ?? '');
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                /* clipboard unavailable */
              }
            }}
          >
            {copied ? 'Copied' : 'Copy draft'}
          </Button>
        </div>
      )}
      {status === 'rejected' && <Pill tone="neutral" className="mt-2">Dismissed</Pill>}
      {status === 'failed' && <p className="mt-2 text-caption text-danger-ink">{live.result ?? 'This action could not be applied.'}</p>}
    </div>
  );
}
