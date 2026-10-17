import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AlertOctagon, CalendarDays, ChevronRight, CircleHelp, MapPin, PenLine, Users } from 'lucide-react';
import type { LifeProject } from '@contracts';
import { Money } from '@/components/ui/Money';
import { Pill } from '@/components/ui/Pill';
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

function ProgressRing({ pct }: { pct: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(0 0 0 / 0.08)" strokeWidth="3.5" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-blue)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} className="transition-[stroke-dasharray] duration-500" />
    </svg>
  );
}

function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-graphite">{label}</dt>
      <dd className={cn('mt-0.5 text-[22px] leading-tight font-semibold tracking-[-0.5px]', tone === 'danger' && 'text-danger-ink')}>{children}</dd>
    </div>
  );
}

export function ProjectOverview({ project }: { project: LifeProject }) {
  const [editing, setEditing] = useState(false);
  const b = project.budget;
  const done = project.tasks.filter(t => t.status === 'done').length;
  const pct = project.tasks.length ? Math.round((done / project.tasks.length) * 100) : 0;
  const openRisks = project.risks.filter(r => r.status === 'open');
  const high = openRisks.filter(r => r.severity === 'high').length;
  const date = formatDate(project.preferences.moveDate);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} aria-labelledby="project-title" className="mb-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-body-sm text-graphite">
        <Link to="/app/projects" className="rounded hover:text-ink">
          My projects
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="truncate text-ink/80" aria-current="page">
          {project.title}
        </span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 id="project-title" className="text-[30px] leading-[1.1] font-semibold tracking-[-0.9px] sm:text-[36px] sm:tracking-[-1.1px]">
            {project.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body-sm text-graphite">
            <Pill tone="peach">{project.scenarioType === 'moving' ? 'Moving' : 'Life project'}</Pill>
            {project.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden /> {project.location}
              </span>
            )}
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded hover:text-ink">
              <CalendarDays className="size-4" aria-hidden /> {date ?? 'Add move date'}
            </button>
            {project.preferences.householdSize && (
              <span className="flex items-center gap-1.5">
                <Users className="size-4" aria-hidden /> {pluralize(project.preferences.householdSize, 'person', 'people')}
              </span>
            )}
            {project.aiMode === 'local' && <Pill tone="neutral" title="The AI planner was not available; a simpler rule-based planner prepared this plan.">Basic planner</Pill>}
          </div>
        </div>
        <Button variant="text" size="sm" icon={<PenLine />} onClick={() => setEditing(true)} className="text-graphite">
          Edit details
        </Button>
      </div>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <dl className="grid grid-cols-2 gap-x-10 gap-y-4 sm:flex sm:flex-wrap">
          <Stat label="Budget">{b.totalMinor ? <Money minor={b.totalMinor} /> : <span className="text-graphite">Not set</span>}</Stat>
          <Stat label="Spent in plan">
            <Money minor={b.committedMinor} />
          </Stat>
          <Stat label="Remaining" tone={b.remainingMinor < 0 ? 'danger' : undefined}>
            <Money minor={b.remainingMinor} />
          </Stat>
          <div className="relative min-h-9 pl-12">
            <dt className="text-caption text-graphite">Progress</dt>
            <dd className="text-body-sm font-semibold tabular">
              {done}/{project.tasks.length} tasks
            </dd>
            <dd className="absolute top-0 left-0">
              <ProgressRing pct={pct} />
            </dd>
          </div>
        </dl>
        {(openRisks.length > 0 || project.questions.length > 0) && (
          <ul className="flex flex-wrap gap-2" aria-label="Status">
            {project.questions.length > 0 && (
              <li>
                <a href="#questions-heading" className="inline-flex items-center gap-1.5 rounded-full bg-sky-tint px-3 py-1 text-caption font-medium text-blue-ink hover:bg-sky-tint-hover">
                  <CircleHelp className="size-3.5" aria-hidden /> {pluralize(project.questions.length, 'open question')}
                </a>
              </li>
            )}
            {openRisks.length > 0 && (
              <li>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium', high ? 'bg-danger-tint text-danger-ink' : 'bg-warn-tint text-warn-ink')}>
                  <AlertOctagon className="size-3.5" aria-hidden /> {pluralize(openRisks.length, 'thing')} to check{high ? ` · ${high} urgent` : ''}
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {editing && <DetailsDialog open={editing} onClose={() => setEditing(false)} />}
    </motion.section>
  );
}
