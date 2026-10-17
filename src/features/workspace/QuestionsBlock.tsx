import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import type { LifeProject, ProjectPatch } from '@contracts';
import { toast } from '@/stores/toast';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useWorkspace } from './context';

type Kind = 'moveDate' | 'origin' | 'householdSize' | 'deliveryRequired' | 'allowUsed' | 'location' | 'budget' | 'startDate' | 'endDate' | 'durationDays' | 'travelers' | 'vehicleType' | 'useCase' | 'ownsFurniture' | 'ownedItems';

/** Recognizes which structured preference a planner question asks for, so it gets a fitting input. */
function detect(question: string, scenario: LifeProject['scenarioType']): Kind[] {
  const q = question.toLowerCase();
  const kinds: Kind[] = [];
  if (scenario === 'moving' && /(move|moving) date|exact date|when (are|do|will) you (move|moving)/.test(q)) kinds.push('moveDate');
  if (/moving from|travel(?:ing)? from|where .{0,20}from|current (city|address|home)|origin/.test(q)) kinds.push('origin');
  if (scenario === 'moving' && /how many people|household|people (are )?moving/.test(q)) kinds.push('householdSize');
  if (scenario === 'travel' && /when|start date|departure date|travel dates?/.test(q)) kinds.push('startDate');
  if (scenario === 'travel' && /end date|return date|returning/.test(q)) kinds.push('endDate');
  if (scenario === 'travel' && /how long|duration|how many days|how many nights/.test(q)) kinds.push('durationDays');
  if (scenario === 'travel' && /how many people|travelers|travellers|people (are )?traveling/.test(q)) kinds.push('travelers');
  if (/where (are you|will you|do you)|destination|which (city|country|place)/.test(q) && !/\bfrom\b/.test(q)) kinds.push('location');
  if (/budget|how much (?:can|will|do) you spend|spending limit/.test(q)) kinds.push('budget');
  if (scenario === 'car_purchase' && /kind of vehicle|type of (?:car|vehicle)|what (?:car|vehicle)/.test(q)) kinds.push('vehicleType');
  if (scenario === 'car_purchase' && /how will you .*use|use (?:the|your) car|mainly use|use case/.test(q)) kinds.push('useCase');
  if (/what (?:furniture|items) do you (?:already )?(?:own|have)|which .*already own/.test(q)) kinds.push('ownedItems');
  if (/do you (?:already )?own (?:all |any )?furniture|own furniture/.test(q)) kinds.push('ownsFurniture');
  if (/deliver|movers/.test(q)) kinds.push('deliveryRequired');
  if (/\bused\b|second-hand|secondhand/.test(q)) kinds.push('allowUsed');
  return kinds;
}

const LABELS: Record<Kind, string> = {
  moveDate: 'Move date',
  origin: 'Moving from',
  householdSize: 'People moving',
  deliveryRequired: 'Need delivery or movers?',
  allowUsed: 'Second-hand OK?',
  location: 'Destination',
  budget: 'Budget (€)',
  startDate: 'Start date',
  endDate: 'End date',
  durationDays: 'Days',
  travelers: 'Travelers',
  vehicleType: 'Vehicle type',
  useCase: 'Main use',
  ownsFurniture: 'Already own furniture?',
  ownedItems: 'Items you already own',
};

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-caption font-medium text-graphite">{label}</legend>
      <div className="flex gap-2">
        {[true, false].map(v => (
          <label
            key={String(v)}
            className={cn(
              'cursor-pointer rounded-full border px-4 py-1.5 text-body-sm font-medium transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue',
              value === v ? 'border-blue bg-sky-tint text-blue-ink' : 'border-hairline-strong text-ink/75 hover:bg-hover',
            )}
          >
            <input type="radio" className="sr-only" checked={value === v} onChange={() => onChange(v)} />
            {v ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function QuestionForm({ question, index, total, onDone, onSkip, autoFocus }: { question: string; index: number; total: number; onDone: (summary: string) => void; onSkip: () => void; autoFocus: boolean }) {
  const { project, writer } = useWorkspace();
  const kinds = useMemo(() => detect(question, project.scenarioType), [question, project.scenarioType]);
  const p = project.preferences;
  const [moveDate, setMoveDate] = useState(p.moveDate ?? '');
  const [startDate, setStartDate] = useState(p.startDate ?? '');
  const [endDate, setEndDate] = useState(p.endDate ?? '');
  const [duration, setDuration] = useState(p.durationDays == null ? '' : String(p.durationDays));
  const [travelers, setTravelers] = useState(p.travelers == null ? '' : String(p.travelers));
  const [origin, setOrigin] = useState(p.origin ?? '');
  const [people, setPeople] = useState(p.householdSize ? String(p.householdSize) : '');
  const [location, setLocation] = useState(project.location ?? '');
  const [budget, setBudget] = useState(project.budget.confirmed ? (project.budget.totalMinor / 100).toFixed(2) : '');
  const [vehicleType, setVehicleType] = useState(p.vehicleType ?? '');
  const [useCase, setUseCase] = useState(p.useCase ?? '');
  const [ownsFurniture, setOwnsFurniture] = useState<boolean | null>(p.ownsFurniture ?? null);
  const [ownedItems, setOwnedItems] = useState((p.ownedItems ?? []).join(', '));
  const [delivery, setDelivery] = useState<boolean | null>(p.deliveryRequired);
  const [used, setUsed] = useState<boolean | null>(p.allowUsed ?? null);
  const [text, setText] = useState('');
  const [showText, setShowText] = useState(kinds.length === 0);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // Focus follows the person only after they answered or skipped here, never on page load,
  // and never while they are typing somewhere else (e.g. the assistant answered this question).
  useEffect(() => {
    if (!autoFocus) return;
    const active = document.activeElement;
    const block = document.getElementById('questions');
    if (active && active !== document.body && !block?.contains(active)) return;
    first.current?.focus({ preventScroll: true });
  }, [question, autoFocus]);

  const save = useMutation({
    mutationFn: (patch: ProjectPatch) => writer.api.patchProject(project.id, patch),
    onSuccess: (res: LifeProject, patch) => {
      writer.setProject(res);
      onDone(patch.answers?.[0]?.answer ?? 'Answered');
    },
    onError: writer.reloadOnConflict,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const prefs: NonNullable<ProjectPatch['preferences']> = {};
    const parts: string[] = [];
    const dated = (value: string) => formatDate(value) ?? value;
    if (kinds.includes('moveDate') && moveDate) { parts.push(dated(moveDate)); if (moveDate !== p.moveDate) prefs.moveDate = moveDate; }
    if (kinds.includes('startDate') && startDate) { parts.push(`from ${dated(startDate)}`); if (startDate !== p.startDate) prefs.startDate = startDate; }
    if (kinds.includes('endDate') && endDate) { parts.push(`until ${dated(endDate)}`); if (endDate !== p.endDate) prefs.endDate = endDate; }
    if (kinds.includes('origin') && origin.trim()) { parts.push(`from ${origin.trim()}`); if (origin.trim() !== p.origin) prefs.origin = origin.trim(); }
    if (kinds.includes('location') && location.trim()) parts.push(location.trim());
    if (kinds.includes('householdSize') && people.trim()) {
      const n = Number(people);
      if (!Number.isInteger(n) || n < 1 || n > 30) {
        setError('Enter the number of people as a whole number from 1 to 30.');
        return;
      }
      parts.push(`${n} people`);
      if (n !== p.householdSize) prefs.householdSize = n;
    }
    for (const [kind, raw, max, label] of [
      ['durationDays', duration, 366, 'days'], ['travelers', travelers, 30, 'travelers'],
    ] as const) {
      if (!kinds.includes(kind) || !raw.trim()) continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > max) { setError(`Enter ${label} as a whole number from 1 to ${max}.`); return; }
      parts.push(`${n} ${label}`);
      if (n !== p[kind]) prefs[kind] = n;
    }
    if (kinds.includes('vehicleType') && vehicleType.trim()) { parts.push(vehicleType.trim()); if (vehicleType.trim() !== p.vehicleType) prefs.vehicleType = vehicleType.trim(); }
    if (kinds.includes('useCase') && useCase.trim()) { parts.push(useCase.trim()); if (useCase.trim() !== p.useCase) prefs.useCase = useCase.trim(); }
    if (kinds.includes('ownsFurniture') && ownsFurniture !== null) { parts.push(ownsFurniture ? 'already own furniture' : 'need furniture'); if (ownsFurniture !== p.ownsFurniture) prefs.ownsFurniture = ownsFurniture; }
    if (kinds.includes('ownedItems') && ownedItems.trim()) {
      const items = [...new Set(ownedItems.split(',').map(item => item.trim()).filter(Boolean))];
      if (items.length > 50 || items.some(item => item.length > 80)) { setError('List up to 50 items, each under 80 characters.'); return; }
      parts.push(`already own ${items.join(', ')}`);
      if (JSON.stringify(items) !== JSON.stringify(p.ownedItems ?? [])) prefs.ownedItems = items;
    }
    if (kinds.includes('deliveryRequired') && delivery !== null) { parts.push(delivery ? 'delivery needed' : 'no delivery'); if (delivery !== p.deliveryRequired) prefs.deliveryRequired = delivery; }
    if (kinds.includes('allowUsed') && used !== null) { parts.push(used ? 'second-hand OK' : 'new only'); if (used !== p.allowUsed) prefs.allowUsed = used; }
    let totalMinor: number | undefined;
    if (kinds.includes('budget') && budget.trim()) {
      const amount = budget.trim().replace(',', '.');
      if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) { setError('Enter a euro amount with no more than two decimal places.'); return; }
      const [euros, cents = ''] = amount.split('.');
      totalMinor = Number(euros) * 100 + Number(cents.padEnd(2, '0'));
      if (!Number.isSafeInteger(totalMinor) || totalMinor > 1_000_000_000) { setError('Enter a budget up to €10,000,000.'); return; }
      parts.push(`€${(totalMinor / 100).toFixed(2)}`);
    }
    const answer = text.trim();
    if (answer) {
      const entry = `Q: ${question}\nA: ${answer}`;
      prefs.notes = [p.notes, entry].filter(Boolean).join('\n\n').slice(-4000);
      parts.push(answer);
    }
    if (parts.length === 0) {
      setError(kinds.length ? 'Fill in at least one answer, or skip this question for now.' : 'Type your answer, or skip this question for now.');
      first.current?.focus();
      return;
    }
    setError(null);
    save.mutate({
      ...(Object.keys(prefs).length ? {preferences:prefs} : {}),
      ...(kinds.includes('location') && location.trim() && location.trim() !== project.location ? {location:location.trim()} : {}),
      ...(totalMinor !== undefined && (!project.budget.confirmed || totalMinor !== project.budget.totalMinor) ? {budget:{totalMinor}} : {}),
      answers:[{question,answer:parts.join(' · ').slice(0,2000)}],
      expectedRevision:project.revision,
    });
  }

  const changesSearch = kinds.some(k => k === 'deliveryRequired' || k === 'allowUsed') && project.researchResults.length > 0;
  const fieldId = (k: string) => `qa-${k}-${index}`;
  let focusAssigned = false;
  const focusRef = () => {
    if (focusAssigned) return undefined;
    focusAssigned = true;
    return first;
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-[16px] bg-canvas p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface text-body-sm font-medium tabular shadow-[0_0_0_1px_rgb(0_0_0/0.05)]" aria-hidden>
          {index + 1}
        </span>
        <div className="min-w-0">
          <h3 className="text-[18px] leading-snug font-medium tracking-[-0.2px] text-ink" id={`qa-title-${index}`}>
            {question}
          </h3>
          <p className="mt-0.5 text-caption text-graphite tabular">
            Question {index + 1} of {total}
          </p>
        </div>
      </div>

      {kinds.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {kinds.includes('moveDate') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('date')} className="text-caption font-medium text-graphite">
                {LABELS.moveDate}
              </label>
              <Input ref={focusRef()} id={fieldId('date')} type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} className="h-10" />
            </div>
          )}
          {kinds.includes('startDate') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('startDate')} className="text-caption font-medium text-graphite">{LABELS.startDate}</label>
              <Input ref={focusRef()} id={fieldId('startDate')} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-10" />
            </div>
          )}
          {kinds.includes('endDate') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('endDate')} className="text-caption font-medium text-graphite">{LABELS.endDate}</label>
              <Input ref={focusRef()} id={fieldId('endDate')} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-10" />
            </div>
          )}
          {kinds.includes('durationDays') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('duration')} className="text-caption font-medium text-graphite">{LABELS.durationDays}</label>
              <Input ref={focusRef()} id={fieldId('duration')} type="number" inputMode="numeric" min={1} max={366} value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 5" className="h-10" />
            </div>
          )}
          {kinds.includes('travelers') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('travelers')} className="text-caption font-medium text-graphite">{LABELS.travelers}</label>
              <Input ref={focusRef()} id={fieldId('travelers')} type="number" inputMode="numeric" min={1} max={30} value={travelers} onChange={e => setTravelers(e.target.value)} placeholder="e.g. 2" className="h-10" />
            </div>
          )}
          {kinds.includes('origin') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('origin')} className="text-caption font-medium text-graphite">
                {LABELS.origin}
              </label>
              <Input ref={focusRef()} id={fieldId('origin')} value={origin} maxLength={200} onChange={e => setOrigin(e.target.value)} placeholder="e.g. Helsinki" className="h-10" autoComplete="address-level2" />
            </div>
          )}
          {kinds.includes('location') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('location')} className="text-caption font-medium text-graphite">{LABELS.location}</label>
              <Input ref={focusRef()} id={fieldId('location')} value={location} maxLength={200} onChange={e => setLocation(e.target.value)} placeholder="e.g. Rome" className="h-10" autoComplete="address-level2" />
            </div>
          )}
          {kinds.includes('budget') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('budget')} className="text-caption font-medium text-graphite">{LABELS.budget}</label>
              <Input ref={focusRef()} id={fieldId('budget')} type="text" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. 900.00" className="h-10" />
            </div>
          )}
          {kinds.includes('householdSize') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('people')} className="text-caption font-medium text-graphite">
                {LABELS.householdSize}
              </label>
              <Input ref={focusRef()} id={fieldId('people')} type="number" inputMode="numeric" min={1} max={30} value={people} onChange={e => setPeople(e.target.value)} placeholder="e.g. 2" className="h-10" aria-invalid={Boolean(error && people)} />
            </div>
          )}
          {kinds.includes('deliveryRequired') && <YesNo label={LABELS.deliveryRequired} value={delivery} onChange={setDelivery} />}
          {kinds.includes('allowUsed') && <YesNo label={LABELS.allowUsed} value={used} onChange={setUsed} />}
          {kinds.includes('vehicleType') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('vehicleType')} className="text-caption font-medium text-graphite">{LABELS.vehicleType}</label>
              <Input ref={focusRef()} id={fieldId('vehicleType')} value={vehicleType} maxLength={100} onChange={e => setVehicleType(e.target.value)} placeholder="e.g. used family car" className="h-10" />
            </div>
          )}
          {kinds.includes('useCase') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('useCase')} className="text-caption font-medium text-graphite">{LABELS.useCase}</label>
              <Input ref={focusRef()} id={fieldId('useCase')} value={useCase} maxLength={300} onChange={e => setUseCase(e.target.value)} placeholder="e.g. commuting" className="h-10" />
            </div>
          )}
          {kinds.includes('ownsFurniture') && <YesNo label={LABELS.ownsFurniture} value={ownsFurniture} onChange={setOwnsFurniture} />}
          {kinds.includes('ownedItems') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('ownedItems')} className="text-caption font-medium text-graphite">{LABELS.ownedItems}</label>
              <Input ref={focusRef()} id={fieldId('ownedItems')} value={ownedItems} onChange={e => setOwnedItems(e.target.value)} placeholder="e.g. bed, desk" className="h-10" />
            </div>
          )}
        </div>
      )}

      {showText ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldId('text')} className="text-caption font-medium text-graphite">
            {kinds.length ? 'Anything else to add?' : 'Your answer'}
          </label>
          <Textarea
            ref={kinds.length ? undefined : first}
            id={fieldId('text')}
            rows={2}
            maxLength={1000}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
            }}
            placeholder={kinds.length ? 'Optional details' : 'Type your answer'}
            className="resize-none"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowText(true)} className="self-start rounded-button text-body-sm font-medium text-blue-ink hover:underline">
          Add details in your own words
        </button>
      )}

      {changesSearch && <p className="text-caption text-graphite">Changing delivery or second-hand preferences marks earlier searches as out of date.</p>}
      {error && (
        <p role="alert" className="text-body-sm text-danger-ink">
          {error}
        </p>
      )}
      {save.isError && <ErrorState error={save.error} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={save.isPending} icon={<ArrowRight />} className="flex-row-reverse">
          {index + 1 < total ? 'Save and continue' : 'Save answer'}
        </Button>
        <Button variant="text" onClick={onSkip} disabled={save.isPending}>
          Skip for now
        </Button>
      </div>
    </form>
  );
}

/**
 * Questions still waiting for an answer, as the server reports them. The server owns
 * reconciliation (known facts, chat answers), so the browser keeps no answer state of its own.
 */
export function openQuestions(project: LifeProject) {
  const saved = project.answeredQuestions ?? {};
  return project.questions.filter(q => !saved[q]);
}

/** "Questions for you": the planner's open questions, answered one at a time, inline. */
export function QuestionsBlock() {
  const { project } = useWorkspace();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);

  const open = openQuestions(project);
  const queue = [...open.filter(q => !skipped.includes(q)), ...open.filter(q => skipped.includes(q))];
  const current = editingQuestion ?? queue[0];
  const doneEntries = Object.entries(project.answeredQuestions ?? {}).filter(([q, a]) => a && !open.includes(q));
  const total = open.length + doneEntries.length;
  const doneCount = total - open.length;

  if (!current && doneEntries.length === 0) return null;

  return (
    <section id="questions" aria-labelledby="questions-heading" className="card mb-6 scroll-mt-24 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 id="questions-heading" className="flex items-center gap-2.5 text-[20px] font-medium tracking-[-0.4px]">
          <span className="emoji text-[19px]" aria-hidden>
            💬
          </span>
          Questions for you
        </h2>
        {total > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: Math.min(total, 12) }).map((_, i) => (
                <span key={i} className={cn('h-1.5 w-4 rounded-full transition-colors duration-300', i < doneCount ? 'bg-blue' : 'bg-ink/10')} />
              ))}
            </div>
            <span className="text-caption text-graphite tabular">
              {doneCount} of {total} answered
            </span>
          </div>
        )}
      </div>

      <div className="px-5 pt-4 pb-5 sm:px-6 sm:pb-6">
        <AnimatePresence mode="wait" initial={false}>
          {current ? (
            <motion.div key={current} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              <QuestionForm
                question={current}
                index={doneCount}
                total={total}
                autoFocus={interacted}
                onDone={() => {
                  setInteracted(true);
                  setEditingQuestion(null);
                  toast.success('Answer saved', 'Your plan has been updated.');
                }}
                onSkip={() => {
                  setInteracted(true);
                  if (editingQuestion) { setEditingQuestion(null); return; }
                  setSkipped(s => [...s.filter(x => x !== current), current]);
                }}
              />
            </motion.div>
          ) : (
            <motion.p key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-body-sm text-ok-ink">
              <Check className="size-4" aria-hidden /> All questions answered. Your plan uses these details from now on.
            </motion.p>
          )}
        </AnimatePresence>

        {doneEntries.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-3">
            <button onClick={() => setReviewing(v => !v)} aria-expanded={reviewing} className="text-caption font-medium text-graphite hover:text-ink">
              {reviewing ? 'Hide your answers' : `Review your answers (${doneEntries.length})`}
            </button>
            {reviewing && (
              <ul className="mt-2 flex flex-col gap-2">
                {doneEntries.map(([q, a]) => (
                  <li key={q} className="flex items-start justify-between gap-3 text-body-sm">
                    <span className="min-w-0">
                      <span className="text-graphite">{q}</span>
                      <span className="block font-medium text-ink">{a}</span>
                    </span>
                    {(project.questions.includes(q) || Boolean(project.answeredQuestions?.[q])) && (
                      <Button
                        size="sm"
                        variant="text"
                        icon={<RotateCcw />}
                        onClick={() => { setEditingQuestion(q); setInteracted(true); setReviewing(false); }}
                      >
                        Change
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
