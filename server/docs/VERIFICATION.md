# Backend verification

Completed 2026-10-17 in the shared Life Simulator worktree.

| Workstream | Files | Outcome |
|---|---|---|
| Contracts and API integration | shared/contracts, app, service, repository, config, workspace | All required REST routes; audited confirmation extension; local storage; strict validation |
| AI planning | ai.ts, ai.test.ts | Local parsing and mocked Responses structured-output integration; bounded proposals and timeouts |
| Research | research.ts, research.test.ts | Live/demo/unavailable abstraction; cited provenance; conservative estimates and explicit unknowns |
| Financial logic | finance.ts, finance.test.ts | Cent-safe budgets; cart updates; deterministic scenarios; evidence-grounded risks |

Backend workstreams were coordinated through the Superset orchestration skill with disjoint file ownership; integration and final verification were performed by the coordinator. Worker terminals are retained for inspection.

The full automated suite passed **77 tests**. It covers financial totals, rounding and overflow; schema rejection; project/cart/workspace updates; scenario recalculation; stale research; assistant review and confirmation; seller/service drafts; repository restart, rollback and concurrency; origin/auth/rate limits; real TCP requests waiting longer than ten seconds; ungrounded preference guesses; provider failure/refusal/timeout; mocked web-search provenance, unsafe URLs and prompt injection. TypeScript typecheck and build passed. The research suite was rerun after its final review and passed all 23 tests.

Actual HTTP smoke checks passed in both explicit fictional demo mode and the default credential-free mode. The default produced a Turku moving project from a request with €2,000, all nine widget types, and an honest unavailable/empty research result. Demo mode exercised research, cart and assistant proposals with explicit fictional labels. No frontend files were created or modified.

Credentialed live HTTP acceptance passed with `gpt-6.1-sol` on 2026-10-17. The final run created a EUR 2,000 Turku moving project with nine widgets and unconfirmed delivery/used-item preferences, returned five cited live research candidates, added an offer to the planning cart, recalculated the budget, produced three scenarios and evidence-backed risks, drafted an unsent seller message, and applied a workspace proposal only after confirmation. The saved result is `server/data/live-test-report.json` in the main project folder. Test project ID: `c310ce30-a16f-470e-b7a5-d6b194bc71ed`.

Live testing identified and fixed a ten-second socket idle timeout and model guesses becoming hard search filters. A TCP regression test now waits eleven seconds before responding; unknown delivery and used-item preferences remain null. GPT-6 synchronous calls use low reasoning effort and bounded planner output after a medium-reasoning call exceeded its deadline. The final live creation took about 10 seconds, research 22 seconds, and assistant response 4 seconds; these are observations, not latency guarantees.

Run `cd server && npm run check:api-live` with the backend running to repeat the complete credit-consuming acceptance test. `npm run check:live` runs the provider/service smoke check independently. Live market results vary; an empty result is inconclusive. Prices supported only by generated search summaries remain estimated, never independently verified, and delivery costs/availability can remain unknown.

The development server runs on http://127.0.0.1:3001 with local file persistence. Restart with `cd server && npm run dev`. Use the frontend handoff document for integration details and known deployment limitations.
