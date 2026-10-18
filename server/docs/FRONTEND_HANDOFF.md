# Backend contract handoff — v1.1

## Public beta update — contract 1.5.0

See [PUBLIC_ACCESS.md](PUBLIC_ACCESS.md) for session/listing/admin endpoints, CSRF and idempotency headers, server-owned workspace isolation, quota errors and Railway rollout. Both public flags default off. Existing project response shapes remain unchanged. In public mode the frontend automatically initializes a cookie session, removes the token form, replaces remembered live summaries with an owner-filtered listing, clears cached private data on identity changes, and shows quota status. Legacy shared-token mode is retained. No production deployment has been performed.

Source of truth: `shared/contracts/index.ts`. Backend runs separately on `http://127.0.0.1:3001`; configure the frontend dev proxy to forward `/api` there, or use an explicit API base URL. The backend uses its own `server/package.json`. Targeted input, dialog, and contextual integration fixes in `src/` are documented below; visual design remains frontend-owned.

Install: `npm --prefix shared/contracts install && npm --prefix server install`.
Run: `cd server && npm run dev`. Server environment belongs in `server/.env` (copy `server/.env.example`). Local planning, budgets, carts, scenarios, risks and file persistence run without credentials. Research is unavailable unless enabled with OpenAI credentials or `RESEARCH_MODE=demo`.

## Money and state

All `*Minor` fields are integer euro cents; supported currency is EUR for this MVP. Research request `maxPrice` is in euros (`250` means €250), preserving the requested wire example. Display `minor / 100` with Intl.NumberFormat. Unknown offer prices/delivery costs are `null`, never zero. `budget.committedMinor` means selected planning commitments, never a payment. `remainingMinor = totalMinor - committedMinor`; `availableMinor` also subtracts proposed items and emergency reserve. Explicitly show demo/estimated/unverified fields.

Projects embed their workspace, cart, researchResults, scenarios, risks, tasks, actions and revision. Project writes optionally accept `expectedRevision` to detect stale UI edits; conflict returns 409. Refresh full project after mutations. Cart responses include recalculated budget and revision; other derived data is on GET project.

## Routes

| Route | Request | Response |
|---|---|---|
| POST /api/projects | CreateProjectRequest | `{project,workspace,questions}` (201) |
| GET /api/projects/:id | — | `{project}` |
| PATCH /api/projects/:id | ProjectPatch | `{project}` |
| POST /api/projects/:id/assistant | AssistantRequest | `{reply,proposedActions,workspacePatch}` |
| POST /api/projects/:id/research | ResearchRequest | ResearchResult, including status/mode/offers/warnings |
| GET /api/projects/:id/cart | — | `{items,budget,revision}` |
| POST /api/projects/:id/cart/items | AddCartItemRequest | `{items,budget,revision}` (201) |
| PATCH /api/projects/:id/cart/items/:itemId | CartItemPatch | `{items,budget,revision}` |
| DELETE /api/projects/:id/cart/items/:itemId | — | `{items,budget,revision}` |
| GET, POST /api/projects/:id/scenarios | no body | `{scenarios}` |
| GET /api/projects/:id/risks | — | `{risks}` |
| GET /api/projects/:id/workspace | — | `{workspace,revision}` |
| PATCH /api/projects/:id/workspace | WorkspacePatch | `{workspace,revision}` |
| POST /api/projects/:id/seller-message | SellerMessageRequest | `{draft,handoffUrl,sent:false,warnings}` |
| POST /api/projects/:id/actions/:actionId/confirm | `{approved:boolean,expectedRevision?:number}` | `{project}` |
| GET /api/health | — | HealthResponse |

Cart insert: use `{offerId, quantity:1, status:'selected'}` for researched offers, or a manual estimate with `{title,category,unitPriceMinor,quantity:1}`. Selecting an item only adds it to the plan. Editing sourced prices marks them estimated.

Workspace patches use existing widget IDs, e.g. `{widgets:[{id,visible:false}]}` or `{widgets:[{id,position:{x:0,y:0,w:6,h:4}}]}`. Config permits only category, sortBy, compact. Supported types: budget, product_catalog, shopping_cart, service_finder, scenario_comparison, risk_guardian, timeline, recommendations, task_list. Never execute workspace strings as code or HTML.

Assistant actions are audited proposals. Confirm an action through the confirm endpoint to apply it; rejected proposals remain in history. Confirming budget/cart/workspace proposals checks current project constraints. No route purchases, sends a message, pays or books. Seller messages are drafts with a source link handoff.

Errors: `{error:{code,message,details?}}`, e.g. VALIDATION_ERROR (400), NOT_FOUND (404), CONFLICT (409), RATE_LIMITED (429), AI_UNAVAILABLE / RESEARCH_UNAVAILABLE (503), UPSTREAM_TIMEOUT (504). Unknown fields are rejected. The API limits body sizes, request rates and AI action counts. Show research loading and errors; allow at least 100 seconds for a live research request.

Local use is a single-user demo. Production needs identity and per-user project authorization; optional API_TOKEN is a shared deployment access token, sent as `Authorization: Bearer ...` and never an OpenAI secret.

TypeScript input helpers `CreateProjectInput`, `ResearchInput`, `AddCartItemInput`, and `SellerMessageInput` allow omitted fields that have server defaults. The `*Request` types describe normalized values after schema parsing. Projects include only relevant supported widgets. Do not assume a fixed count or a moving scenario. Local simulation uses provisional allocation estimates until real offers exist. Fictional demo offers are excluded from automatic scenario selection; demo cart choices are included as explicitly estimated planning costs.

Live testing note: synchronous GPT-6 calls use low reasoning effort. Unknown delivery/new-or-used preferences remain null; questions prioritize essential scenario constraints; model guesses do not become hard search filters. Users can explicitly confirm these preferences through PATCH project. The backend socket timeout now accommodates the full bounded provider deadline.

## Contextual planning update (1.1.0)

`scenarioType` supports `moving`, `travel`, `car_purchase`, `home_furnishing`, `student_life`, and `other`. Added optional preference fields: `startDate`, `endDate`, `durationDays`, `travelers`, `ownsFurniture`, `ownedItems`, `vehicleType`, `useCase`. Existing persisted projects remain valid. Do not render moving labels for other scenarios.

Projects may include `categoryReasons`, `recommendationDetails` (title, explanation, priority, action, reason), and `answeredQuestions` (question → answer). Existing `recommendations: string[]` is retained. PATCH accepts `answers: [{question,answer}]`; questions must be current or previously answered. Send structured preference/budget/location changes alongside the answer. Saved answers survive reload/restart and enter compact AI context. Up to three essential open questions are returned at a time; further questions may appear as constraints are answered.

Assistant scope is checked server-side before model calls: practical goals and contextual follow-ups are allowed, unrelated tutorials redirect, ambiguous input asks for clarification. Project creation can return `OUT_OF_SCOPE` or `SCOPE_CLARIFICATION` (422). General programming tutorials are outside scope; course research and university budgets remain supported. Every proposed action still needs explicit confirmation.

Scenario profiles determine categories, weighted cent-based allocations, questions, checklist and widget subset. Owned beds/desks do not create mandatory repurchase categories. Travel search uses route, dates, duration and travelers; car research uses vehicle description and intended use. Research requests should preserve the specific category (`bed_frame`, `vehicle`, `accommodation`), rather than replacing it with a broad budget envelope. Matching financial groups are handled by the server. Source summary prices remain estimated; national delivery is not proof of address coverage.

Targeted frontend changes: shared keyboard guards ignore native/ARIA editable controls and composition; composer/chat only submit non-composing Enter (Shift+Enter remains native). Dialogs portal to document.body with a scrollable body and fixed header/footer; Details uses a larger desktop width and mobile viewport height. Existing visual styling is preserved. Details, question forms, research starters, checklist headings, assistant suggestions and timeline date labels now use scenario context. Optional structured recommendations render through existing card styling.

Browser regressions: `npm run test:ui` at repository root (first install: `npx playwright install chromium`). Playwright starts isolated local API/demo research on 3002 and Vite on 5174, or reuses those test servers. It never uses the OpenAI key. `npm --prefix server test` covers mocked external integrations and persistence. Opt-in `cd server && npm run check:context-live` checks the three acceptance scenarios against the running live backend, consumes credits, and writes `data/context-live-test-report.json`.

The frontend-only mock adapter remains a labelled fixed moving demo. Contextual no-key/offline planning uses the real local backend (`AI_MODE=local`, `RESEARCH_MODE=demo`), which is also the browser workflow test target. Keep Settings on the API data source to use contextual scenarios.

## AI recovery update — contract 1.2.0

`LifeProject.conversation` is optional for backward compatibility. When present it contains a project-specific `id`, `activeRequest`, at most 12 saved user/assistant `turns`, and at most 40 `clarifications`. A clarification has an ID, related field, question, `pending | answered | dismissed | superseded` status, created/updated timestamps, original request/scenario context, answer and bounded attempts. The backend matches answers against the last actual assistant question and saved project context. Conversation IDs are generated and stored per project; the assistant request still uses the existing project route and requires no new conversation parameter.

Assistant request/response envelopes are unchanged. Refresh GET project after both assistant success and errors: explicit user facts may have been saved before an upstream model error. The current AssistantPanel now does this; no styling/layout changes were made. PATCH `answers` can update canonical budget/preferences even without a duplicate structured value. Existing structured form fields remain supported. The server retains existing budget allocations when the total increases; the increase remains unassigned. A decrease below existing allocations returns `BUDGET_ALLOCATION_CONFLICT` (409) so the user can review the allocation instead of silently overwriting it.

Chat answers update canonical project data before model generation, reconcile pending questions, invalidate stale research when relevant, and preserve selected cart choices. Short affirmative answers resume the original task; they do not confirm research, purchases or other proposed actions. Those still require the existing explicit confirmation endpoint. The assistant reuses equivalent pending proposals instead of creating duplicate action records.

No OpenAI model, key location, or provider configuration changed. Ambiguous language can use a bounded strict structured interpretation call; exact evidence from the current user message is required for model-extracted facts. Clear out-of-scope tutorials still redirect before model calls. Use `cd server && npm run check:conversation-live` for the explicit credit-consuming live HTTP check. See `AI_RECOVERY.md` for root causes, tests and limits.


## Contract 1.3.0 — Moving-only If home insurance

See [IF_HOME_INSURANCE.md](IF_HOME_INSURANCE.md) for the verified Finnish API endpoints, credentials, new routes, privacy boundary and recurring budget semantics. Additive `LifeProject.homeInsurance` and `Budget.recurringProposedMinor`; existing widget types and assistant payloads are unchanged. The new `HomeInsuranceSection` uses the existing live/mock adapters. Without approved If credentials it explicitly shows unavailable and accepts only safe home details; it never supplies a demo If price. Do not add `recurringProposedMinor` to `proposedMinor`: it is already included.


## Contract 1.4.0 — If Smart Protection Engine

See [SMART_PROTECTION.md](SMART_PROTECTION.md) for the architecture, exact Finnish Car OpenAPI, environment, route table, demo and integration steps. Additive `LifeProject.protection`, structured `preferences.vehicle` and `preferences.monthlyBudgetMinor`. Home state/form/routes are preserved and projected into the overview. `ProtectionSection` is the contextual workspace entry point; `/app/protection` uses the same project query cache. The new `protection_action` assistant command only opens/reviews saved state and never requests prices or sends identity data. Car demo quotes are explicitly fictional and use the same persistence/budget flow as returned If prices. Use the local backend (API data in Settings); the old frontend-only mock adapter remains a separate moving demo.

The reused `server/src/if-car-insurance.ts` remains the only real Finnish Car HTTP provider. `server/src/car-insurance.ts` adapts it for Smart Protection. Do not render the older transient Car price panel alongside the new Protection car workflow when integrating the main checkout's in-progress work. Preserve unrelated Travel/research changes. Main's legacy price endpoint should be treated as a compatibility endpoint; Smart Protection UI and chat use canonical project state and `/protection/car/*` routes.

### Protection Timeline — additive contract 1.6.0

Moving-only derived timeline and saved planning progress are documented in [PROTECTION_TIMELINE.md](./PROTECTION_TIMELINE.md). New routes: `GET /api/projects/:projectId/protection-timeline` and `PATCH /api/projects/:projectId/protection-timeline/:milestoneId`. The optional `project.protectionTimeline` field is validated and saved by the existing repository. PATCH requires `completed`, `expectedContextFingerprint` and optionally `expectedRevision`; response is `{project,timeline}`. No new widget type, AI action, insurance state, authentication behavior or deployment configuration is introduced. Frontend consumes it inside the existing moving `timeline` widget.

### Smart visual shopping and comparison — additive contract 1.7.0

See [SMART_SHOPPING.md](./SMART_SHOPPING.md) for provenance, financial rules, new image metadata, `preferences.requiredItems`, server-backed `scenarioSelection` and the three atomic planning endpoints. `convenience` and `effort` now support `unknown` (render “Not enough information”). Scenario `changes` are proposals, not purchases. Replace/undo require explicit approval and `expectedRevision`; replacing a chosen line additionally needs `allowSelected:true`. Scenario application requires the returned input fingerprint. Existing authentication, ownership, quotas and insurer budget horizons remain in force; no automatic paid research or quote is triggered.

### Live research preparation — additive contract 1.8.0

See [LIVE_AI_STAGING.md](./LIVE_AI_STAGING.md) for implemented changes, measured mocked evaluations and the blocked live deployment. Optional research constraints (`condition`, `limit`, `sort`, `localOnly`, `pricePeriod`, `purpose`) are preserved in saved requests/actions. Optional `reportedRate` is a unit rate, **not** a cart/scenario total; `priceMinor` remains null until a suitable one-time total exists. Optional `sourceType` is a reported listing/category/information/lead classification, not independent verification. Research diagnostics expose tool execution/counts without private prompts. Optional health `configuration.providers` distinguishes SDK/local/injected implementations; a mode label or health response alone cannot prove a real provider call succeeded. UI reads/writes preserve newer revisions and request timeouts include response-body parsing. Existing routes, ownership/CSRF and paid-call boundaries remain unchanged. No live deployment has occurred.

## Smart Research v2 — contract 1.9.0

One `ResearchResult.offers` array is retained. Optional `eligibilityStatus`, `evidenceByField`, `missingEvidence`, `confidenceExplanation` on offers; optional `summary`, `refinementSuggestions`, `rejections`, `engineVersion` on results; optional project `researchFeedback`. Old JSON projects remain valid. Supported means cited-summary support, not independent verification. Potential results must remain outside cart/replacement/scenario expenses until facts are reviewed; the backend enforces this with `OFFER_NEEDS_REVIEW`. Feedback endpoint: `POST /api/projects/:projectId/research/:resultId/feedback` with `{offerId,type,expectedRevision?}`; type is useful/not_relevant/outdated/incorrect_details or null to clear; returns `{project}`. Existing ownership, CSRF, revisions and private-cache rules apply. Refinement buttons compose chat only, never perform automatic paid research. See `SMART_RESEARCH_V2.md`.


## Universal Products v1 — contract 1.10.0

The existing research endpoint and single offers array are retained. Optional request fields: `productSource` (auto/web/ebay), `country` (ISO2), `currency`, `searchTerms`, `providerCategoryId`, `deliveryPostalCode`. Offers can retain supported original currencies or null; project/cart budgets stay EUR. Optional `product` metadata carries provider/item identity, API/metadata provenance, original/provider-display-converted prices, requested marketplace, images, shipping class and known subtotal. Cart choices preserve this metadata. Results optionally include `productRoutes`, `productDiagnostics` and `providerOrder`. Provider source order must not be locally re-sorted. Same-currency original prices render through `formatMoney(...,{currency})`; do not compare currencies without a sourced conversion. Foreign and potential offers are rejected from cart/replacement/scenario budgets server-side. API failures never trigger web research automatically. Existing unsupported/missing-credential states offer an explicit web retry. `GET /api/products/capabilities` is authenticated and contains only safe access/country/category metadata. API credentials remain backend-only. See `UNIVERSAL_PRODUCTS_V1.md` for access blockers, official contract evidence and the synthetic local demo.
