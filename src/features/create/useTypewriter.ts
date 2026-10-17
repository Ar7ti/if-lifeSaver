import { useEffect, useState } from 'react';

/**
 * Types each example out, holds it, deletes it and moves to the next. Inactive (returns null)
 * when `active` is false, e.g. while the field is focused, has text, or motion is reduced.
 */
export function useTypewriter(examples: string[], active: boolean) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!active || examples.length === 0) return;
    let i = 0;
    let pos = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = examples[i % examples.length]!;
      if (!deleting) {
        pos += 1;
        setText(full.slice(0, pos));
        if (pos >= full.length) {
          deleting = true;
          timer = setTimeout(tick, 1900);
          return;
        }
        timer = setTimeout(tick, 34 + Math.random() * 40);
      } else {
        pos = Math.max(0, pos - 3);
        setText(full.slice(0, pos));
        if (pos === 0) {
          deleting = false;
          i += 1;
          timer = setTimeout(tick, 420);
          return;
        }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 700);
    return () => clearTimeout(timer);
  }, [active, examples]);
  return active ? text : null;
}
