import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, PenLine, Sparkles } from 'lucide-react';
import type { LifeProject } from '@contracts';
import { Money } from '@/components/ui/Money';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { ErrorState } from '@/components/ui/States';
import { formatDate, formatMoney, pluralize } from '@/lib/format';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';
import { useWorkspace } from './context';
import { scenarioIllustration, scrollToSection } from './scroll';
import { openQuestions } from './QuestionsBlock';

type Tri = 'yes' | 'no' | 'unsure';
const toTri = (v: boolean | null): Tri => (v === null ? 'unsure' : v ? 'yes' : 'no');
const fromTri = (v: Tri) => (v === 'unsure' ? null : v === 'yes');

function DetailsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, writer } = useWorkspace();
  const p = project.preferences;
  const moving = project.scenarioType === 'moving';
  const travel = project.scenarioType === 'travel';
  const purchasing = ['moving','home_furnishing','car_purchase'].includes(project.scenarioType);
  const [moveDate, setMoveDate] = useState((travel ? p.startDate : p.moveDate) ?? '');
  const [endDate, setEndDate] = useState(p.endDate ?? '');
  const [duration, setDuration] = useState(p.durationDays ? String(p.durationDays) : '');
  const [vehicleType, setVehicleType] = useState(p.vehicleType ?? '');
  const [useCase, setUseCase] = useState(p.useCase ?? '');
  const [origin, setOrigin] = useState(p.origin ?? '');
  const [household, setHousehold] = useState((travel ? p.travelers : p.householdSize) ? String(travel ? p.travelers : p.householdSize) : '');
  const [delivery, setDelivery] = useState<Tri>(toTri(p.deliveryRequired));
  const [used, setUsed] = useState<Tri>(toTri(p.allowUsed));
  const [location, setLocation] = useState(project.location ?? '');

  const constraintsChange = fromTri(delivery) !== p.deliveryRequired || fromTri(used) !== p.allowUsed || (location.trim() || null) !== project.location;
  const hasResearch = project.researchResults.length > 0;
  const size = household.trim() ? Number(household) : null;
  const peopleValid = size === null || (Number.isInteger(size) && size >= 1 && size <= 30);
  const durationValid = !duration || (Number.isInteger(Number(duration)) && Number(duration)>=1 && Number(duration)<=366);
  const datesValid = !travel || !moveDate || !endDate || endDate>=moveDate;
  const valid = peopleValid && (!travel || (durationValid && datesValid));

  const save = useMutation({
    mutationFn: () =>
      writer.api.patchProject(project.id, {
        expectedRevision: project.revision,
        ...(location.trim() && location.trim() !== project.location ? { location: location.trim() } : {}),
        preferences: {
          ...(travel ? {startDate:moveDate||null,endDate:endDate||null,durationDays:duration?Number(duration):null,travelers:size} : {moveDate:moveDate||null,householdSize:size}),
          ...(project.scenarioType==='car_purchase'?{vehicleType:vehicleType.trim()||null,useCase:useCase.trim()||null}:{}),
          origin: origin.trim() || null,
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
      wide
      className="h-dvh max-h-dvh rounded-none sm:h-[min(40rem,calc(100dvh-3rem))] sm:w-[min(48rem,calc(100vw-3rem))] sm:rounded-card"
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
        <Field label={project.scenarioType==='car_purchase'?'Search location':'Destination'}>{props => <Input {...props} value={location} maxLength={200} onChange={e => setLocation(e.target.value)} placeholder="City, country" />}</Field>
        <Field label={moving ? 'Move date' : travel ? 'Departure date' : 'Target date'}>{props => <Input {...props} type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} />}</Field>
        {(moving||travel)&&<Field label={travel?'Traveling from':'Moving from'}>{props => <Input {...props} value={origin} maxLength={200} onChange={e => setOrigin(e.target.value)} placeholder="Current city" />}</Field>}
        {(moving||travel)&&<Field label={travel?'Travelers':'People moving'} hint={peopleValid ? undefined : 'Use a whole number from 1 to 30.'}>
          {props => <Input {...props} type="number" min={1} max={30} value={household} onChange={e => setHousehold(e.target.value)} aria-invalid={!peopleValid} />}
        </Field>}
        {purchasing&&<div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium" aria-hidden>Need items delivered?</span>
          <Segmented label="Need items delivered?" value={delivery} onChange={setDelivery} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }]} className="self-start" />
        </div>}
        {purchasing&&<div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium" aria-hidden>Second-hand OK?</span>
          <Segmented label="Second-hand OK?" value={used} onChange={setUsed} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }]} className="self-start" />
        </div>}
        {travel&&<>
          <Field label="Return date" hint={datesValid?undefined:'Return date must be on or after departure.'}>{props=><Input {...props} type="date" aria-invalid={!datesValid} value={endDate} onChange={e=>setEndDate(e.target.value)}/>}</Field>
          <Field label="Trip duration (days)" hint={durationValid?undefined:'Use a whole number from 1 to 366.'}>{props=><Input {...props} type="number" min={1} max={366} aria-invalid={!durationValid} value={duration} onChange={e=>setDuration(e.target.value)}/>}</Field>
        </>}
        {project.scenarioType==='car_purchase'&&<>
          <Field label="Vehicle type">{props=><Input {...props} value={vehicleType} onChange={e=>setVehicleType(e.target.value)} maxLength={100}/>}</Field>
          <Field label="Primary use">{props=><Input {...props} value={useCase} onChange={e=>setUseCase(e.target.value)} maxLength={300}/>}</Field>
        </>}
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

function Chip({ children, onClick, label }: { children: React.ReactNode; onClick?: () => void; label?: string }) {
  const cls = 'inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-3 text-caption font-medium text-ink/80 shadow-[0_0_0_1px_rgb(0_0_0/0.08)]';
  return onClick ? (
    <button onClick={onClick} aria-label={label} className={cn(cls, 'transition-colors duration-150 hover:bg-hover')}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}

function Emoji({ children }: { children: string }) {
  return (
    <span className="emoji" aria-hidden>
      {children}
    </span>
  );
}

function CardAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button size="sm" variant="primary" onClick={onClick} icon={<ArrowRight />} className="flex-row-reverse">
      {children}
    </Button>
  );
}

function Ring({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 15;
  return (
    <svg viewBox="0 0 36 36" className="size-12 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(0 0 0 / 0.07)" strokeWidth="3.5" />
      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-blue)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} className="transition-[stroke-dasharray] duration-500" />
    </svg>
  );
}

interface Attention {
  key: string;
  emoji: string;
  title: string;
  detail: string;
  target: string;
}

export function ProjectOverview({ project }: { project: LifeProject }) {
  const { ask } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const b = project.budget;
  const done = project.tasks.filter(t => t.status === 'done').length;
  const pct = project.tasks.length ? Math.round((done / project.tasks.length) * 100) : 0;
  const nextTask = project.tasks.find(t => t.status !== 'done');
  const openRisks = project.risks.filter(r => r.status === 'open');
  const date = formatDate(project.scenarioType==='travel'?project.preferences.startDate:project.preferences.moveDate);
  const spentPct = b.totalMinor ? Math.min(100, (b.committedMinor / b.totalMinor) * 100) : 0;
  const questionCount = openQuestions(project).length;

  const attention: Attention[] = [];
  if (questionCount > 0) attention.push({ key: 'q', emoji: '💬', title: questionCount === 1 ? '1 question for you' : `${questionCount} questions for you`, detail: 'Answer to sharpen your plan', target: 'questions' });
  for (const r of openRisks.filter(r => r.severity === 'high').slice(0, 2)) attention.push({ key: r.id, emoji: '🛡️', title: r.title, detail: r.preventiveAction, target: 'w-risk_guardian' });
  const unknownDelivery = project.cart.filter(i => i.deliveryCostMinor === null).length;
  if (unknownDelivery > 0) attention.push({ key: 'd', emoji: '🚚', title: unknownDelivery === 1 ? 'Delivery cost unknown' : `${unknownDelivery} delivery costs unknown`, detail: 'Confirm with the seller', target: 'w-shopping_cart' });

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} aria-labelledby="project-title" className="mb-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-body-sm text-graphite">
          <Link to="/app/projects" className="rounded hover:text-ink">
            My projects
          </Link>
          <span aria-hidden>/</span>
          <span className="truncate text-ink" aria-current="page">
            {project.title}
          </span>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<PenLine />} onClick={() => setEditing(true)}>
            Edit details
          </Button>
          <Button variant="primary" size="sm" icon={<Sparkles />} onClick={() => ask()}>
            Ask assistant
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <img src={scenarioIllustration(project.scenarioType, project.title)} alt="" width="64" height="64" className="size-14 shrink-0 object-contain sm:size-16" aria-hidden />
        <div className="min-w-0">
          <h1 id="project-title" className="text-[30px] leading-[1.1] font-medium tracking-[-0.9px] sm:text-[40px] sm:tracking-[-1.3px]">
            {project.title}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Chip>
              <Emoji>{project.scenarioType === 'moving' ? '📦' : '✨'}</Emoji> {{moving:'Moving',travel:'Travel',car_purchase:'Car purchase',home_furnishing:'Home furnishing',student_life:'Student life',other:'Life project'}[project.scenarioType]}
            </Chip>
            {project.location && (
              <Chip>
                <Emoji>📍</Emoji> {project.location}
              </Chip>
            )}
            <Chip onClick={() => setEditing(true)} label={date ? `Date ${date}, edit` : 'Add project date'}>
              <Emoji>📅</Emoji> {date ?? 'Add date'}
            </Chip>
            {project.preferences.householdSize && (
              <Chip>
                <Emoji>👥</Emoji> {pluralize(project.preferences.householdSize, 'person', 'people')}
              </Chip>
            )}
            {project.aiMode === 'local' && <Chip>Basic planner</Chip>}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-body-sm font-medium">
              <Emoji>💸</Emoji> Budget
            </p>
            <Chip>{b.totalMinor ? formatMoney(b.totalMinor) : 'Not set'} total</Chip>
          </div>
          <div>
            <p className={cn('text-[30px] leading-none font-medium tracking-[-0.8px]', b.remainingMinor < 0 && 'text-danger-ink')}>
              <Money minor={b.remainingMinor} />
            </p>
            <p className="mt-1.5 text-body-sm text-graphite">{b.remainingMinor < 0 ? 'over budget' : 'left to plan with'}</p>
          </div>
          <div className="mt-auto flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                <div className="h-full rounded-full bg-blue transition-[width] duration-500" style={{ width: `${spentPct}%` }} />
              </div>
              <p className="mt-1.5 text-caption text-graphite tabular">{formatMoney(b.committedMinor)} spent in plan</p>
            </div>
            <CardAction onClick={() => scrollToSection('w-budget')}>Budget</CardAction>
          </div>
        </div>

        <div className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-body-sm font-medium">
              <Emoji>✅</Emoji> Checklist
            </p>
            <Chip>
              {done}/{project.tasks.length} done
            </Chip>
          </div>
          <div className="flex items-center gap-3">
            <Ring pct={pct} />
            <div className="min-w-0">
              <p className="text-[30px] leading-none font-medium tracking-[-0.8px] tabular">{pct}%</p>
              <p className="mt-1.5 text-body-sm text-graphite">complete</p>
            </div>
          </div>
          <div className="mt-auto flex items-end justify-between gap-3">
            <p className="min-w-0 text-caption text-graphite">
              {nextTask ? (
                <>
                  Next: <span className="text-ink/85">{nextTask.title}</span>
                </>
              ) : (
                'Everything is done'
              )}
            </p>
            <CardAction onClick={() => scrollToSection('w-task_list')}>Tasks</CardAction>
          </div>
        </div>

        <div className="card flex flex-col gap-1 p-2 md:col-span-2 xl:col-span-1">
          <p className="flex items-center gap-2 px-3 pt-3 pb-1 text-body-sm font-medium">
            <Emoji>🔔</Emoji> Needs attention
          </p>
          {attention.length === 0 ? (
            <p className="px-3 pb-3 text-body-sm text-graphite">All clear. Nothing urgent right now ✨</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {attention.slice(0, 3).map(a => (
                <li key={a.key}>
                  <button onClick={() => (a.target === 'questions' ? scrollToSection('questions') : scrollToSection(a.target))} className="group flex w-full items-center gap-3 rounded-[14px] p-2.5 text-left transition-colors duration-150 hover:bg-canvas">
                    <span className="emoji grid size-10 shrink-0 place-items-center rounded-[12px] bg-canvas text-[18px] transition-colors duration-150 group-hover:bg-surface" aria-hidden>
                      {a.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-medium text-ink">{a.title}</span>
                      <span className="block truncate text-caption text-graphite">{a.detail}</span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-graphite transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && <DetailsDialog open={editing} onClose={() => setEditing(false)} />}
    </motion.section>
  );
}
