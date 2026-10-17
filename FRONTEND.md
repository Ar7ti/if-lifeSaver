# Life Simulator — frontend

React 19 + TypeScript + Vite 8 + Tailwind CSS 4, with TanStack Query, Zustand and Motion. Visual language follows `DESIGN.md` (Notion style reference; the file lives untracked in the main checkout under `server/DESIGN.md`).

## Run

```sh
npm install
cd server && npm run dev        # backend on 127.0.0.1:3001 (see server/README.md)
npm run dev                     # frontend on http://localhost:5173, /api proxied to the backend
```

`npm run build` typechecks and builds to `dist/`. `npm run typecheck` checks only. Set `LIFE_SIM_API` to proxy elsewhere, or `VITE_API_BASE` for an absolute API URL (see `frontend.env.example`; copy the values into `.env.local`).

## Structure

| Path | Purpose |
|---|---|
| `src/api/` | `live.ts` calls every route in `server/docs/FRONTEND_HANDOFF.md` and validates each response with the shared Zod schemas. `mock.ts` is the isolated offline demo adapter. `index.ts` picks one. |
| `src/hooks/useProject.ts` | Project query plus the shared write helpers (`setProject`, `applyCart`, `reloadOnConflict`). |
| `src/features/workspace/registry.tsx` | The fixed widget registry. The server spec chooses types, order, width and visibility; it can never inject code or markup. |
| `src/features/widgets/` | Budget, research catalog (products and services), planning cart, scenarios, Risk Guardian, timeline, checklist, suggestions. |
| `src/features/assistant/` | Assistant panel and action cards. Every proposal needs Apply; nothing is applied automatically. |
| `src/index.css` | Design tokens (`@theme`). Contrast-checked: blue text uses `blue-ink` (#005bb5), `#0075de` stays the fill. |

## Data honesty rules the UI follows

- Demo data appears only when it is chosen in Settings, and a banner is shown on every screen while it is active.
- Creation progress is checked off only from the real response. The backend has no progress stream.
- Prices show their `priceStatus` ("Estimated price", "Verified price"). "Source cited" means a citation exists, not that the seller is trusted.
- There are no invented images. Listings without `imageUrl` show a neutral placeholder.
- The cart is a planning list. Seller messages are drafts the user copies and sends themselves.

## Integration notes (backend gaps, worked around without changing `server/`)

1. **No list-projects route.** "My projects" remembers the IDs this browser created (`lifesim.projects` in localStorage).
2. **No scenario selection field.** The chosen scenario is stored locally. "Add options to plan" goes through the cart API after a confirmation step.
3. **No risk-status update route.** Risk status is display-only.
4. **No recommended-scenario field.** No scenario is badged as recommended.
5. **`ResearchResult` has no `kind`.** For empty results, the widget infers product versus service from the offers, or from the widget that ran the search.
6. **Live research can fail upstream** ("incomplete or invalid response") or take more than 100 s. The UI shows a recoverable error with retry and a manual-estimate fallback.
7. **Tasks have no stage field.** The checklist groups tasks into Before moving / Important purchases / Services to arrange / Final tasks from category and title keywords. The timeline orders tasks by `dueDate`.
8. **No answer route for planner questions.** Recognized answers (move date, origin, people, delivery, second-hand) are saved to `preferences`; free-text answers are appended to `preferences.notes`, which the AI assistant reads. Which questions were answered is remembered in the browser.
9. **No priority field on tasks.** Starred tasks and the furniture class (Economy / Mid-range / Premium, which splits a search's priced results into price thirds and steers new searches) are browser-local preferences.
10. **Recommended layout.** New workspaces are re-flowed once into a fixed reading order with `PATCH /workspace`; "Use recommended layout" in Customize does the same for existing projects.

## Verified (2026-10-17)

- Typecheck and build are clean.
- Live end-to-end in headless Chrome: project creation (16 s), research, add to plan (budget €0 → €69), task completion persisted, assistant budget proposal applied after confirmation.
- Demo flow: research, add, compare, seller draft.
- axe-core (WCAG 2.2 AA): 0 violations on the landing page, dashboard, settings, workspace (1440 px and 375 px) and the budget dialog.
- No horizontal overflow at 320 px or 720 px.
- Keyboard walk: every stop has a visible focus ring.

## Not done

- Dark mode, drag-and-drop layout and a service worker (P2). A web manifest is included.
- RTL, which the contract's locales (`en`, `fi`) don't need.
- A Finnish UI translation: copy is English-only, while seller drafts support FI.

## Visual design (2026-10-17 redesign)

References: `design-references/dashBoard.png` (Reference A, workspace: framed panel, borderless 20px cards, grey inner rows, ink-black pill actions, regular-weight headings) and `design-references/Sidebar.webp` (Reference B, navigation: flat sidebar, thin monochrome icons, Recents list, profile row). Custom 3D illustrations from `Icons/` are served from `public/illustrations/` (384px PNGs) and used as scenario marks, quick starts, project thumbnails and the assistant mascot; navigation stays monochrome. Emoji are native glyphs (no bundled emoji font) used as widget and checklist-section markers, always `aria-hidden` next to a text label.

## For Codex (backend coordination)

1. **Cart lines outside budget envelopes read as over budget.** A cart line whose `category` matches no budget category creates a €0 envelope, so any price shows "over". The frontend now files searches under a matching envelope (beds → `furniture`), but an offer researched under another category still lands in a €0 envelope. Suggest mapping research categories to envelopes server-side, or letting `AddCartItemRequest` carry a budget category.
2. **Questions are plain strings.** The UI infers input types from wording. A typed shape such as `{ id, text, kind: 'date'|'number'|'text'|'single'|'multi', options?, field? }` plus an answer route would allow multiple choice and exact field mapping.
3. **No priority, scenario-choice or risk-status fields.** Task stars, the chosen scenario and the furniture class are browser-local.
4. **Live research occasionally fails upstream** with "Research returned an incomplete or invalid response" (seen once; the identical retry succeeded in 19 s).
