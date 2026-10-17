import { createContext, useContext, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { AlertTriangle, Check, LayoutGrid, Sparkles, Store, Truck, Wallet, ShieldCheck } from 'lucide-react';
import { CountUp } from './motion-kit';

/** True once the preview has scrolled into view: its content then animates in, once. */
const Live = createContext(false);
import { cn } from '@/lib/cn';
import { LogoMark } from '@/features/shell/Logo';

/**
 * A composed, static picture of a moving workspace for the landing page.
 * It is labelled as illustrative; none of its figures come from the API.
 */
function MiniBar({ label, spent, total, tone }: { label: string; spent: number; total: number; tone: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px]">
        <span className="font-medium text-ink/80">{label}</span>
        <span className="tabular text-graphite">
          €{spent} / €{total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
        <motion.div className={cn('h-full rounded-full', tone)} initial={false} animate={{ width: useContext(Live) ? `${(spent / total) * 100}%` : '0%' }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} />
      </div>
    </div>
  );
}

function Panel({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[10px] border border-hairline bg-surface p-3.5', className)}>
      <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink [&_svg]:size-3.5 [&_svg]:text-graphite">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function PreviewTask({ title, done, delay }: { title: string; done: boolean; delay: number }) {
  const live = useContext(Live);
  const checked = done && live;
  return (
    <li className="flex items-center gap-2 rounded-md border border-hairline px-2 py-1.5 text-[11px]">
      <motion.span
        className="grid size-3.5 place-items-center rounded-[4px] border"
        initial={false}
        animate={checked ? { backgroundColor: '#0075de', borderColor: '#0075de', scale: [1, 1.25, 1] } : { backgroundColor: 'rgba(0,0,0,0)', borderColor: 'rgba(0,0,0,0.25)' }}
        transition={{ delay, duration: 0.35 }}
      >
        <motion.span initial={false} animate={{ scale: checked ? 1 : 0 }} transition={{ delay: delay + 0.05, type: 'spring', stiffness: 500, damping: 22 }} className="text-white">
          <Check className="size-2.5" />
        </motion.span>
      </motion.span>
      <motion.span className="relative" initial={false} animate={{ color: checked ? '#615d59' : '#000000' }} transition={{ delay }}>
        {title}
        <motion.span className="absolute top-1/2 left-0 h-px w-full bg-current" style={{ originX: 0 }} initial={false} animate={{ scaleX: checked ? 1 : 0 }} transition={{ delay: delay + 0.1, duration: 0.3 }} />
      </motion.span>
    </li>
  );
}

function PreviewScenario({ name, value, chosen }: { name: string; value: string; chosen: boolean }) {
  const live = useContext(Live) && chosen;
  return (
    <motion.div
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-[11px]"
      initial={false}
      animate={{ backgroundColor: live ? '#e6f3fe' : '#f6f5f4', boxShadow: live ? '0 0 0 1px rgba(0,117,222,0.4)' : '0 0 0 0px rgba(0,117,222,0)' }}
      transition={{ delay: 1.6, duration: 0.4 }}
    >
      <span className="font-medium">{name}</span>
      <span className="tabular font-semibold">{value}</span>
    </motion.div>
  );
}

export function WorkspacePreview() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.35 });
  return (
    <Live.Provider value={inView || Boolean(reduce)}>
      <PreviewBody innerRef={ref} />
    </Live.Provider>
  );
}

function PreviewBody({ innerRef }: { innerRef: React.RefObject<HTMLElement | null> }) {
  return (
    <figure ref={innerRef} className="relative mx-auto w-full max-w-[1120px]">
      <div className="overflow-hidden rounded-[14px] border border-hairline bg-canvas shadow-mockup" role="img" aria-label="A moving workspace: budget bars, recommended furniture, a task checklist, three cost scenarios and risk alerts">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-hairline bg-surface px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-ink/10" />
          <span className="size-2.5 rounded-full bg-ink/10" />
          <span className="size-2.5 rounded-full bg-ink/10" />
          <span className="ml-3 rounded-md bg-canvas px-3 py-0.5 text-[11px] text-graphite">Moving to Turku</span>
        </div>
        <div className="flex">
          <div className="hidden w-[150px] shrink-0 flex-col gap-1 border-r border-hairline p-3 md:flex">
            <div className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold">
              <LogoMark className="size-5" /> Life Simulator
            </div>
            {['Dashboard', 'New life project', 'My projects'].map(l => (
              <div key={l} className="rounded-md px-2 py-1.5 text-[11px] text-ink/55">
                {l}
              </div>
            ))}
            <div className="flex items-center gap-1.5 rounded-md bg-sky-tint px-2 py-1.5 text-[11px] font-medium text-blue-ink">
              <LayoutGrid className="size-3" /> Moving to Turku
            </div>
          </div>
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-[11px] text-graphite">Turku, Finland · 14 Nov</div>
                <div className="text-[18px] font-semibold tracking-[-0.4px] sm:text-[22px]">Moving to Turku</div>
              </div>
              <div className="flex gap-1.5">
                <span className="rounded-full bg-ok-tint px-2 py-0.5 text-[10px] font-medium text-ok-ink">€612 left</span>
                <span className="rounded-full bg-sky-tint px-2 py-0.5 text-[10px] font-medium text-blue-ink">7 of 18 tasks</span>
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Panel title="Budget" icon={<Wallet />}>
                <div className="mb-2 text-[22px] font-semibold tracking-[-0.6px] tabular">
                  <CountUp to={2000} format={n => `€${n.toLocaleString('en-IE')}`} />
                </div>
                <div className="flex flex-col gap-2">
                  <MiniBar label="Furniture" spent={480} total={700} tone="bg-blue" />
                  <MiniBar label="Moving" spent={290} total={300} tone="bg-saffron" />
                  <MiniBar label="Essentials" spent={118} total={200} tone="bg-sky-wash" />
                </div>
              </Panel>
              <Panel title="Recommended for you" icon={<Sparkles />} className="sm:col-span-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { t: 'Pine bed frame 90×200', p: '€69', s: 'Store · New', why: 'Fits your budget' },
                    { t: '3-seat sofa', p: '€120', s: 'Private · Used', why: 'Local pickup' },
                    { t: 'Desk with drawers', p: '€89', s: 'Store · New', why: 'Low delivery cost' },
                  ].map((o, i) => (
                    <div key={o.t} className={cn('rounded-lg border border-hairline p-2', i === 2 && 'hidden sm:block')}>
                      <div className="mb-1.5 grid h-12 place-items-center rounded-md bg-canvas">
                        <Store className="size-4 text-ink/25" />
                      </div>
                      <div className="truncate text-[11px] font-medium">{o.t}</div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold tabular">{o.p}</span>
                        <span className="text-[9.5px] text-graphite">{o.s}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[9.5px] text-ok-ink">
                        <Check className="size-2.5" />
                        {o.why}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Next steps" icon={<Check />}>
                <ul className="flex flex-col gap-1.5">
                  {[
                    ['Give notice on lease', true],
                    ['Book moving van', true],
                    ['Update address with Posti', false],
                    ['Set up electricity', false],
                  ].map(([t, done], i) => (
                    <PreviewTask key={t as string} title={t as string} done={done as boolean} delay={0.6 + i * 0.45} />
                  ))}
                </ul>
              </Panel>
              <Panel title="Compare scenarios" icon={<Truck />}>
                <div className="flex flex-col gap-1.5">
                  {[
                    ['Economy', '€1,240', 'bg-canvas'],
                    ['Balanced', '€1,388', 'bg-sky-tint ring-1 ring-blue/40'],
                    ['Comfort', '€1,710', 'bg-canvas'],
                  ].map(([n, v]) => (
                    <PreviewScenario key={n} name={n!} value={v!} chosen={n === 'Balanced'} />
                  ))}
                </div>
              </Panel>
              <Panel title="Risk Guardian" icon={<ShieldCheck />}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-1.5 rounded-md bg-warn-tint px-2 py-1.5 text-[11px] text-warn-ink">
                    <AlertTriangle className="mt-px size-3 shrink-0" /> Sofa delivery fee not confirmed
                  </div>
                  <div className="flex items-start gap-1.5 rounded-md bg-canvas px-2 py-1.5 text-[11px] text-ink/75">
                    <ShieldCheck className="mt-px size-3 shrink-0" /> Reserve of €200 kept aside
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-caption text-graphite">Illustrative preview. Your workspace is built from your own request.</figcaption>
    </figure>
  );
}
