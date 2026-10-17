/** Smoothly brings a workspace section into view and moves focus there for keyboard users. */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const target = el.querySelector<HTMLElement>('h2 button, h2, [tabindex]') ?? el;
  target.focus({ preventScroll: true });
  return true;
}

/** Scenario-specific 3D illustration from public/illustrations. */
export function scenarioIllustration(scenarioType: string, title: string) {
  const t = title.toLowerCase();
  if (/car|vehicle/.test(t)) return '/illustrations/first-car.png';
  if (/trip|travel|holiday|vacation/.test(t)) return '/illustrations/travel-case.png';
  if (/furnish|furniture|sofa/.test(t)) return '/illustrations/sofa.png';
  if (/first (home|apartment)|independent|move out/.test(t)) return '/illustrations/first-home.png';
  if (scenarioType === 'moving' || /mov(e|ing)|relocat/.test(t)) return '/illustrations/moving-box.png';
  return '/illustrations/guide.png';
}
