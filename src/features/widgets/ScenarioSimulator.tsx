import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, LayoutGroup } from 'motion/react';
import { AlertTriangle, Check, Gauge, Leaf, RotateCw, Scale, Sparkles, type LucideIcon } from 'lucide-react';
import type { Offer, SimulationScenario } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { useUi } from '@/stores/ui';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Pill } from '@/components/ui/Pill';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/States';
import { formatMoney, formatTime, pluralize } from '@/lib/format';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';

const META: Record<SimulationScenario['id'], { icon: LucideIcon; goal: string; accent: string }> = {
  economy: { icon: Leaf, goal: 'Spend as little as possible', accent: 'bg-sky-wash' },
  balanced: { icon: Scale, goal: 'Price, practicality and convenience', accent: 'bg-blue' },
  comfort: { icon: Sparkles, goal: 'Ease and convenience first', accent: 'bg-marigold' },
};

const LEVEL = { low: 1, medium: 2, high: 3 } as const;

/** Three-step meter that always shows its value in words, not only as filled bars. */
function Meter({ label, value }: { label: string; value: keyof typeof LEVEL }) {
  return (
    <div className="flex items-center justify-between gap-2 text-caption">
      <span className="text-graphite">{label}</span>
      <span className="flex items-center gap-2">
        <span className="flex gap-0.5" aria-hidden>
          {[1, 2, 3].map(i => (
            <span key={i} className={cn('h-1.5 w-4 rounded-full', i <= LEVEL[value] ? 'bg-ink/70' : 'bg-ink/10')} />
          ))}
        </span>
        <span className="w-12 font-medium capitalize text-ink/85">{value}</span>
      </span>
    </div>
  );
}

function ScenarioCard({ s, chosen, onChoose, offers, inCartIds }: { s: SimulationScenario; chosen: boolean; onChoose: () => void; offers: Map<string, Offer>; inCartIds: Set<string> }) {
  const meta = META[s.id];
  const picked = s.selectedOfferIds.map(id => offers.get(id)).filter((o): o is Offer => Boolean(o));
  const verifiedShare = s.estimatedTotalMinor ? (s.verifiedCostMinor / s.estimatedTotalMinor) * 100 : 0;
  return (
    <motion.li layout className="flex">
      <label
        className={cn(
          'relative flex w-full cursor-pointer flex-col gap-4 rounded-card border bg-surface p-5 transition-[border-color,box-shadow] duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue',
          chosen ? 'border-blue shadow-[0_0_0_3px_rgba(0,117,222,0.14)]' : 'border-hairline hover:border-hairline-strong',
        )}
      >
        <input
          type="radio"
          name="scenario"
          className="sr-only"
          checked={chosen}
          onChange={onChoose}
          aria-label={`${s.name}: ${formatMoney(s.estimatedTotalMinor)} estimated, ${s.remainingMinor >= 0 ? `${formatMoney(s.remainingMinor)} left` : `${formatMoney(-s.remainingMinor)} over budget`}`}
        />
        <span className={cn('absolute inset-x-5 top-0 h-[3px] rounded-b-full', meta.accent)} aria-hidden />
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-[17px] font-semibold">
              <meta.icon className="size-4" aria-hidden /> {s.name}
            </p>
            <p className="mt-0.5 text-caption text-graphite">{meta.goal}</p>
          </div>
          {chosen ? (
            <Pill tone="blue">
              <Check /> Your plan
            </Pill>
          ) : (
            <span className="text-caption font-medium text-graphite">Choose</span>
          )}
        </div>

        <div>
          <p className="text-caption text-graphite">Estimated total</p>
          <p className="text-[28px] leading-tight font-semibold tracking-[-0.8px]">
            <Money minor={s.estimatedTotalMinor} />
          </p>
          <p className={cn('mt-0.5 text-body-sm', s.withinBudget ? 'text-ok-ink' : 'text-danger-ink')}>
            {s.withinBudget ? <Check className="mr-1 inline size-3.5" aria-hidden /> : <AlertTriangle className="mr-1 inline size-3.5" aria-hidden />}
            {s.remainingMinor >= 0 ? `${formatMoney(s.remainingMinor)} left` : `${formatMoney(-s.remainingMinor)} over budget`}
            {s.withinBudget ? ', within budget' : ''}
          </p>
        </div>

        <div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-warn-tint" role="img" aria-label={`${formatMoney(s.verifiedCostMinor)} verified, ${formatMoney(s.estimatedCostMinor)} estimated`}>
            <div className="h-full bg-ok-ink/70" style={{ width: `${verifiedShare}%` }} />
          </div>
          <p className="mt-1 text-caption text-graphite tabular">
            {formatMoney(s.verifiedCostMinor)} verified · {formatMoney(s.estimatedCostMinor)} estimated
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Meter label="Convenience" value={s.convenience} />
          <Meter label="Effort" value={s.effort} />
        </div>

        <div>
          <p className="text-caption font-medium text-ink/85">Included</p>
          <p className="mt-0.5 text-caption text-graphite">
            {picked.length > 0 ? picked.map(o => o.title).slice(0, 3).join(' · ') + (picked.length > 3 ? ` +${picked.length - 3} more` : '') : s.lockedCartItemIds.length ? `${pluralize(s.lockedCartItemIds.length, 'item')} already in your plan` : 'Allocation estimates only: no researched options yet'}
          </p>
          {picked.some(o => !inCartIds.has(o.id)) && <p className="mt-0.5 text-caption text-blue-ink">{pluralize(picked.filter(o => !inCartIds.has(o.id)).length, 'option')} not yet in your plan</p>}
        </div>

        {s.tradeOffs.length > 0 && (
          <div>
            <p className="text-caption font-medium text-ink/85">Trade-offs</p>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-caption text-graphite">
              {s.tradeOffs.slice(0, 3).map(t => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {s.risks.length > 0 && (
          <ul className="flex flex-col gap-1">
            {s.risks.slice(0, 2).map(r => (
              <li key={r} className="flex items-start gap-1.5 rounded-md bg-warn-tint px-2 py-1.5 text-caption text-warn-ink">
                <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden /> {r}
              </li>
            ))}
          </ul>
        )}

        {s.missingData.length > 0 && (
          <details className="mt-auto text-caption" onClick={e => e.stopPropagation()}>
            <summary className="cursor-pointer font-medium text-graphite hover:text-ink">{pluralize(s.missingData.length, 'figure')} based on estimates</summary>
            <ul className="mt-1.5 flex flex-col gap-1 text-graphite">
              {s.missingData.map(m => (
                <li key={m} className="break-words">
                  {m}
                </li>
              ))}
            </ul>
          </details>
        )}
      </label>
    </motion.li>
  );
}

export function ScenarioSimulator() {
  const { project, writer } = useWorkspace();
  const chosenId = useUi(s => s.chosenScenario[project.id]);
  const choose = useUi(s => s.chooseScenario);
  const [confirm, setConfirm] = useState(false);

  const offers = useMemo(() => new Map(project.researchResults.flatMap(r => r.offers).map(o => [o.id, o])), [project.researchResults]);
  const inCart = useMemo(() => new Set(project.cart.map(i => i.offerId).filter((x): x is string => Boolean(x))), [project.cart]);
  const chosen = project.scenarios.find(s => s.id === chosenId);
  const toAdd = chosen ? chosen.selectedOfferIds.filter(id => !inCart.has(id) && offers.has(id)) : [];

  const recalc = useMutation({
    mutationFn: () => writer.api.recalculateScenarios(project.id),
    onSuccess: () => {
      void writer.refresh();
      toast.success('Scenarios recalculated');
    },
    onError: writer.fail,
  });

  const apply = useMutation({
    mutationFn: async (ids: string[]) => {
      let added = 0;
      for (const offerId of ids) {
        const res = await writer.api.addCartItem(project.id, { offerId, quantity: 1, status: 'selected' });
        writer.applyCart(res);
        added++;
      }
      return added;
    },
    onSuccess: n => {
      setConfirm(false);
      toast.success(`${pluralize(n, 'option')} added to your plan`, 'Nothing has been bought.');
    },
    onError: e => {
      setConfirm(false);
      writer.fail(e);
    },
  });

  if (project.scenarios.length === 0)
    return (
      <EmptyState
        icon={<Gauge />}
        title="No scenarios yet"
        action={
          <Button size="sm" variant="outline" icon={<RotateCw />} loading={recalc.isPending} onClick={() => recalc.mutate()}>
            Calculate scenarios
          </Button>
        }
      >
        Scenarios compare three ways to reach your goal once a budget is set.
      </EmptyState>
    );

  const calculatedAt = project.scenarios[0]?.calculatedAt;

  return (
    <div className="@container flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm text-graphite">Pick the approach you want to plan around. Totals keep the items already in your plan.</p>
        <Button size="sm" variant="text" icon={<RotateCw />} loading={recalc.isPending} onClick={() => recalc.mutate()}>
          Recalculate
        </Button>
      </div>
      <LayoutGroup>
        <ul className="grid grid-cols-1 gap-3 @2xl:grid-cols-3" aria-label="Scenarios">
          {project.scenarios.map(s => (
            <ScenarioCard key={s.id} s={s} chosen={chosenId === s.id} onChoose={() => choose(project.id, s.id)} offers={offers} inCartIds={inCart} />
          ))}
        </ul>
      </LayoutGroup>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-graphite">{calculatedAt && `Calculated at ${formatTime(calculatedAt)} from your current plan.`} Prices are estimates unless marked verified.</p>
        {chosen && toAdd.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            Add {chosen.name}&rsquo;s {pluralize(toAdd.length, 'option')} to my plan
          </Button>
        )}
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Add ${chosen?.name ?? ''} options to your plan?`}
        description="These go into your planning list. Nothing is bought, reserved or sent."
        footer={
          <>
            <Button variant="text" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={apply.isPending} onClick={() => apply.mutate(toAdd)}>
              Add {pluralize(toAdd.length, 'option')}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col divide-y divide-hairline">
          {toAdd.map(id => {
            const o = offers.get(id)!;
            return (
              <li key={id} className="flex justify-between gap-3 py-2 text-body-sm">
                <span className="min-w-0">{o.title}</span>
                <span className="shrink-0 font-semibold tabular">{formatMoney(o.priceMinor)}</span>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </div>
  );
}
