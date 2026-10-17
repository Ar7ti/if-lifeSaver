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
7. **Tasks have no stage field.** The timeline orders tasks by `dueDate` and lists undated tasks as "Not scheduled yet" instead of inventing stages.

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
