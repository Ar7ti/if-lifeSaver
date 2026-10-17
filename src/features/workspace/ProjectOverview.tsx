import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AlertOctagon, CalendarDays, ChevronRight, CircleHelp, MapPin, PenLine, Users } from 'lucide-react';
import type { LifeProject } from '@contracts';
import { Money } from '@/components/ui/Money';
import { Pill } from '@/components/ui/Pill';
import { Progress } from '@/components/ui/Progress';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { ErrorState } from '@/components/ui/States';
import { formatDate, pluralize } from '@/lib/format';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';
import { useWorkspace } from './context';

type Tri = 'yes' | 'no' | 'unsure';
const toTri = (v: boolean | null): Tri => (v === null ? 'unsure' : v ? 'yes' : 'no');
const fromTri = (v: Tri) => (v === 'unsure' ? null : v === 'yes');

function Kpi({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 bg-surface px-5 py-4', className)}>
      <dt className="text-caption text-graphite">{label}</dt>
      <dd className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.5px]">{children}</dd>
      {hint && <dd className="mt-0.5 text-caption text-graphite">{hint}</dd>}
    </div>
  );
}

function DetailsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, writer } = useWorkspace();
  const p = project.preferences;
  const [moveDate, setMoveDate] = useState(p.moveDate ?? '');
  const [origin, setOrigin] = useState(p.origin ?? '');
  const [household, setHousehold] = useState(p.householdSize ? String(p.householdSize) : '');
  const [delivery, setDelivery] = useState<Tri>(toTri(p.deliveryRequired));
  const [used, setUsed] = useState<Tri>(toTri(p.allowUsed));
  const [location, setLocation] = useState(project.location ?? '');

  const constraintsChange = fromTri(delivery) !== p.deliveryRequired || fromTri(used) !== p.allowUsed || (location.trim() || null) !== project.location;
  const hasResearch = project.researchResults.length > 0;
  const size = household.trim() ? Number(household) : null;
  const valid = size === null || (Number.isInteger(size) && size >= 1 && size <= 30);

  const save = useMutation({
    mutationFn: () =>
      writer.api.patchProject(project.id, {
        expectedRevision: project.revision,
        ...(location.trim() && location.trim() !== project.location ? { location: location.trim() } : {}),
        preferences: {
          moveDate: moveDate || null,
          origin: origin.trim() || null,
          householdSize: size,
          deliveryRequired: fromTri(delivery),
          allowUsed: fromTri(used),
        },
      }),
    onSuccess: res => {
      writer.setProject(res);
      toast.success('Plan details saved', res.questions.length ? `${pluralize(res.questions.length, 'question')} still open.` : 'Your plan is up to date.');
      onClose();
    },
    onError: writer.reloadOnConflict,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Plan details"
      description="The more you confirm, the fewer guesses the plan has to make."
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => (valid ? save.mutate() : requestAnimationFrame(() => document.querySelector<HTMLElement>('dialog[open] [aria-invalid="true"]')?.focus()))}>
            Save details
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Destination">{props => <Input {...props} value={location} maxLength={200} onChange={e => setLocation(e.target.value)} placeholder="City, country" />}</Field>
        <Field label={project.scenarioType === 'moving' ? 'Move date' : 'Target date'}>{props => <Input {...props} type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} />}</Field>
        <Field label="Moving from">{props => <Input {...props} value={origin} maxLength={200} onChange={e => setOrigin(e.target.value)} placeholder="Current city" />}</Field>
        <Field label="People moving" hint={valid ? undefined : 'Use a whole number from 1 to 30.'}>
          {props => <Input {...props} type="number" min={1} max={30} value={household} onChange={e => setHousehold(e.target.value)} aria-invalid={!valid} />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium" aria-hidden>Need items delivered?</span>
          <Segmented label="Need items delivered?" value={delivery} onChange={setDelivery} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }]} className="self-start" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium" aria-hidden>Second-hand OK?</span>
          <Segmented label="Second-hand OK?" value={used} onChange={setUsed} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }]} className="self-start" />
        </div>
        {constraintsChange && hasResearch && (
          <p className="rounded-[10px] bg-warn-tint px-3 py-2 text-body-sm text-warn-ink sm:col-span-2" role="status">
            Changing the destination, delivery or second-hand preference marks earlier searches as out of date. You can search again afterwards.
          </p>
        )}
        {save.isError && <ErrorState error={save.error} className="sm:col-span-2" />}
      </div>
    </Dialog>
  );
}

export function ProjectOverview({ project }: { project: LifeProject }) {
  const [editing, setEditing] = useState(false);
  const b = project.budget;
  const done = project.tasks.filter(t => t.status === 'done').length;
  const pct = project.tasks.length ? Math.round((done / project.tasks.length) * 100) : 0;
  const urgent = project.risks.filter(r => r.status === 'open' && r.severity === 'high').slice(0, 3);
  const date = formatDate(project.preferences.moveDate);
  const statusTone = { planning: 'blue', active: 'yellow', completed: 'ok' } as const;

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} aria-labelledby="project-title" className="mb-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-body-sm text-graphite">
        <Link to="/app/projects" className="rounded hover:text-ink">
          My projects
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="truncate text-ink/80" aria-current="page">
          {project.title}
        </span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 id="project-title" className="text-[30px] leading-[1.1] font-semibold tracking-[-0.9px] sm:text-heading sm:tracking-[-1.2px]">
            {project.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body-sm text-graphite">
            {project.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden /> {project.location}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden /> {date ?? 'Date not set'}
            </span>
            {project.preferences.householdSize && (
              <span className="flex items-center gap-1.5">
                <Users className="size-4" aria-hidden /> {pluralize(project.preferences.householdSize, 'person', 'people')}
              </span>
            )}
            <Pill tone={statusTone[project.status]} className="capitalize">
              {project.status}
            </Pill>
            {project.aiMode === 'local' && <Pill tone="neutral" title="The AI planner was not available; a simpler rule-based planner prepared this plan.">Basic planner</Pill>}
          </div>
        </div>
        <Button variant="outline" icon={<PenLine />} onClick={() => setEditing(true)}>
          Edit plan details
        </Button>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Budget" hint={b.confirmed ? undefined : 'Not confirmed'}>
          {b.totalMinor ? <Money minor={b.totalMinor} /> : <span className="text-graphite">Not set</span>}
        </Kpi>
        <Kpi label="Planned spending" hint="Chosen in your plan">
          <Money minor={b.committedMinor} />
        </Kpi>
        <Kpi label="Remaining" hint="Budget minus planned">
          <span className={cn(b.remainingMinor < 0 && 'text-danger-ink')}>
            <Money minor={b.remainingMinor} />
          </span>
        </Kpi>
        <Kpi label="Free to plan" hint="After proposals and reserve">
          <span className={cn(b.availableMinor < 0 && 'text-danger-ink')}>
            <Money minor={b.availableMinor} />
          </span>
        </Kpi>
        <Kpi label="Progress" className="col-span-2 sm:col-span-2 lg:col-span-1" hint={`${done} of ${project.tasks.length} tasks`}>
          <span className="tabular">{pct}%</span>
          <Progress value={pct} label="Project progress" className="mt-2" height={4} />
        </Kpi>
      </dl>

      {(project.questions.length > 0 || urgent.length > 0) && (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
          {project.questions.length > 0 && (
            <div className="rounded-card bg-peach/60 p-5">
              <h2 className="flex items-center gap-2 text-body font-semibold">
                <CircleHelp className="size-4" aria-hidden /> {project.questions.length === 1 ? 'One question for a sharper plan' : `${project.questions.length} questions for a sharper plan`}
              </h2>
              <ul className="mt-2 flex flex-col gap-1 text-body-sm text-ink/80">
                {project.questions.map(q => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <Button size="sm" variant="outline" className="mt-3 bg-surface" onClick={() => setEditing(true)}>
                Answer now
              </Button>
            </div>
          )}
          {urgent.length > 0 && (
            <div className="card p-5">
              <h2 className="flex items-center gap-2 text-body font-semibold">
                <AlertOctagon className="size-4 text-danger-ink" aria-hidden /> Top priorities
              </h2>
              <ul className="mt-2 flex flex-col gap-2">
                {urgent.map(r => (
                  <li key={r.id} className="text-body-sm">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-graphite"> · {r.preventiveAction}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {editing && <DetailsDialog open={editing} onClose={() => setEditing(false)} />}
    </motion.section>
  );
}
