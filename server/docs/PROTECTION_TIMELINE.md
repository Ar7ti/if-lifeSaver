# If Protection Timeline

## What is implemented

Moving workspaces use the existing `timeline` widget to show five protection planning milestones. The previous general task schedule remains in **Your moving schedule** below them. Travel and car timelines are unchanged. Existing widget visibility, ordering, sizing and collapse controls continue to apply; a hidden timeline stays hidden.

The feature uses the existing design tokens, UI components, motion library, project writer, API adapter, session/ownership checks and JSON repository. It performs no OpenAI or insurer API calls. It never requests a quote automatically or treats completion as verified cover.

## Scheduling and review

Dates are calendar dates relative to the confirmed `preferences.moveDate`:

| Stable milestone ID | Suggested date |
| --- | --- |
| `home_review` | 14 days before |
| `transport_check` | 7 days before |
| `confirm_details` | 1 day before |
| `moving_day` | Moving day |
| `home_safety` | 3 days after |

These are suggestions, not If contractual deadlines. Without a date the complete undated plan is available and **Add move date** opens the existing Edit details form. Date arithmetic and planning-day comparisons use UTC date-only values; the browser displays dates without converting them to another calendar day. An open timeline refreshes at UTC midnight and on focus.

Completion is tied to a SHA-256 fingerprint of relevant saved project facts. Changing the move date reschedules all milestones and flags completed home/transport/detail reviews for renewed review. Packing/documentation and home-safety completion survive a date-only change. A changed destination invalidates all previously completed steps; property detail changes also affect relevant home checks. Old timestamps/history remain available. Nothing silently changes the existing insurance recommendation, quote, budget link or policy status.

Insurance review wording uses the existing home recommendation: unknown, postponed, self-reported cover, reviewed, saved quote, etc. Postponed review remains postponed; the timeline merely leads to the existing protection section where the user can explicitly reopen it. No action independently verifies coverage.

## Persistence and contracts

Shared contract version **1.6.0**, additive to 1.5.0:

- Optional `LifeProject.protectionTimeline = {version: 1, records: [...]}`. Older records need no migration.
- Each record has one stable milestone ID, completion timestamp/context and the latest 20 completion/reopening events. At most five unique records are allowed.
- `GET /api/projects/:projectId/protection-timeline` returns derived dates, planning statuses, explanations, official resources, fingerprints and completion count.
- `PATCH /api/projects/:projectId/protection-timeline/:milestoneId` accepts `{completed: boolean, expectedContextFingerprint: string, expectedRevision?: number}` and returns `{project, timeline}` from the same saved revision.
- Stale revision or changed context returns the existing 409 `CONFLICT` envelope. Invalid fields/IDs return 400. Inaccessible projects return 404 through existing ownership enforcement; state changes retain CSRF checks in public mode.

Writes use the repository's existing serialized, validated, atomic project replacement. No separate database, auth mechanism or task state is introduced. Saved progress survives backend restarts with local storage. Memory-storage test servers intentionally do not persist after termination. Browser-only **Demo data** mode displays a backend-required message; use the local backend with `AI_MODE=local` to demonstrate persistent progress without credentials or paid calls.

## Frontend integration

- `ActionTimeline.tsx` branches only for moving workspaces; `ProtectionTimeline.tsx` renders the feature.
- Existing `ProjectDetailsDialog` is now exported and hosted by `WorkspacePage`; `WorkspaceContext.editDetails()` lets the timeline open that exact form.
- TanStack Query caches the derived timeline; project revision changes refresh it. Saved mutation responses update the existing project cache. Failed writes report errors and refetch without claiming success.
- Native buttons expose completion with `aria-pressed` and explanations with `aria-expanded`. Progress is announced; motion honors reduced-motion preferences.

## Official resources

The following If Finland pages were checked on 2026-10-17. Links intentionally open official informational pages, not account actions. Finnish language is disclosed in the UI. No policy limits or universal transport-cover promise is reproduced.

- [Moving information](https://www.if.fi/henkiloasiakkaat/vakuutukset/kotivakuutus/muuttaminen)
- [Moving checklist](https://www.if.fi/henkiloasiakkaat/vakuutukset/kotivakuutus/muuttaminen/muuttajan-muistilista)
- [Moving notification and home insurance](https://www.if.fi/henkiloasiakkaat/vakuutukset/kotivakuutus/muuttaminen/muuttoilmoitus): If home insurance does not automatically transfer when the address changes; customers of other insurers are directed to check their own provider.
- [Home safety](https://www.if.fi/henkiloasiakkaat/vakuutukset/kotivakuutus/kodin-turvallisuus)

This is practical planning guidance, not policy verification, an insurer deadline, or proof of an approved partnership.

## Verification

```sh
npm --prefix server test
npm --prefix server run typecheck
npm --prefix server run build
npm run typecheck
npm run build
npx playwright test --reporter=line
```

New backend tests: `server/tests/protection-timeline.test.ts` — generation, calendar boundaries, old projects, saved review states, contextual invalidation/history, duplicate prevention, unchanged budgets/tasks, real HTTP workflow and restart, optimistic conflict validation, shared-token authentication, anonymous isolation and CSRF.

New UI tests: `tests/ui/protection-timeline.spec.ts` — actual moving creation and details, completion/reopening and reload, date edits, official link, existing review handoff, travel/car compatibility, postponed review, keyboard expansion, reduced motion, 1440px desktop and 390px mobile without horizontal overflow. Screenshots are in `server/docs/protection-timeline/`.

## Manual walkthrough

1. Run the existing backend with `AI_MODE=local`, `RESEARCH_MODE=unavailable`, `STORAGE_MODE=local` and a development-only `DATA_DIR`; start the Vite app with its API proxy pointed to that backend. Keep existing local authentication configuration.
2. Create: “I'm moving to Turku on November 15 with EUR 2000. I already have a bed and desk.” Confirm the saved date in Edit details if the year is ambiguous.
3. Scroll to the existing moving timeline widget. If hidden, restore Timeline through Customize.
4. Expand a milestone, open an official link, optionally visit the existing home-protection flow. Neither opens or submits a quote automatically.
5. Complete two steps, refresh and reopen one. Progress follows server state.
6. Change the move date. Dates update, completed date-sensitive checks request renewed review, and unrelated practical completion remains saved.
7. Visit travel/car workspaces; their original timelines remain unchanged.

No deployment or production configuration changes are part of this feature.

## Files changed for this feature

New implementation:
- `shared/contracts/protection-timeline.ts`
- `server/src/protection-timeline.ts`
- `src/features/widgets/ProtectionTimeline.tsx`

Integration changes:
- `shared/contracts/index.ts`
- `server/src/app.ts`
- `server/src/service.ts`
- `src/api/types.ts`, `src/api/live.ts`, `src/api/mock.ts`
- `src/features/widgets/ActionTimeline.tsx`
- `src/features/workspace/context.tsx`
- `src/features/workspace/WorkspacePage.tsx`
- `src/features/workspace/ProjectOverview.tsx`

Tests and documentation:
- `server/tests/protection-timeline.test.ts`
- `tests/ui/protection-timeline.spec.ts`
- `server/docs/FRONTEND_HANDOFF.md` (append-only feature handoff)
- `server/docs/PROTECTION_TIMELINE.md`
- `server/docs/protection-timeline/desktop.png`, `mobile.png`

All other pre-existing working-tree changes were preserved. No dependency or deployment configuration changes were needed.

## Executed results — 2026-10-17

- `npm --prefix server test`: **234 passed, 0 failed** (including six new timeline tests).
- Frontend and backend type checks: **passed**.
- Frontend and backend production builds: **passed**.
- `npx playwright test --reporter=line --output=/tmp/if-protection-final-ui-results`: **34 passed, 0 failed** (including four new timeline browser tests).
- `git diff --check`: **passed**.
- Desktop (1440 × 1000) and mobile (390 × 844) Chromium screenshots captured from the implemented application and visually inspected.

An initial combined browser run hit the existing 10/minute project-creation limiter. The new fixture helper now honors the server's `Retry-After` response; the clean full rerun passed without weakening server limits or existing tests.

Scope limitations: moving only; browser-only offline demo mode requires connecting to the backend for this feature; external resources are in Finnish; status is planning progress and does not verify insurance. Mobile validation used Chromium viewport tests, not a physical phone or every browser. Milestone history retains the latest 20 events per step. No deployment or external insurer account validation was performed.

## Previous timeline-only release

GitHub main previously shipped the timeline in commit `30d1cd0` with shared-token authentication. Its recorded checks were 219 backend tests and 34 browser tests. The current integration adds the opt-in public-session implementation, shopping and research features described in their separate reports; legacy authentication remains available when public access is disabled. Those historical counts do not describe this integrated release.
