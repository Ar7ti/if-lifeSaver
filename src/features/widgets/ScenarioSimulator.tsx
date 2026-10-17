import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Check, ChevronDown, Gauge, Info, Leaf, RotateCw, Scale, Sparkles, type LucideIcon } from 'lucide-react';
import type { Offer, SimulationScenario } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { useUi } from '@/stores/ui';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
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
const EASE = [0.22, 1, 0.36, 1] as const;

/** Three-step meter that always shows its value in words, not only as filled bars. */
function Meter({ label, value, hint }: { label: string; value: keyof typeof LEVEL; hint: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption text-graphite">{label}</span>
        <span className="text-body-sm font-medium capitalize">{value}</span>
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden>
        {[1, 2, 3].map(i => (
          <motion.span key={i} className="h-1.5 flex-1 rounded-full" initial={false} animate={{ backgroundColor: i <= LEVEL[value] ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.08)' }} transition={{ duration: 0.25, delay: i * 0.04 }} />
        ))}
      </div>
      <p className="mt-1 text-caption text-graphite">{hint}</p>
    </div>
  );
}

/** Budget impact: estimated total against the budget, with the reserve marked. */
function BudgetImpact({ s, totalBudget }: { s: SimulationScenario; totalBudget: number }) {
  const base = Math.max(totalBudget, s.estimatedTotalMinor, 1);
  const spend = (s.estimatedTotalMinor / base) * 100;
  const reserveStart = totalBudget > 0 ? ((totalBudget - s.emergencyReserveMinor) / base) * 100 : 100;
  const over = s.remainingMinor < 0;
  return (
    <div>
      <div className="relative h-2 overflow-hidden rounded-full bg-ink/[0.07]" role="img" aria-label={`${formatMoney(s.estimatedTotalMinor)} of a ${formatMoney(totalBudget)} budget`}>
        <motion.div className={cn('h-full rounded-full', over ? 'bg-coral' : s.withinBudget ? 'bg-blue' : 'bg-saffron')} initial={false} animate={{ width: `${Math.min(100, spend)}%` }} transition={{ duration: 0.45, ease: EASE }} />
        {totalBudget > 0 && s.emergencyReserveMinor > 0 && <span className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${reserveStart}%` }} aria-hidden />}
      </div>
      <p className={cn('mt-1.5 flex items-center gap-1.5 text-body-sm', s.withinBudget ? 'text-ok-ink' : over ? 'text-danger-ink' : 'text-warn-ink')}>
        {s.withinBudget ? <Check className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
        {s.remainingMinor >= 0 ? `${formatMoney(s.remainingMinor)} left of ${formatMoney(totalBudget)}` : `${formatMoney(-s.remainingMinor)} over budget`}
        {s.withinBudget ? '' : s.remainingMinor >= 0 ? ' · dips into your reserve' : ''}
      </p>
    </div>
  );
}

export function ScenarioSimulator() {
  const { project, writer } = useWorkspace();
  const chosenId = useUi(s => s.chosenScenario[project.id]);
  const choose = useUi(s => s.chooseScenario);
  const [confirm, setConfirm] = useState(false);
  const [viewed, setViewed] = useState<SimulationScenario['id'] | null>(null);
  const reduce = useReducedMotion();

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
  const scenarios = project.scenarios;
  const current = scenarios.find(s => s.id === (viewed ?? chosenId)) ?? scenarios.find(s => s.id === 'balanced') ?? scenarios[0]!;
  const cheapest = Math.min(...scenarios.map(s => s.estimatedTotalMinor));
  // Honest comparison: if the engine produced the same outcome for every approach, say so.
  const identical = scenarios.every(s => s.estimatedTotalMinor === scenarios[0]!.estimatedTotalMinor && s.convenience === scenarios[0]!.convenience && s.effort === scenarios[0]!.effort && s.selectedOfferIds.join() === scenarios[0]!.selectedOfferIds.join());
  const picked = current.selectedOfferIds.map(id => offers.get(id)).filter((o): o is Offer => Boolean(o));
  const notInPlan = picked.filter(o => !inCart.has(o.id));
  const meta = META[current.id];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm text-graphite">Three ways to reach your goal. Totals keep the items already in your plan.</p>
        <Button size="sm" variant="text" icon={<RotateCw />} loading={recalc.isPending} onClick={() => recalc.mutate()} className="-mr-2">
          Recalculate
        </Button>
      </div>

      {/* Selector: shows the real total for each approach; the difference only when there is one. */}
      <LayoutGroup id={`scenarios-${project.id}`}>
        <div role="tablist" aria-label="Approaches" className="grid grid-cols-3 gap-1 rounded-[14px] bg-ink/[0.05] p-1"
          onKeyDown={e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const i = scenarios.findIndex(s => s.id === current.id);
            const next = scenarios[(i + (e.key === 'ArrowRight' ? 1 : scenarios.length - 1)) % scenarios.length]!;
            setViewed(next.id);
            requestAnimationFrame(() => document.getElementById(`scn-tab-${project.id}-${next.id}`)?.focus());
          }}>
          {scenarios.map(s => {
            const active = s.id === current.id;
            const Icon = META[s.id].icon;
            const delta = s.estimatedTotalMinor - cheapest;
            return (
              <button
                key={s.id}
                id={`scn-tab-${project.id}-${s.id}`}
                role="tab"
                aria-selected={active}
                aria-controls={`scn-panel-${project.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setViewed(s.id)}
                className={cn('relative flex min-h-12 flex-col items-center justify-center rounded-[10px] px-2 py-2 text-center transition-colors duration-150', active ? 'text-ink' : 'text-ink/60 hover:text-ink')}
              >
                {active && <motion.span layoutId="scn-indicator" className="absolute inset-0 rounded-[10px] bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)]" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }} />}
                <span className="relative flex items-center gap-1.5 text-body-sm font-medium">
                  <Icon className="size-3.5 max-sm:hidden" aria-hidden />
                  {s.name}
                  {chosenId === s.id && (
                    <>
                      <Check className="size-3.5 text-blue-ink" aria-hidden />
                      <span className="sr-only">(your plan)</span>
                    </>
                  )}
                </span>
                <span className="relative text-caption text-graphite tabular">
                  {formatMoney(s.estimatedTotalMinor)}
                  {!identical && delta > 0 && <span className="max-sm:hidden"> · +{formatMoney(delta)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      {identical && (
        <p className="-mt-1 flex items-start gap-1.5 px-1 text-caption text-graphite">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Same total for all three right now. They start to differ once research finds priced options; until then, the trade-offs set them apart.</span>
        </p>
      )}

      <div id={`scn-panel-${project.id}`} role="tabpanel" aria-labelledby={`scn-tab-${project.id}-${current.id}`} className="overflow-hidden rounded-[16px] bg-canvas">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={current.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: EASE }} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-caption text-graphite">
                  <span className={cn('size-2 rounded-full', meta.accent)} aria-hidden />
                  {meta.goal}
                </p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[30px] leading-tight font-semibold tracking-[-0.8px]">
                    <Money minor={current.estimatedTotalMinor} />
                  </span>
                  <span className="text-body-sm text-graphite">estimated total</span>
                </p>
              </div>
              {chosenId === current.id ? (
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-sky-tint px-3 text-body-sm font-medium text-blue-ink">
                  <Check className="size-4" aria-hidden /> Your plan
                </span>
              ) : (
                <Button size="sm" variant="primary" onClick={() => choose(project.id, current.id)}>
                  Plan with {current.name}
                </Button>
              )}
            </div>

            <div className="mt-4">
              <BudgetImpact s={current} totalBudget={project.budget.totalMinor} />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Meter label="Convenience" value={current.convenience} hint={current.convenience === 'high' ? 'Less to arrange yourself' : current.convenience === 'low' ? 'More to arrange yourself' : 'Some arranging needed'} />
              <Meter label="Effort" value={current.effort} hint={current.effort === 'high' ? 'Expect more time and legwork' : current.effort === 'low' ? 'Light on your time' : 'A moderate amount of time'} />
            </div>

            {current.tradeOffs.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1.5 border-t border-hairline pt-4">
                {current.tradeOffs.slice(0, 2).map(t => (
                  <li key={t} className="flex items-start gap-2 text-body-sm text-ink/85">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-ink/40" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            )}

            {notInPlan.length > 0 && <p className="mt-3 text-caption text-blue-ink">{pluralize(notInPlan.length, 'option')} in this approach not yet in your plan</p>}

            <details className="group mt-3 text-caption">
              <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-graphite hover:text-ink [&::-webkit-details-marker]:hidden">
                Details
                <ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-3 grid gap-3 text-graphite sm:grid-cols-2">
                <p className="tabular">
                  {formatMoney(current.verifiedCostMinor)} verified · {formatMoney(current.estimatedCostMinor)} estimated
                </p>
                <div>
                  <p className="font-medium text-ink/85">Included</p>
                  <p className="mt-0.5">{picked.length > 0 ? picked.map(o => o.title).join(' · ') : current.lockedCartItemIds.length ? `${pluralize(current.lockedCartItemIds.length, 'item')} already in your plan` : 'Allocation estimates only: no researched options yet'}</p>
                </div>
                {current.tradeOffs.length > 2 && (
                  <div>
                    <p className="font-medium text-ink/85">More trade-offs</p>
                    <ul className="mt-0.5 flex list-disc flex-col gap-0.5 pl-4">
                      {current.tradeOffs.slice(2).map(t => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {current.risks.length > 0 && (
                  <div>
                    <p className="font-medium text-ink/85">Risks</p>
                    <ul className="mt-0.5 flex list-disc flex-col gap-0.5 pl-4">
                      {current.risks.map(r => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {current.missingData.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="font-medium text-ink/85">Based on estimates</p>
                    <ul className="mt-0.5 flex flex-col gap-1">
                      {current.missingData.map(m => (
                        <li key={m} className="break-words">
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          </motion.div>
        </AnimatePresence>
      </div>

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
