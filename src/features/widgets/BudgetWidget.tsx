import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/context';
import { Money } from '@/components/ui/Money';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { centsToInput, formatMoney, humanizeCategory, parseEuros } from '@/lib/format';
import { BudgetDonut, type Slice } from './budget/BudgetDonut';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';

const SERIES = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)', 'var(--color-series-5)', 'var(--color-series-6)', 'var(--color-series-7)'];
/** Color follows the category's position in the budget, so it never changes when values do. */
export const categoryColor = (index: number) => SERIES[index] ?? 'var(--color-series-other)';

function Tile({ label, minor, hint, tone }: { label: string; minor: number; hint?: string; tone?: 'danger' }) {
  return (
    <div className="min-w-0 rounded-[10px] bg-canvas px-4 py-3.5">
      <dt className="text-caption text-graphite">{label}</dt>
      <dd className={cn('mt-1 text-[22px] leading-tight font-semibold tracking-[-0.5px]', tone === 'danger' && 'text-danger-ink')}>
        <Money minor={minor} />
      </dd>
      {hint && <dd className="mt-0.5 text-caption text-graphite">{hint}</dd>}
    </div>
  );
}

export function BudgetWidget() {
  const { project } = useWorkspace();
  const b = project.budget;
  const [editing, setEditing] = useState(false);

  if (b.totalMinor === 0)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body-sm text-graphite">No budget yet. Add one to see allocations, warnings and what you can still spend.</p>
        <Button variant="ghost" icon={<Plus />} onClick={() => setEditing(true)}>
          Set a budget
        </Button>
        <BudgetEditor open={editing} onClose={() => setEditing(false)} />
      </div>
    );

  const unassigned = Math.max(0, b.totalMinor - b.allocatedMinor - b.emergencyReserveMinor);
  const slices: Slice[] = [
    ...b.categories.map((c, i) => ({ id: c.id, label: humanizeCategory(c.title), minor: c.allocatedMinor, color: categoryColor(i) })),
    { id: '__reserve', label: 'Emergency reserve', minor: b.emergencyReserveMinor, color: 'var(--color-series-other)' },
    ...(unassigned > 0 ? [{ id: '__free', label: 'Not yet assigned', minor: unassigned, color: 'rgb(0 0 0 / 0.12)' }] : []),
  ];
  const spentPct = Math.round((b.committedMinor / b.totalMinor) * 100);

  return (
    <div className="@container flex flex-col gap-7">
      <dl className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">
        <Tile label="Total budget" minor={b.totalMinor} hint={b.confirmed ? undefined : 'Not confirmed yet'} />
        <Tile label="Spent in plan" minor={b.committedMinor} hint={`${spentPct}% of budget`} />
        <Tile label="Remaining" minor={b.remainingMinor} hint="Budget minus spent" tone={b.remainingMinor < 0 ? 'danger' : undefined} />
        <Tile label="Reserve" minor={b.emergencyReserveMinor} hint="Kept for surprises" />
      </dl>
      {project.protection?.car.budgetLink&&<div className="rounded-[10px] bg-canvas px-4 py-3 text-body-sm"><p className="font-medium">Car insurance · {project.protection.car.budgetLink.sourceMode==='demo'?'fictional demo':'quoted'} recurring proposal</p><p className="mt-1 text-graphite">{formatMoney(project.protection.car.budgetLink.premiumMinor)} / {project.protection.car.budgetLink.billingPeriod}. Your {project.protection.car.budgetLink.planningMonths}-month plan includes {formatMoney(project.protection.car.budgetLink.plannedMinor)} in proposed spending. Monthly equivalent: {formatMoney(project.protection.car.budgetLink.monthlyEquivalentMinor,{exact:true})}. No policy has been purchased. Funds available after all proposals and reserve: {formatMoney(b.availableMinor)}.</p>{project.protection.car.budgetLink.needsReview&&<p className="mt-2 text-warn-ink">This price needs revalidation. Your existing proposal is retained for review.</p>}</div>}
      {project.homeInsurance?.expense&&<div className="rounded-[10px] bg-canvas px-4 py-3 text-body-sm"><p className="font-medium">Home insurance · proposed recurring expense</p><p className="mt-1 text-graphite">{formatMoney(project.homeInsurance.expense.premiumMinor)} · {project.homeInsurance.expense.billingPeriod}. Your {project.homeInsurance.expense.planningMonths}-month plan includes {formatMoney(project.homeInsurance.expense.plannedMinor)} in proposed spending. This is not a purchased policy; later renewals are excluded.</p></div>}

      <div className="grid gap-8 @3xl:grid-cols-2">
        <div>
          <h3 className="mb-3 text-body-sm font-semibold">Where your budget goes</h3>
          <BudgetDonut slices={slices} total={b.totalMinor} centerLabel="Total" />
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-body-sm font-semibold">Spent vs. planned</h3>
            <Button size="sm" variant="text" icon={<Pencil />} onClick={() => setEditing(true)} className="-mr-2 text-graphite">
              Edit
            </Button>
          </div>
          <ul className="flex flex-col gap-4">
            {b.categories.map((c, i) => {
              const used = c.committedMinor + c.proposedMinor;
              const over = used > c.allocatedMinor;
              const base = Math.max(c.allocatedMinor, used, 1);
              return (
                <li key={c.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-body-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: categoryColor(i) }} aria-hidden />
                      <span className="truncate" title={c.title}>
                        {humanizeCategory(c.title)}
                      </span>
                    </span>
                    <span className={cn('shrink-0 text-caption tabular', over ? 'font-medium text-danger-ink' : 'text-graphite')}>
                      {over && <AlertTriangle className="mr-1 inline size-3" aria-hidden />}
                      {formatMoney(used)} / {formatMoney(c.allocatedMinor)}
                      {over && ' over'}
                    </span>
                  </div>
                  <div
                    className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-ink/[0.06]"
                    role="img"
                    aria-label={`${c.title}: ${formatMoney(c.committedMinor)} spent, ${formatMoney(c.proposedMinor)} proposed, ${formatMoney(c.allocatedMinor)} planned`}
                  >
                    {c.committedMinor > 0 && <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(c.committedMinor / base) * 100}%`, background: categoryColor(i) }} />}
                    {c.proposedMinor > 0 && <div className="h-full rounded-full opacity-40 transition-[width] duration-500" style={{ width: `${(c.proposedMinor / base) * 100}%`, background: categoryColor(i) }} />}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-caption text-graphite">Solid: spent in your plan · Light: proposed · Track: planned envelope</p>
        </div>
      </div>

      {b.warnings.length > 0 && (
        <details className="group rounded-[10px] bg-warn-tint px-4 py-2.5 text-body-sm text-warn-ink">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {b.warnings.length === 1 ? '1 budget note' : `${b.warnings.length} budget notes`}
            <ChevronDown className="ml-auto size-4 transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {b.warnings.map(w => (
              <li key={w} className="break-words">
                {w}
              </li>
            ))}
          </ul>
        </details>
      )}

      <BudgetEditor open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

interface Row {
  id: string;
  title: string;
  amount: string;
}

function slug(title: string, taken: Set<string>) {
  let base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!/^[a-z]/.test(base)) base = `c_${base}`;
  let id = base || 'category';
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`;
  return id;
}

/** Edits the person-controlled envelopes. The server validates totals and recalculates everything else. */
export function BudgetEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, writer } = useWorkspace();
  const b = project.budget;
  const [total, setTotal] = useState('');
  const [reserve, setReserve] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [tried, setTried] = useState(false);

  if (open && !initialized) {
    setTotal(b.totalMinor ? centsToInput(b.totalMinor) : '');
    setReserve(centsToInput(b.emergencyReserveMinor));
    setRows(b.categories.map(c => ({ id: c.id, title: c.title, amount: centsToInput(c.allocatedMinor) })));
    setInitialized(true);
  }
  if (!open && initialized) {
    setInitialized(false);
    setTried(false);
  }

  const totalMinor = parseEuros(total);
  const reserveMinor = parseEuros(reserve) ?? 0;
  const parsed = rows.map(r => ({ ...r, minor: parseEuros(r.amount) }));
  const sum = parsed.reduce((s, r) => s + (r.minor ?? 0), 0) + reserveMinor;
  const invalid = totalMinor === null || parsed.some(r => r.minor === null || !r.title.trim()) || rows.length === 0;
  const over = totalMinor !== null && sum > totalMinor;

  const save = useMutation({
    mutationFn: () =>
      writer.api.patchProject(project.id, {
        expectedRevision: project.revision,
        budget: {
          totalMinor: totalMinor!,
          emergencyReserveMinor: reserveMinor,
          categories: parsed.map(r => ({ id: r.id, title: r.title.trim(), allocatedMinor: r.minor! })),
        },
      }),
    onSuccess: p => {
      writer.setProject(p);
      toast.success('Budget updated', 'Scenarios and risks were recalculated.');
      onClose();
    },
    onError: writer.reloadOnConflict,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit budget"
      description="Allocations are spending envelopes, not purchases. Categories plus reserve must fit within the total."
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => { if (invalid || over) { setTried(true); requestAnimationFrame(() => document.querySelector<HTMLElement>('dialog[open] [aria-invalid="true"]')?.focus()); } else save.mutate(); }}>
            Save budget
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-body-sm font-medium">
            Total budget (€)
            <Input inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} aria-invalid={tried && (totalMinor === null || over)} />
          </label>
          <label className="flex flex-col gap-1.5 text-body-sm font-medium">
            Emergency reserve (€)
            <Input inputMode="decimal" value={reserve} onChange={e => setReserve(e.target.value)} />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-body-sm font-semibold">Categories</legend>
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2">
                <Input aria-label={`Category ${i + 1} name`} value={r.title} maxLength={80} onChange={e => setRows(rs => rs.map(x => (x.id === r.id ? { ...x, title: e.target.value } : x)))} className="flex-1" aria-invalid={tried && !r.title.trim()} />
                <div className="relative w-32 shrink-0">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body-sm text-graphite" aria-hidden>
                    €
                  </span>
                  <Input aria-label={`${r.title || `Category ${i + 1}`} amount in euros`} inputMode="decimal" value={r.amount} onChange={e => setRows(rs => rs.map(x => (x.id === r.id ? { ...x, amount: e.target.value } : x)))} className="pl-7 text-right" aria-invalid={tried && parseEuros(r.amount) === null} />
                </div>
                <Button size="icon" variant="text" aria-label={`Remove ${r.title || 'category'}`} icon={<Trash2 />} onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))} disabled={rows.length <= 1} />
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="text"
            icon={<Plus />}
            className="mt-2 text-blue-ink"
            disabled={rows.length >= 20}
            onClick={() => setRows(rs => [...rs, { id: slug(`new_${rs.length + 1}`, new Set(rs.map(x => x.id))), title: '', amount: '0' }])}
          >
            Add category
          </Button>
        </fieldset>

        <div className={cn('flex items-center justify-between rounded-[10px] px-4 py-3 text-body-sm', over ? 'bg-danger-tint text-danger-ink' : 'bg-canvas')} aria-live="polite">
          <span>{over ? 'Over your total by' : 'Allocated incl. reserve'}</span>
          <span className="tabular font-semibold">
            {over && totalMinor !== null ? formatMoney(sum - totalMinor) : `${formatMoney(sum)}${totalMinor !== null ? ` of ${formatMoney(totalMinor)}` : ''}`}
          </span>
        </div>
        {tried && invalid && (
          <p role="alert" className="text-body-sm text-danger-ink">
            Fill in the total, every category name and every amount, using numbers only.
          </p>
        )}
        {save.isError && <ErrorState error={save.error} />}
      </div>
    </Dialog>
  );
}
