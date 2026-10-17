import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform, type HTMLMotionProps } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

/** True only for devices with a real hover pointer (no tilt or parallax on touch). */
export function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const on = () => setFine(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return fine;
}

/** Rises in once when it enters the viewport. Never re-hides on scroll up. */
export function Reveal({ children, delay = 0, y = 14, className, as = 'div' }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'li' | 'section' }) {
  const reduce = useReducedMotion();
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

/** Tilts gently toward the pointer (max `max` degrees). Static on touch and under reduced motion. */
export function TiltCard({ children, className, max = 4, ...rest }: { children: ReactNode; className?: string; max?: number } & Omit<HTMLMotionProps<'div'>, 'children'>) {
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 220, damping: 22 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 220, damping: 22 });
  const enabled = fine && !reduce;
  return (
    <motion.div
      className={className}
      style={enabled ? { rotateX: rx, rotateY: ry, transformPerspective: 900 } : undefined}
      onPointerMove={e => {
        if (!enabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Slow idle bob for decorative illustrations. */
export function Float({ children, className, amplitude = 8, duration = 5, delay = 0 }: { children: ReactNode; className?: string; amplitude?: number; duration?: number; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      animate={reduce ? undefined : { y: [0, -amplitude, 0], rotate: [0, amplitude / 4, 0] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      {children}
    </motion.div>
  );
}

/** Counts from 0 to `to` the first time it is visible. */
export function CountUp({ to, format, className, duration = 1.2 }: { to: number; format: (n: number) => string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!inView || reduce) {
      el.textContent = format(reduce ? to : 0);
      if (!inView) return;
      return;
    }
    const controls = animate(0, to, { duration, ease: EASE, onUpdate: v => (el.textContent = format(Math.round(v))) });
    return () => controls.stop();
  }, [inView, reduce, to, format, duration]);
  return (
    <span ref={ref} className={cn('tabular', className)}>
      {format(reduce ? to : 0)}
    </span>
  );
}
