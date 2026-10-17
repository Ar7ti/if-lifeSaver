import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTypewriter } from '@/features/create/useTypewriter';
import { Reveal } from './motion-kit';

const STEPS = [
  { title: 'Describe your goal', body: 'One sentence is enough: where you are going, when, and what you can spend.' },
  { title: 'Get a workspace, not a chat', body: 'Budget, tasks, research, scenarios and risks appear as a plan you can click through and edit.' },
  { title: 'Decide with real options', body: 'Compare sourced offers, add them to your plan, and see exactly what is still unconfirmed.' },
];

const SENTENCE = ["I'm moving to Turku next month with €2,000. Help me organize everything."];

const WIDGETS = [
  { emoji: '💸', label: 'Budget', note: '€2,000 · 5 envelopes' },
  { emoji: '✅', label: 'Checklist', note: '12 tasks in 4 stages' },
  { emoji: '🛋️', label: 'Furniture', note: 'Economy · Mid · Premium' },
  { emoji: '🚚', label: 'Moving services', note: 'Quotes to compare' },
  { emoji: '⚖️', label: 'Scenarios', note: 'Economy, Balanced, Comfort' },
  { emoji: '🛡️', label: 'Risk Guardian', note: '3 things to check' },
];

function StepOne({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const typed = useTypewriter(SENTENCE, active && !reduce);
  return (
    <div className="card w-full max-w-md p-5 text-left">
      <p className="min-h-[3.2em] text-[17px] leading-[1.5] text-ink">
        {reduce ? SENTENCE[0] : typed}
        <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-blue" aria-hidden />
      </p>
      <div className="mt-4 flex justify-end">
        <span className="inline-flex h-9 items-center gap-2 rounded-button bg-ink px-4 text-body-sm font-medium text-white">
          Create my workspace <ArrowRight className="size-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function StepTwo() {
  return (
    <div className="grid w-full max-w-md grid-cols-2 gap-2.5">
      {WIDGETS.map((w, i) => (
        <motion.div
          key={w.label}
          className="card p-3.5 text-left"
          initial={{ opacity: 0, y: 18, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.08 * i, type: 'spring', stiffness: 260, damping: 22 }}
        >
          <span className="emoji text-[20px]" aria-hidden>
            {w.emoji}
          </span>
          <p className="mt-1.5 text-body-sm font-medium">{w.label}</p>
          <p className="text-caption text-graphite">{w.note}</p>
        </motion.div>
      ))}
    </div>
  );
}

function StepThree() {
  const [added, setAdded] = useState(false);
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="card flex items-center gap-4 p-4 text-left">
        <img src="/illustrations/sofa.png" alt="" width="64" height="64" className="size-16 shrink-0 object-contain" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-medium">3-seat sofa, used</p>
          <p className="text-caption text-graphite">Example listing · estimate</p>
          <p className="mt-1 text-[19px] font-semibold tabular">€120</p>
        </div>
        <motion.span
          className={cn('inline-flex h-8 items-center gap-1.5 rounded-button px-3 text-caption font-medium', added ? 'bg-sky-tint text-blue-ink' : 'bg-fill text-ink')}
          initial={false}
          animate={{ scale: added ? [1, 0.94, 1] : 1 }}
        >
          {added ? <Check className="size-3.5" aria-hidden /> : null}
          {added ? 'In your plan' : 'Add to plan'}
        </motion.span>
      </div>
      <motion.div className="card flex items-center justify-between p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} onAnimationComplete={() => setTimeout(() => setAdded(true), 500)}>
        <span className="text-body-sm text-graphite">Left to plan with</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={added ? 'after' : 'before'} className="text-[22px] font-semibold tracking-[-0.5px] tabular" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}>
            {added ? '€1,880' : '€2,000'}
          </motion.span>
        </AnimatePresence>
      </motion.div>
      <p className="text-caption text-graphite">Nothing is bought. The plan only records your choice.</p>
    </div>
  );
}

function Visual({ step }: { step: number }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        className="flex w-full justify-center"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -18, scale: 0.98 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {step === 0 ? <StepOne active /> : step === 1 ? <StepTwo /> : <StepThree />}
      </motion.div>
    </AnimatePresence>
  );
}

/** Desktop: a pinned stage that walks through three steps as you scroll. Phones: stacked cards. */
export function StoryScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const line = useSpring(scrollYProgress, { stiffness: 120, damping: 26 });
  useMotionValueEvent(scrollYProgress, 'change', v => setStep(v < 0.34 ? 0 : v < 0.67 ? 1 : 2));

  return (
    <section id="how" aria-labelledby="how-heading" className="scroll-mt-20 border-t border-hairline bg-surface">
      {/* Desktop sticky story */}
      <div ref={ref} className={cn('relative hidden lg:block', reduce ? '' : 'h-[300vh]')}>
        <div className={cn('mx-auto grid max-w-[1200px] grid-cols-2 items-center gap-16 px-8', reduce ? 'py-24' : 'sticky top-0 h-dvh')}>
          <div>
            <h2 id="how-heading" className="text-[48px] leading-[1.06] font-semibold tracking-[-1.7px]">
              From one sentence to a plan you can act on.
            </h2>
            <ol className="relative mt-12 flex flex-col gap-8 pl-8">
              <span className="absolute top-1 bottom-1 left-[5px] w-[2px] rounded-full bg-ink/10" aria-hidden />
              <motion.span className="absolute top-1 bottom-1 left-[5px] w-[2px] rounded-full bg-blue" style={{ scaleY: reduce ? 1 : line, originY: 0 }} aria-hidden />
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative" aria-current={step === i ? 'step' : undefined}>
                  <span className={cn('absolute top-1.5 -left-8 size-3 rounded-full ring-4 ring-surface transition-colors duration-300', i <= step || reduce ? 'bg-blue' : 'bg-ink/15')} aria-hidden />
                  <h3 className={cn('text-heading-sm font-semibold transition-colors duration-300', step === i || reduce ? 'text-ink' : 'text-ink/55')}>{s.title}</h3>
                  <p className={cn('mt-1.5 max-w-sm text-body transition-colors duration-300', step === i || reduce ? 'text-graphite' : 'text-ink/55')}>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex min-h-[420px] items-center justify-center rounded-[28px] bg-canvas p-10">
            <Visual step={reduce ? 2 : step} />
          </div>
        </div>
      </div>

      {/* Phones and tablets */}
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 lg:hidden">
        <h2 className="max-w-xl text-[34px] leading-[1.08] font-semibold tracking-[-1.1px] sm:text-[44px]">From one sentence to a plan you can act on.</h2>
        <ol className="mt-10 flex flex-col gap-4">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 0.08} className="rounded-card bg-canvas p-6">
              <span className="grid size-8 place-items-center rounded-full bg-midnight text-body-sm font-semibold text-white">{i + 1}</span>
              <h3 className="mt-4 text-heading-sm font-semibold">{s.title}</h3>
              <p className="mt-2 text-body text-graphite">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
