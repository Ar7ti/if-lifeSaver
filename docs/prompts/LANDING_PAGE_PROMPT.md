# Life Simulator — Landing Page Motion & Storytelling Prompt

## Role

You are a senior product designer and creative frontend engineer. You build marketing pages that
feel like the product itself: calm, precise and quietly delightful. Think Apple product pages,
Linear's release pages and Notion's homepage, rendered in Life Simulator's own visual language.

## Goal

Turn the existing landing page (`/`) into a scroll-driven story that makes a first-time visitor
understand, within one minute and without reading paragraphs, that:

1. You describe a big life decision in one sentence.
2. Life Simulator builds a living workspace (budget, research, checklist, scenarios, risks), not a chat.
3. Every number is honest: sourced, estimated or unknown, never invented.
4. Risk Guardian helps you prevent expensive problems (the If Insurance angle).
5. Starting is one click away: the prompt box is always the hero.

Keep the existing functionality: the composer creates a workspace, example prompts fill it, and
"Open app" goes to `/app`. Change presentation and motion, not product behavior.

## Visual language (do not reinvent)

- Warm canvas `#f6f5f4`, white surfaces, ink `#111` primary pills with an arrow, blue `#0075de`
  only for focus, links and progress. Marigold `#ffb110` for the single hero highlight pill.
- Inter for UI and headings (large, tight tracking, medium weight); Source Serif for one or two
  editorial sub-lines.
- The custom 3D clay illustrations in `public/illustrations/` are the heroes of the page: moving
  box, sofa, first car, suitcase, door with key, and the compass "guide" mascot.
- Borderless 20px cards with a 4% ring, no gradients, no glassmorphism, no glowing AI effects.

## Page structure and motion, top to bottom

### 0. Global
- A 2px scroll-progress line under the nav, blue, scaleX tied to page scroll.
- The nav starts transparent and gains a soft surface and hairline after 24px of scroll.
- Sections reveal once as they enter the viewport: 12px rise plus opacity over 0.5s with a
  gentle spring, staggered about 80ms between siblings. Never re-hide on scroll up.

### 1. Hero: "Your life. Beautifully planned."
- The headline enters word by word. The marigold pill behind "planned." sweeps in from the left
  (scaleX 0→1, origin left) after the words land.
- The six 3D illustrations float around the headline (not in a row): each bobs on its own slow
  loop (4–7s, 6–10px), follows the pointer with subtle parallax (depth varies per object) and
  drifts outward and fades as the user scrolls past the hero.
- The composer placeholder types real example requests ("I'm moving to Turku with €2,000…",
  "Buying my first car under €8,000…"), pausing between them. It stops as soon as the field is
  focused or has text. The accessible label stays constant.
- Example cards: lift 2px and tilt slightly toward the pointer on hover; the illustration
  rotates -3° and scales up.

### 2. Product reveal (the "it's a workspace" moment)
- The workspace preview starts tilted back in 3D (rotateX ~22°, scale 0.88, lower opacity) and
  straightens to flat, full size as it scrolls into the center of the viewport, like a laptop lid
  opening.
- When the preview is in view, its content comes alive once: budget figures count up, budget
  bars fill, checklist items tick in sequence, and the Balanced scenario highlights.

### 3. How it works: a sticky scroll story
- Desktop: a tall section with a sticky stage. On the left, three steps with a vertical progress
  line that fills with scroll; the active step is ink, the others muted. On the right, a visual
  that changes per step:
  1. "Describe your goal": a sentence types into a mini composer.
  2. "Get a workspace, not a chat": widget cards assemble into a grid.
  3. "Decide with real options": an offer card is added to the plan and the budget number updates.
- Mobile: the same three steps as stacked cards that reveal in view (no sticky pinning).

### 4. "Built for every big moment" marquee
- An infinite, slow horizontal band of scenario chips with illustrations (moving, first car,
  furnishing, trip, first home, student life). It pauses on hover and stops entirely under
  reduced motion.

### 5. Features bento
- The marigold "workspace shaped around your goal" card, the sky "research with sources" card and
  the white "Economy, Balanced or Comfort" card reveal with a stagger. Cards tilt subtly toward
  the pointer (max 4°) and the little widget chips inside drift in one after another.

### 6. Risk Guardian island (dark midnight card)
- The three risk rows slide in from the right one after another when in view; the shield icon
  pulses once. The copy stays reassuring, not alarming, and makes no insurance claims.

### 7. Closing CTA
- The compass mascot gently floats; the CTA arrow nudges right on hover.

## Interaction rules
- Motion explains, never decorates for its own sake. Nothing loops fast or flashes.
- Durations 150–600ms; springs without visible bounce for UI, softer floats for illustrations.
- Animate only transform and opacity (plus scaleX for progress). No layout thrash.
- `prefers-reduced-motion: reduce`: no parallax, floating, tilt, typing or marquee; content
  simply appears. Every state is understandable without animation.
- Pointer effects only on hover-capable devices; touch gets the static version.
- No horizontal overflow at 320px. Hero headline 44px on phones, 72px on desktop.
- Keyboard: every interactive element remains reachable with a visible focus ring. Decorative
  illustrations are `aria-hidden`.
- Performance: no heavy libraries beyond the existing `motion`; images lazy-load below the fold.

## Honesty rules
- The workspace preview is labelled illustrative; its numbers are examples, not user data.
- No fake testimonials, logos, user counts or partnership claims.

## Acceptance
- Build and typecheck pass; axe reports no WCAG AA violations on `/`.
- No horizontal scroll at 320, 390, 768 and 1440 px.
- Reduced-motion screenshots show the full content.
- The composer still creates a workspace end to end.
