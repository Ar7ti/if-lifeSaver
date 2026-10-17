import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Budget } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { Money } from '@/components/ui/Money';
import { Progress } from '@/components/ui/Progress';
import { Pill } from '@/components/ui/Pill';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { centsToInput, formatMoney, parseEuros } from '@/lib/format';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';

function Stat({ label, minor, hint, tone }: { label: string; minor: number; hint?: string; tone?: 'danger' }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-graphite">{label}</dt>
      <dd className={cn('mt-0.5 text-[17px] font-semibold tracking-[-0.2px]', tone === 'danger' && 'text-danger-ink')}>
        <Money minor={minor} />
      </dd>
      {hint && <dd className="text-caption text-graphite">{hint}</dd>}
    </div>
  );
}

/** Segments of the overall budget, all straight from server-calculated fields. */
function BudgetBar({ budget }: { budget: Budget }) {
  const total = Math.max(budget.totalMinor, 1);
  const segs = [
    { key: 'Committed', v: budget.committedMinor, cls: 'bg-blue' },
    { key: 'Proposed', v: budget.proposedMinor, cls: 'bg-sky-wash' },
    { key: 'Emergency reserve', v: budget.emergencyReserveMinor, cls: 'bg-marigold' },
  ];
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-ink/[0.07]" role="img" aria-label={segs.map(s => `${s.key} ${formatMoney(s.v)}`).join(', ') + ` of ${formatMoney(budget.totalMinor)}`}>
        {segs.map(s => (s.v > 0 ? <div key={s.key} className={cn('h-full transition-[width] duration-500', s.cls)} style={{ width: `${Math.min(100, (s.v / total) * 100)}%` }} /> : null))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-graphite" aria-hidden>
        {segs.map(s => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', s.cls)} />
            {s.key}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-ink/[0.12]" />
          Unplanned
        </li>
      </ul>
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption text-graphite">Total budget</p>
          <p className="text-[34px] leading-none font-semibold tracking-[-1px]">
            <Money minor={b.totalMinor} />
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!b.confirmed && <Pill tone="warn">Not confirmed</Pill>}
          <Button size="sm" variant="outline" icon={<Pencil />} onClick={() => setEditing(true)}>
            Edit allocations
          </Button>
        </div>
      </div>

      <BudgetBar budget={b} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Stat label="Reserved" minor={b.emergencyReserveMinor} hint="Emergency reserve" />
        <Stat label="Committed" minor={b.committedMinor} hint="Chosen in your plan" />
        <Stat label="Proposed" minor={b.proposedMinor} hint="Not chosen yet" />
        <Stat label="Available" minor={b.availableMinor} hint="After all of the above" tone={b.availableMinor < 0 ? 'danger' : undefined} />
      </dl>

      {b.categories.length > 0 && (
        <div>
          <h3 className="mb-2 text-body-sm font-semibold">Categories</h3>
          <ul className="flex flex-col gap-3">
            {b.categories.map(c => {
              const used = c.committedMinor + c.proposedMinor;
              const over = used > c.allocatedMinor;
              return (
                <li key={c.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-body-sm">
                    <span className="truncate font-medium">{c.title}</span>
                    <span className={cn('tabular shrink-0 text-graphite', over && 'font-medium text-danger-ink')}>
                      {formatMoney(used)} of {formatMoney(c.allocatedMinor)}
                      {over && ' · over'}
                    </span>
                  </div>
                  <Progress value={used} max={c.allocatedMinor || 1} tone={over ? 'danger' : c.committedMinor > 0 ? 'blue' : 'sky'} label={`${c.title}: ${formatMoney(used)} of ${formatMoney(c.allocatedMinor)}`} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {b.warnings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {b.warnings.map(w => (
            <li key={w} className="flex items-start gap-2 rounded-[10px] bg-warn-tint px-3 py-2 text-body-sm text-warn-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{w}</span>
            </li>
          ))}
        </ul>
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
