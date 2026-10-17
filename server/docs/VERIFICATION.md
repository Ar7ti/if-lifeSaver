# Backend verification

Completed 2026-10-17 in the shared Life Simulator worktree.

| Workstream | Files | Outcome |
|---|---|---|
| Contracts and API integration | shared/contracts, app, service, repository, config, workspace | All required REST routes; audited confirmation extension; local storage; strict validation |
| AI planning | ai.ts, ai.test.ts | Local parsing and mocked Responses structured-output integration; bounded proposals and timeouts |
| Research | research.ts, research.test.ts | Live/demo/unavailable abstraction; cited provenance; conservative estimates and explicit unknowns |
| Financial logic | finance.ts, finance.test.ts | Cent-safe budgets; cart updates; deterministic scenarios; evidence-grounded risks |

Backend workstreams were coordinated through the Superset orchestration skill with disjoint file ownership; integration and final verification were performed by the coordinator. Worker terminals are retained for inspection.

The full automated suite passed **75 tests**. It covers financial totals, rounding and overflow; schema rejection; project/cart/workspace updates; scenario recalculation; stale research; assistant review and confirmation; seller/service drafts; repository restart, rollback and concurrency; origin/auth/rate limits; provider failure/refusal/timeout; mocked web-search provenance, unsafe URLs and prompt injection. TypeScript typecheck and build passed. The research suite was rerun after its final review and passed all 23 tests.

Actual HTTP smoke checks passed in both explicit fictional demo mode and the default credential-free mode. The default produced a Turku moving project from a request with €2,000, all nine widget types, and an honest unavailable/empty research result. Demo mode exercised research, cart and assistant proposals with explicit fictional labels. No frontend files were created or modified.

No OpenAI credentials were present. Live external account/model access and real search results have **not** been exercised. Run `cd server && npm run check:live` after configuring `server/.env` to perform the separate credit-consuming smoke check. Prices supported only by generated search summaries remain estimated, never independently verified.

The development server runs on http://127.0.0.1:3001 with local file persistence. Restart with `cd server && npm run dev`. Use the frontend handoff document for integration details and known deployment limitations.
