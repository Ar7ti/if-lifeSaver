import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, CircleHelp, RotateCcw } from 'lucide-react';
import type { LifeProject, ProjectPatch } from '@contracts';
import { useUi } from '@/stores/ui';
import { toast } from '@/stores/toast';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useWorkspace } from './context';

type Kind = 'moveDate' | 'origin' | 'householdSize' | 'deliveryRequired' | 'allowUsed';

/** Recognizes which structured preference a planner question asks for, so it gets a fitting input. */
function detect(question: string): Kind[] {
  const q = question.toLowerCase();
  const kinds: Kind[] = [];
  if (/(move|moving) date|exact date|when (are|do|will) you (move|moving)/.test(q)) kinds.push('moveDate');
  if (/moving from|where .{0,20}from|current (city|address|home)/.test(q)) kinds.push('origin');
  if (/how many people|household|people (are )?moving/.test(q)) kinds.push('householdSize');
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
  const kinds = useMemo(() => detect(question), [question]);
  const p = project.preferences;
  const [moveDate, setMoveDate] = useState(p.moveDate ?? '');
  const [origin, setOrigin] = useState(p.origin ?? '');
  const [people, setPeople] = useState(p.householdSize ? String(p.householdSize) : '');
  const [delivery, setDelivery] = useState<boolean | null>(p.deliveryRequired);
  const [used, setUsed] = useState<boolean | null>(p.allowUsed);
  const [text, setText] = useState('');
  const [showText, setShowText] = useState(kinds.length === 0);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // Focus follows the person only after they answered or skipped, never on page load.
  useEffect(() => {
    if (autoFocus) first.current?.focus({ preventScroll: true });
  }, [question, autoFocus]);

  const save = useMutation({
    mutationFn: (patch: ProjectPatch) => writer.api.patchProject(project.id, patch),
    onSuccess: (res: LifeProject, patch) => {
      writer.setProject(res);
      const parts: string[] = [];
      if (patch.preferences?.moveDate) parts.push(formatDate(patch.preferences.moveDate) ?? patch.preferences.moveDate);
      if (patch.preferences?.origin) parts.push(`from ${patch.preferences.origin}`);
      if (patch.preferences?.householdSize) parts.push(`${patch.preferences.householdSize} people`);
      if (patch.preferences?.deliveryRequired != null) parts.push(patch.preferences.deliveryRequired ? 'delivery needed' : 'no delivery');
      if (patch.preferences?.allowUsed != null) parts.push(patch.preferences.allowUsed ? 'second-hand OK' : 'new only');
      if (text.trim()) parts.push(text.trim());
      onDone(parts.join(' · '));
    },
    onError: writer.reloadOnConflict,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const prefs: NonNullable<ProjectPatch['preferences']> = {};
    if (kinds.includes('moveDate') && moveDate) prefs.moveDate = moveDate;
    if (kinds.includes('origin') && origin.trim()) prefs.origin = origin.trim();
    if (kinds.includes('householdSize') && people.trim()) {
      const n = Number(people);
      if (!Number.isInteger(n) || n < 1 || n > 30) {
        setError('Enter the number of people as a whole number from 1 to 30.');
        return;
      }
      prefs.householdSize = n;
    }
    if (kinds.includes('deliveryRequired') && delivery !== null && delivery !== p.deliveryRequired) prefs.deliveryRequired = delivery;
    if (kinds.includes('allowUsed') && used !== null && used !== p.allowUsed) prefs.allowUsed = used;
    const answer = text.trim();
    if (answer) {
      // Free-text answers are kept in the plan notes, which the AI assistant reads.
      const entry = `Q: ${question}\nA: ${answer}`;
      prefs.notes = [p.notes, entry].filter(Boolean).join('\n\n').slice(-4000);
    }
    // Confirming a value the plan already has needs no request (and must not mark research stale).
    const confirmsExisting =
      (kinds.includes('deliveryRequired') && delivery !== null && delivery === p.deliveryRequired) ||
      (kinds.includes('allowUsed') && used !== null && used === p.allowUsed);
    if (Object.keys(prefs).length === 0 && confirmsExisting) {
      onDone([delivery !== null && kinds.includes('deliveryRequired') ? (delivery ? 'delivery needed' : 'no delivery') : '', used !== null && kinds.includes('allowUsed') ? (used ? 'second-hand OK' : 'new only') : ''].filter(Boolean).join(' · '));
      return;
    }
    if (Object.keys(prefs).length === 0) {
      setError(kinds.length ? 'Fill in at least one answer, or skip this question for now.' : 'Type your answer, or skip this question for now.');
      first.current?.focus();
      return;
    }
    setError(null);
    save.mutate({ preferences: prefs, expectedRevision: project.revision });
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
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-caption font-medium text-graphite tabular">
        Question {index + 1} of {total}
      </p>
      <h3 className="text-[19px] leading-snug font-semibold tracking-[-0.2px] text-ink" id={`qa-title-${index}`}>
        {question}
      </h3>

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
          {kinds.includes('origin') && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId('origin')} className="text-caption font-medium text-graphite">
                {LABELS.origin}
              </label>
              <Input ref={focusRef()} id={fieldId('origin')} value={origin} maxLength={200} onChange={e => setOrigin(e.target.value)} placeholder="e.g. Helsinki" className="h-10" autoComplete="address-level2" />
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

/** "Questions for you": the planner's open questions, answered one at a time, inline. */
export function QuestionsBlock() {
  const { project } = useWorkspace();
  const answered = useUi(s => s.answered[project.id]);
  const markAnswered = useUi(s => s.markAnswered);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [interacted, setInteracted] = useState(false);

  // A question whose recognized details are all already in the plan needs no new answer.
  const prefs = project.preferences;
  const covered = (q: string) => {
    const kinds = detect(q);
    return kinds.length > 0 && kinds.every(k => prefs[k] !== null && prefs[k] !== '');
  };
  const open = project.questions.filter(q => answered?.[q] === undefined && !covered(q));
  const queue = [...open.filter(q => !skipped.includes(q)), ...open.filter(q => skipped.includes(q))];
  const current = queue[0];
  const fromDetails = project.questions.filter(q => answered?.[q] === undefined && covered(q)).map(q => [q, 'Already in your plan details'] as [string, string]);
  const doneEntries = [...Object.entries(answered ?? {}).filter(([, a]) => a), ...fromDetails];
  const total = open.length + doneEntries.length;
  const doneCount = total - open.length;

  if (!current && doneEntries.length === 0) return null;

  return (
    <section aria-labelledby="questions-heading" className="mb-8 overflow-hidden rounded-card bg-surface ring-1 ring-hairline">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 sm:px-6">
        <h2 id="questions-heading" className="flex items-center gap-2 text-body font-semibold">
          <CircleHelp className="size-4 text-blue-ink" aria-hidden />
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

      <div className="px-5 py-5 sm:px-6">
        <AnimatePresence mode="wait" initial={false}>
          {current ? (
            <motion.div key={current} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              <QuestionForm
                question={current}
                index={doneCount}
                total={total}
                autoFocus={interacted}
                onDone={summary => {
                  setInteracted(true);
                  markAnswered(project.id, current, summary || 'Answered');
                  toast.success('Answer saved', 'Your plan has been updated.');
                }}
                onSkip={() => {
                  setInteracted(true);
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
                    {project.questions.includes(q) && (
                      <Button
                        size="sm"
                        variant="text"
                        icon={<RotateCcw />}
                        onClick={() => useUi.setState(s => {
                          const next = { ...(s.answered[project.id] ?? {}) };
                          delete next[q];
                          return { answered: { ...s.answered, [project.id]: next } };
                        })}
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
