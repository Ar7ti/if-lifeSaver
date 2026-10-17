import { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { Composer, type ComposerHandle } from '@/features/create/Composer';
import { ExampleCards } from '@/features/create/ExampleCards';
import { Float, useFinePointer } from './motion-kit';

/** Real example requests typed into the hero composer. Module-level so the identity is stable. */
const TYPING_EXAMPLES = [
  "I'm moving to Turku next month with €2,000…",
  "I'm buying my first used car under €8,000…",
  "Furnishing a one-bedroom flat in Tampere with €1,500…",
  'Planning a five-day trip to Rome with €900…',
];

interface Orbiter {
  src: string;
  /** Position as percentages of the hero box. */
  left: string;
  top: string;
  size: number;
  /** Parallax depth: larger moves more with the pointer and the scroll. */
  depth: number;
  /** Which side it drifts toward while scrolling away. */
  side: -1 | 1;
  float: number;
  delay: number;
}

const ORBITERS: Orbiter[] = [
  { src: '/illustrations/moving-box.png', left: '5%', top: '14%', size: 132, depth: 1.2, side: -1, float: 5.2, delay: 0.05 },
  { src: '/illustrations/sofa.png', left: '81%', top: '10%', size: 140, depth: 1, side: 1, float: 6, delay: 0.15 },
  { src: '/illustrations/first-home.png', left: '20%', top: '1%', size: 78, depth: 0.6, side: -1, float: 4.6, delay: 0.25 },
  { src: '/illustrations/travel-case.png', left: '85%', top: '50%', size: 104, depth: 1.4, side: 1, float: 5.6, delay: 0.3 },
  { src: '/illustrations/first-car.png', left: '3%', top: '52%', size: 124, depth: 1.1, side: -1, float: 6.4, delay: 0.2 },
  { src: '/illustrations/guide.png', left: '72%', top: '0%', size: 72, depth: 0.7, side: 1, float: 4.2, delay: 0.35 },
];

function OrbitItem({ o, mx, my, progress }: { o: Orbiter; mx: MotionValue<number>; my: MotionValue<number>; progress: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const px = useTransform(mx, v => v * 36 * o.depth);
  const py = useTransform(my, v => v * 28 * o.depth);
  const sx = useTransform(progress, [0, 1], [0, o.side * 140 * o.depth]);
  const sy = useTransform(progress, [0, 1], [0, -160 * o.depth]);
  const x = useTransform([px, sx] as MotionValue<number>[], ([a, b]) => (a as number) + (b as number));
  const y = useTransform([py, sy] as MotionValue<number>[], ([a, b]) => (a as number) + (b as number));
  const opacity = useTransform(progress, [0, 0.7], [1, 0]);
  return (
    <motion.div
      className="absolute hidden lg:block"
      style={{ left: o.left, top: o.top, width: o.size, x: reduce ? 0 : x, y: reduce ? 0 : y, opacity: reduce ? 1 : opacity }}
      initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 16, delay: 0.35 + o.delay }}
    >
      <Float amplitude={8} duration={o.float} delay={o.delay}>
        <img src={o.src} alt="" width={o.size} height={o.size} className="w-full object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.12)]" draggable={false} />
      </Float>
    </motion.div>
  );
}

const WORDS = ['Your', 'life.', '\n', 'Beautifully'];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const mx = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  const my = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  return (
    <section
      ref={ref}
      aria-labelledby="hero-heading"
      className="relative mx-auto max-w-[1440px] overflow-x-clip px-4 pt-14 pb-16 text-center sm:px-8 sm:pt-24"
      onPointerMove={e => {
        if (!fine || reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {ORBITERS.map(o => (
          <OrbitItem key={o.src} o={o} mx={mx} my={my} progress={scrollYProgress} />
        ))}
      </div>

      {/* Phones: a compact row of the same illustrations, no parallax. */}
      <motion.ul initial={reduce ? false : 'hidden'} animate="show" className="mb-8 flex justify-center gap-1.5 lg:hidden" aria-hidden>
        {ORBITERS.slice(0, 5).map((o, i) => (
          <motion.li
            key={o.src}
            variants={{ hidden: { opacity: 0, y: 14, scale: 0.8 }, show: { opacity: 1, y: 0, scale: 1, transition: { delay: 0.06 * i, type: 'spring', stiffness: 260, damping: 20 } } }}
            className="grid size-14 place-items-center rounded-[18px] bg-surface shadow-nav"
          >
            <img src={o.src} alt="" width="52" height="52" className="size-[46px] object-contain" />
          </motion.li>
        ))}
      </motion.ul>

      <motion.div style={reduce ? undefined : { y: contentY }} className="relative">
        <h1 id="hero-heading" className="mx-auto max-w-[920px] text-[44px] leading-[1.08] font-semibold tracking-[-1.4px] sm:text-display-sm md:text-display">
          <span className="sr-only">Your life. Beautifully planned.</span>
          <span aria-hidden>
            {WORDS.map((w, i) =>
              w === '\n' ? (
                <br key={i} />
              ) : (
                <span key={i} className="inline-block overflow-hidden pb-[0.06em] align-bottom">
                  <motion.span
                    className="inline-block"
                    initial={reduce ? false : { y: '105%' }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.08 * i }}
                  >
                    {w}&nbsp;
                  </motion.span>
                </span>
              ),
            )}
            <span className="relative inline-block px-[0.32em] pb-[0.04em] leading-[1.1]">
              <motion.span
                className="absolute inset-0 rounded-full bg-marigold"
                style={{ originX: 0 }}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, ease: [0.65, 0, 0.35, 1], delay: 0.55 }}
              />
              <motion.span
                className="relative inline-block"
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.8 }}
              >
                planned.
              </motion.span>
            </span>
          </span>
        </h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-6 max-w-[600px] font-serif text-[18px] leading-[1.56] text-graphite sm:text-[20px]"
        >
          Turn life&rsquo;s biggest decisions into personalized plans, real opportunities, and confident actions.
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.9, type: 'spring', stiffness: 200, damping: 24 }}
          className="mx-auto mt-10 max-w-[760px]"
        >
          <Composer ref={composer} typingExamples={TYPING_EXAMPLES} />
        </motion.div>

        <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.5 }} className="mx-auto mt-6 max-w-[1120px]">
          <p className="mb-3 text-body-sm text-graphite">Or start from an example</p>
          <ExampleCards onPick={p => composer.current?.fill(p)} />
        </motion.div>
      </motion.div>
    </section>
  );
}
