import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, LayoutGrid, ShieldCheck, Scale, Search } from 'lucide-react';
import { Composer, type ComposerHandle } from '@/features/create/Composer';
import { ExampleCards } from '@/features/create/ExampleCards';
import { EXAMPLES } from '@/features/create/examples';
import { Logo } from '@/features/shell/Logo';
import { buttonClass } from '@/components/ui/Button';
import { DataSourceBanner } from '@/features/shell/DataSourceBanner';
import { WorkspacePreview } from './WorkspacePreview';

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.06 * i, type: 'spring' as const, stiffness: 260, damping: 28 } }),
};

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/90 shadow-nav backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-8">
        <Link to="/" aria-label="Life Simulator home" className="rounded-button">
          <Logo />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {[
            ['#how', 'How it works'],
            ['#features', 'Features'],
            ['#safety', 'Risk Guardian'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-button px-4 py-2 text-body-sm font-medium text-ink/60 transition-colors duration-200 hover:text-ink">
              {label}
            </a>
          ))}
        </nav>
        <Link to="/app" className={buttonClass('ghost')}>
          Open app
        </Link>
      </div>
    </header>
  );
}

const STEPS = [
  { n: '1', title: 'Describe your goal', body: 'One sentence is enough: where you are going, when, and what you can spend.' },
  { n: '2', title: 'Get a workspace, not a chat', body: 'Budget, tasks, research, scenarios and risks appear as a plan you can click through and edit.' },
  { n: '3', title: 'Decide with real options', body: 'Compare sourced offers, add them to your plan, and know exactly what is still unconfirmed.' },
];

export function Landing() {
  const composer = useRef<ComposerHandle>(null);

  return (
    <div className="min-h-dvh bg-canvas">
      <DataSourceBanner />
      <Nav />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[1440px] px-4 pt-14 pb-16 text-center sm:px-8 sm:pt-20">
          <motion.ul initial="hidden" animate="show" className="mb-8 flex justify-center gap-1 sm:gap-3" aria-hidden>
            {EXAMPLES.map((example, i) => (
              <motion.li key={example.id} custom={i} variants={rise} className="grid size-14 place-items-center rounded-[18px] bg-surface shadow-nav sm:size-[72px] sm:rounded-[22px]">
                <img src={example.image} alt="" width="68" height="68" className="size-[52px] object-contain sm:size-[68px]" />
              </motion.li>
            ))}
          </motion.ul>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 26, delay: 0.1 }}
            className="mx-auto max-w-[920px] text-[44px] leading-[1.08] font-semibold tracking-[-1.4px] sm:text-display-sm md:text-display"
          >
            Your life.
            <br />
            Beautifully{' '}
            <span className="inline-block rounded-full bg-marigold px-[0.32em] pb-[0.04em] leading-[1.1]">planned.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="mx-auto mt-6 max-w-[600px] font-serif text-[18px] leading-[1.56] text-graphite sm:text-[20px]"
          >
            Turn life&rsquo;s biggest decisions into personalized plans, real opportunities, and confident actions.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, type: 'spring', stiffness: 220, damping: 28 }} className="mx-auto mt-10 max-w-[760px]">
            <Composer ref={composer} />
          </motion.div>

          <div className="mx-auto mt-6 max-w-[1120px]">
            <p className="mb-3 text-body-sm text-graphite">Or start from an example</p>
            <ExampleCards onPick={p => composer.current?.fill(p)} />
          </div>
        </section>

        {/* Product preview */}
        <section aria-labelledby="preview-heading" className="mx-auto max-w-[1440px] px-4 pb-20 sm:px-8">
          <h2 id="preview-heading" className="sr-only">
            What a workspace looks like
          </h2>
          <WorkspacePreview />
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-heading" className="scroll-mt-20 border-t border-hairline bg-surface py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
            <h2 id="how-heading" className="max-w-xl text-[36px] leading-[1.08] font-semibold tracking-[-1.2px] sm:text-[48px] sm:tracking-[-1.7px]">
              From one sentence to a plan you can act on.
            </h2>
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {STEPS.map(s => (
                <li key={s.n} className="rounded-card border border-hairline bg-canvas p-6">
                  <span className="grid size-8 place-items-center rounded-full bg-midnight text-body-sm font-semibold text-white">{s.n}</span>
                  <h3 className="mt-5 text-heading-sm font-semibold">{s.title}</h3>
                  <p className="mt-2 text-body text-graphite">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features — accent cards paint the canvas */}
        <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
            <h2 id="features-heading" className="max-w-2xl text-[36px] leading-[1.08] font-semibold tracking-[-1.2px] sm:text-[48px] sm:tracking-[-1.7px]">
              Everything a big decision needs, in one calm place.
            </h2>
            <p className="mt-4 max-w-xl font-serif text-[18px] leading-[1.56] text-graphite">Every number is labelled with where it came from, so you always know what is confirmed and what is still an estimate.</p>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              <div className="flex flex-col justify-between gap-10 rounded-card bg-marigold p-8 md:col-span-2 md:flex-row md:items-end">
                <div className="max-w-md">
                  <LayoutGrid className="size-6" aria-hidden />
                  <h3 className="mt-4 text-[28px] leading-[1.15] font-semibold tracking-[-0.8px] sm:text-[32px]">A workspace shaped around your goal</h3>
                  <p className="mt-3 text-body text-ink/80">The AI picks which tools you need, from budget envelopes to a moving timeline, and arranges them for you. Rearrange, resize or hide anything.</p>
                </div>
                <div className="grid w-full max-w-sm grid-cols-2 gap-2" aria-hidden>
                  {['Budget', 'Product research', 'Planning cart', 'Scenarios', 'Risk Guardian', 'Timeline'].map(w => (
                    <span key={w} className="rounded-button bg-surface/90 px-3 py-2 text-body-sm font-medium shadow-mockup">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-card bg-sky-tint p-8">
                <Search className="size-6 text-blue-ink" aria-hidden />
                <h3 className="mt-4 text-heading-sm font-semibold">Research with sources</h3>
                <p className="mt-2 text-body text-ink/75">Real listings with prices, sellers and links. Each one says why it was chosen and what still needs checking.</p>
              </div>
              <div className="rounded-card border border-hairline bg-surface p-8">
                <Scale className="size-6" aria-hidden />
                <h3 className="mt-4 text-heading-sm font-semibold">Economy, Balanced or Comfort</h3>
                <p className="mt-2 text-body text-graphite">See the cost, effort and trade-offs of three ways to get it done before you commit to any of them.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Risk Guardian — the dark island */}
        <section id="safety" aria-labelledby="safety-heading" className="scroll-mt-20 px-4 pb-20 sm:px-8">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-10 rounded-card bg-midnight p-8 text-white sm:p-12 md:flex-row md:items-center">
            <div className="max-w-lg">
              <ShieldCheck className="size-7 text-marigold" aria-hidden />
              <h2 id="safety-heading" className="mt-5 text-[32px] leading-[1.1] font-semibold tracking-[-1px] sm:text-[40px]">
                Spot problems before they become expensive.
              </h2>
              <p className="mt-4 font-serif text-[18px] leading-[1.56] text-white/80">
                Life Risk Guardian watches your plan for unconfirmed delivery fees, thin emergency reserves, missing seller details and unclear contract terms, and tells you the one thing to do about each.
              </p>
            </div>
            <ul className="flex flex-1 flex-col gap-2.5" aria-label="Example risk alerts">
              {[
                ['Delivery fee for the sofa is not confirmed', 'Ask the seller before agreeing on pickup.'],
                ['Emergency reserve is under 10%', 'Move €100 from essentials into your reserve.'],
                ['Moving company terms unverified', 'Request written damage and cancellation terms.'],
              ].map(([t, a]) => (
                <li key={t} className="rounded-[10px] bg-white/[0.07] p-4">
                  <p className="text-body-sm font-semibold">{t}</p>
                  <p className="mt-1 text-body-sm text-sky-wash">{a}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-hairline bg-surface py-20 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <img src="/illustrations/guide.png" alt="" width="80" height="80" className="mx-auto size-20 object-contain" aria-hidden />
            <h2 className="mt-4 text-[36px] leading-[1.08] font-semibold tracking-[-1.2px] sm:text-[48px] sm:tracking-[-1.7px]">What are you planning next?</h2>
            <Link
              to="/app/new"
              className={buttonClass('primary', 'lg', 'mt-8')}
            >
              Start a new life project <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-3 px-4 py-8 text-caption text-graphite sm:flex-row sm:items-center sm:px-8">
          <Logo />
          <p>Built for the If Insurance challenge at JunctionX Turku. Plans are guidance, not purchases: nothing is bought, booked or sent without you.</p>
        </div>
      </footer>
    </div>
  );
}
