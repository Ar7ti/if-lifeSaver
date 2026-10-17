import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { ArrowRight, LayoutGrid, ShieldCheck, Scale, Search } from 'lucide-react';
import { Logo } from '@/features/shell/Logo';
import { buttonClass } from '@/components/ui/Button';
import { DataSourceBanner } from '@/features/shell/DataSourceBanner';
import { cn } from '@/lib/cn';
import { Hero } from './Hero';
import { ProductReveal } from './ProductReveal';
import { StoryScroll } from './StoryScroll';
import { ScenarioMarquee } from './ScenarioMarquee';
import { Float, Reveal, TiltCard } from './motion-kit';

/** Nav starts quiet and gains a surface after a little scroll; a thin line tracks page progress. */
function Nav() {
  const { scrollY, scrollYProgress } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  const reduce = useReducedMotion();
  useMotionValueEvent(scrollY, 'change', v => setScrolled(v > 24));
  return (
    <header className={cn('sticky top-0 z-30 border-b transition-[background-color,border-color,box-shadow] duration-300', scrolled ? 'border-hairline bg-canvas/90 shadow-nav backdrop-blur' : 'border-transparent bg-transparent')}>
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
      <motion.div className="absolute inset-x-0 -bottom-px h-[2px] bg-blue" style={{ scaleX: reduce ? scrollYProgress : progress, originX: 0 }} aria-hidden />
    </header>
  );
}

const CHIPS = ['Budget', 'Product research', 'Planning cart', 'Scenarios', 'Risk Guardian', 'Timeline'];

function Features() {
  const reduce = useReducedMotion();
  return (
    <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 pb-20">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <Reveal>
          <h2 id="features-heading" className="max-w-2xl text-[36px] leading-[1.08] font-semibold tracking-[-1.2px] sm:text-[48px] sm:tracking-[-1.7px]">
            Everything a big decision needs, in one calm place.
          </h2>
          <p className="mt-4 max-w-xl font-serif text-[18px] leading-[1.56] text-graphite">Every number is labelled with where it came from, so you always know what is confirmed and what is still an estimate.</p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Reveal className="md:col-span-2">
            <TiltCard max={2.5} className="flex flex-col justify-between gap-10 rounded-[20px] bg-marigold p-8 md:flex-row md:items-end">
              <div className="max-w-md">
                <LayoutGrid className="size-6" aria-hidden />
                <h3 className="mt-4 text-[28px] leading-[1.15] font-semibold tracking-[-0.8px] sm:text-[32px]">A workspace shaped around your goal</h3>
                <p className="mt-3 text-body text-ink/80">The AI picks which tools you need, from budget envelopes to a moving timeline, and arranges them for you. Rearrange, resize or hide anything.</p>
              </div>
              <ul className="grid w-full max-w-sm grid-cols-2 gap-2" aria-label="Workspace tools">
                {CHIPS.map((w, i) => (
                  <motion.li
                    key={w}
                    className="rounded-button bg-surface/90 px-3 py-2 text-body-sm font-medium shadow-mockup"
                    initial={reduce ? false : { opacity: 0, y: 10, scale: 0.94 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                    transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 260, damping: 20 }}
                  >
                    {w}
                  </motion.li>
                ))}
              </ul>
            </TiltCard>
          </Reveal>
          <Reveal delay={0.05}>
            <TiltCard className="h-full rounded-[20px] bg-sky-tint p-8">
              <Search className="size-6 text-blue-ink" aria-hidden />
              <h3 className="mt-4 text-heading-sm font-semibold">Research with sources</h3>
              <p className="mt-2 text-body text-ink/75">Real listings with prices, sellers and links. Each one says why it was chosen and what still needs checking.</p>
            </TiltCard>
          </Reveal>
          <Reveal delay={0.12}>
            <TiltCard className="card h-full p-8">
              <Scale className="size-6" aria-hidden />
              <h3 className="mt-4 text-heading-sm font-semibold">Economy, Balanced or Comfort</h3>
              <p className="mt-2 text-body text-graphite">See the cost, effort and trade-offs of three ways to get it done before you commit to any of them.</p>
            </TiltCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const RISKS = [
  ['Delivery fee for the sofa is not confirmed', 'Ask the seller before agreeing on pickup.'],
  ['Emergency reserve is under 10%', 'Move €100 from essentials into your reserve.'],
  ['Moving company terms unverified', 'Request written damage and cancellation terms.'],
];

function RiskIsland() {
  const reduce = useReducedMotion();
  return (
    <section id="safety" aria-labelledby="safety-heading" className="scroll-mt-20 px-4 pb-20 sm:px-8">
      <Reveal className="mx-auto flex max-w-[1200px] flex-col gap-10 rounded-[24px] bg-midnight p-8 text-white sm:p-12 md:flex-row md:items-center">
        <div className="max-w-lg">
          <motion.span
            className="inline-block"
            initial={false}
            whileInView={reduce ? undefined : { scale: [1, 1.18, 1], rotate: [0, -6, 0] }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.7 }}
          >
            <ShieldCheck className="size-7 text-marigold" aria-hidden />
          </motion.span>
          <h2 id="safety-heading" className="mt-5 text-[32px] leading-[1.1] font-semibold tracking-[-1px] sm:text-[40px]">
            Spot problems before they become expensive.
          </h2>
          <p className="mt-4 font-serif text-[18px] leading-[1.56] text-white/80">
            Life Risk Guardian watches your plan for unconfirmed delivery fees, thin emergency reserves, missing seller details and unclear contract terms, and tells you the one thing to do about each.
          </p>
        </div>
        <ul className="flex flex-1 flex-col gap-2.5" aria-label="Example risk alerts">
          {RISKS.map(([t, a], i) => (
            <motion.li
              key={t}
              className="rounded-[12px] bg-white/[0.07] p-4"
              initial={reduce ? false : { opacity: 0, x: 28 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ delay: 0.25 + i * 0.16, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="text-body-sm font-semibold">{t}</p>
              <p className="mt-1 text-body-sm text-sky-wash">{a}</p>
            </motion.li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

export function Landing() {
  return (
    <div className="min-h-dvh bg-canvas">
      <DataSourceBanner />
      <Nav />
      <main>
        <Hero />
        <ProductReveal />
        <StoryScroll />
        <ScenarioMarquee />
        <Features />
        <RiskIsland />

        {/* Closing CTA */}
        <section className="border-t border-hairline bg-surface py-24 text-center">
          <Reveal className="mx-auto max-w-2xl px-4">
            <Float amplitude={10} duration={4.5} className="mx-auto w-fit">
              <img src="/illustrations/guide.png" alt="" width="96" height="96" loading="lazy" className="size-24 object-contain" aria-hidden />
            </Float>
            <h2 className="mt-4 text-[36px] leading-[1.08] font-semibold tracking-[-1.2px] sm:text-[48px] sm:tracking-[-1.7px]">What are you planning next?</h2>
            <Link to="/app/new" className={buttonClass('primary', 'lg', 'group mt-8')}>
              Start a new life project <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </Link>
          </Reveal>
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
