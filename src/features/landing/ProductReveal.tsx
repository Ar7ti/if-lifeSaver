import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { WorkspacePreview } from './WorkspacePreview';

/** The preview opens like a laptop lid: tilted back at first, flat once it reaches the middle. */
export function ProductReveal() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const p = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.4 });
  const rotateX = useTransform(p, [0, 1], [24, 0]);
  const scale = useTransform(p, [0, 1], [0.86, 1]);
  const y = useTransform(p, [0, 1], [70, 0]);
  const opacity = useTransform(p, [0, 0.5, 1], [0.35, 0.85, 1]);

  return (
    <section ref={ref} aria-labelledby="preview-heading" className="mx-auto max-w-[1440px] px-4 pb-24 sm:px-8" style={{ perspective: 1600 }}>
      <h2 id="preview-heading" className="sr-only">
        What a workspace looks like
      </h2>
      <motion.div style={reduce ? undefined : { rotateX, scale, y, opacity, transformOrigin: '50% 100%' }}>
        <WorkspacePreview />
      </motion.div>
    </section>
  );
}
