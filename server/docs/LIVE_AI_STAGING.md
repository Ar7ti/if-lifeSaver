# Live AI staging and research diagnosis

## Delivery status — bounded live verification, 2026-10-18

**Real planning, hosted web search and assistant requests executed successfully. Furniture result quality is limited: zero qualifying offers. A live follow-up constraint bug was reproduced, fixed and regression-tested; the fix has not consumed another paid call. Public AI is paused after the bounded test.**

Application: **https://web-live-ai-staging.up.railway.app/app**.

Only `live-ai-staging` in Railway project `if-lifesaver` was changed. Separate API/web, private Caddy routing, isolated `/data` volume, SQLite sessions, ownership, CSRF, quota reservations and kill switch remain enabled. Production and mock staging remain unchanged.

### Project identity and controls

The signed-in OpenAI dashboard identified **life simulator**, project `proj_StswGZiVV3ES5DwRmoPzrOGY`. Its active key's masked metadata matched the backend credential without printing key fragments. The credential is project-scoped; a non-billable model lookup accepted the confirmed project header (200), while a mismatched-project negative control returned 401. This combines account-side evidence with authorization checks; it does not infer identity from the secret alone or prove that no unrelated external consumer uses this project.

The dashboard confirmed USD 5/month, a 100% alert, and **“Limit not enforced.”** This is an alert, not a hard cap. `gpt-6.1-sol` inherits **5,000 RPM / 1,000,000 TPM**. These high limits provide capacity, not meaningful spend protection. No OpenAI account limits or credentials were changed.

The application retained USD 3/day public estimated budget, a separate USD 3 administrator safety budget, five provider invocations per visitor/UTC day, session concurrency 1, global concurrency 3, no automatic SDK retries, and at most three hosted search calls. All paid tests used one anonymous session, without administrator bypass or quota increases.

### Actual results

| Test | Observed result |
| --- | --- |
| Moving project | HTTP 201, 18.0 seconds, canonical Turku destination, EUR 2,000 budget, moving tasks/questions, `aiMode: openai`. One real provider invocation. |
| Used-sofa research | HTTP 200, **limited**, 25.3 seconds. **Three completed hosted web-search calls**, 40 source URLs, two cited passages/candidates. Both candidates rejected because used condition was not established. **Zero accepted offers; no usable returned listing prices, images or source links.** No mock substitution. |
| Second-hand/price follow-up | HTTP 200, 4.2 seconds. **Failed constraint-continuity check:** broad `activeCategory: furniture` overrode the prior sofa request and dropped locality/ceiling. Fix described below; no additional paid retest. |
| Budget advice | HTTP 200, 8.4 seconds. Acknowledged no qualifying sofa, distinguished the provisional EUR 1,800 moving estimate from quotes, and explained the EUR 200 buffer. Did not invent a recommended listing. Its research proposal also exposed the same broad-context issue. |
| Sixth provider request | Rejected **429 AI_QUOTA_EXCEEDED**, before provider dispatch; recorded provider usage unchanged. |
| Tenant isolation | Another anonymous session received 404 for project read/update, assistant/research, home-insurance read/quote, protection update and protection timeline. Its workspace list stayed empty. No additional paid calls. |

Rejected candidate titles reported by the generated cited summaries were “Sohva harmaa pieni 2 henkilölle” and “Kaunis ja ajaton, Howard tyylinen sohva.” They are **not verified qualifying listings**. The result retained warnings but no accepted URLs, so independent source accessibility, price and condition checks could not be performed on returned offers. The exact source passage for the missing condition is not retained in diagnostic logs; no claim is made that a particular Finnish phrase caused this live rejection. The validator still requires explicit source-supported condition rather than assuming every marketplace item is used.

**Cost:** five actual provider invocations, three hosted search calls; conservative application accounting **USD 0.223775**. Research alone: 34,249 input tokens, 1,019 output tokens, estimated **USD 0.182281**, including USD 0.03 in search-call estimates. These are internal estimates at configured conservative rates, not the provider invoice. The project-filtered OpenAI Usage dashboard subsequently reported **USD 0.13 and five requests**, with 40,625 input tokens. This is rounded, potentially delayed reporting, not a final settled invoice. It showed two Web Searches requests, while the Responses tool output contained three web-search-tool invocations; the application conservatively counts all three. No unverified equivalence between these counts is asserted. Exact settled provider spending remains unknown.

### Focused fix and final safety state

`server/src/ai.ts` now resolves explicit item words first, saved research for contextual refinements/comparisons second, then the broad UI tab. The command validator recognizes the user-supplied tab while retaining the resolved item-specific category. Omitted model actions for “cheaper” refinements receive the existing validated fallback. `research-constraints.ts` retains prior request details for these refinements/comparisons. No user selection is automatically applied and no extra search is dispatched.

The new regression supplies the actual `activeCategory: furniture`, an empty previous sofa search, used/local/price/count constraints, omitted model actions, a broad model proposal, and an explicit switch to beds. **261 backend tests pass**. A previous test omitted UI context and therefore missed this real integration failure. The fix was validated with mocks, not another paid attempt beyond the five-call quota. It is deployed as API `e4601d6e-f8a2-4a25-92fc-26f70e386af8`; web remains `dda0dc06-28ee-408f-b806-715eabfb5caf`. The test visitor session, saved EUR 2,000 project, research result and five-used/zero-remaining quota survived the first fix deployment (`be873f0d-bea4-4131-b158-1551fefec97a`), and the paused switch persisted. The final explicit-category safeguard deployment also preserved the browser anonymous session; an authorized read confirmed the project, research, conversation turns and five provider charge records remain on the isolated volume. Existing historical proposals are not rewritten automatically; use a fresh explicit sofa request when conducting a future paid retest.

`PUBLIC_AI_ENABLED=true` on this staging API permits controlled activation, while the durable administrator kill switch is currently **false**. Effective public AI is therefore **paused**, including after restart. Existing saved workspaces remain readable. All budget/quota/concurrency limits remain unchanged. Do not represent this as a fully passed live shopping demo or enable a public launch based only on tool execution.

Evidence: [provider controls](live-ai-staging/provider-control-verification.json), [raw bounded test results](live-ai-staging/bounded-live-test.json), [insurance isolation](live-ai-staging/insurance-isolation-live.json), [configuration](live-ai-staging/configuration-status.json), [deployment state](live-ai-staging/deployment-state.json), [earlier HTTPS preflight](live-ai-staging/https-preflight.json), [browser checks](live-ai-staging/browser-preflight.json), [source manifest](live-ai-staging/deployed-source-manifest.json), [final runtime checks](live-ai-staging/final-runtime-verification.json).

## 1. Confirmed root causes

| Finding | Evidence and focused fix |
| --- | --- |
| Assistant actions lost the user's constraints | `server/src/ai.ts` constructed research actions with `preferences: []` and accepted only category/ceiling from model proposals. `research-constraints.ts` now preserves explicit condition, count, locality, ceiling, sorting and bounded request wording. |
| A sofa request could become moving-service research | `contextualCategory` recognized beds/cars/travel but not sofa/desk/chair. These explicit categories now take priority over the moving default. |
| Used-only was not a hard constraint | `exclusionReasons` enforced new-only but had no used-only condition. Explicit conditions now filter unsupported/new/unknown results rather than silently substituting them. |
| Follow-ups lost the original search | Short refinements now merge saved actions and direct research by timestamp, including empty results, before applying current explicit constraints. The exact “Only show second-hand options, sorted by price” request retains category, city and ceiling even without a prior chat action. |
| Explicit research could disappear behind generic advice | A valid explicit research intent omitted by the model receives a validated, reviewable research action through the existing registry. Search still requires user confirmation. |
| Rental rates disappeared or risked becoming purchase totals | Existing price parsing intentionally rejected monthly/nightly/person rates. `reportedRate` now exposes a source-reported amount and period separately. `priceMinor` stays null, so the rate cannot enter the cart or scenario as a one-time total. Monthly ceilings use the matching monthly rate. |
| Citation formatting discarded valid isolated bullets | Previously only double-newline paragraphs bounded evidence. A block with different citations now falls back to isolated single cited lines. Multiple different sources on the same line remain rejected; adjacent evidence is never borrowed. |
| It was hard to identify the failing stage | Safe diagnostics now distinguish actual tool execution, no usable cited passage, extraction/schema failure, constraint rejection, duplicates, timeout and successful completion. |
| An old response could overwrite newer UI state | Project refresh/write helpers now preserve the higher project revision and cancel older reads before setting a mutation result. Research waits for its refreshed project before ending loading and associates callbacks with the initiating project. |
| Response-body parsing escaped the browser timeout | `src/api/live.ts` now keeps the abort timeout active through JSON-body consumption. It previously cleared the timeout after headers arrived. |
| Honest uncertainty text was discarded | The unsupported-price-claim guard previously matched “not independently verified” as if it claimed verification. Narrow negative disclaimers now survive while positive unsupported verification claims remain blocked. |

The pre-existing search implementation already used `tool_choice: required`, `web_search`, at most **three hosted-tool calls**, stateless Responses requests, no SDK retries, and a second tool-free structured extraction call. This task did **not** invent a missing search tool or add an unrelated AI architecture.

### Important finding about the old mock staging

Read-only checks confirmed that `public-access-staging` reports `openai/live` in its old health configuration. That is **not evidence of real AI**: the saved deployed `staging-fixture.ts` deliberately changes mode labels to exercise the paid-call boundary while injecting local/demo providers. Its `STAGING_MOCK_PROVIDERS=true` setting and absent OpenAI key were rechecked without printing credential values. The existing deployment was left alone.

New health responses add `configuration.providers.ai/research`: `openai_sdk`, `local`/`demo`/`unavailable`, or `injected`. This identifies implementation, not successful account authorization. The live evaluator rejects injected providers and the mock-staging response header; only a real paid response can prove live execution.

Production's direct API health returned HTTP 200 and unauthenticated project access returned 401. Its web origin still uses the older separate-API architecture; a web `/api` HTML response is not an API health failure.

## 2. Provider behavior and official verification

Existing model preserved: **`gpt-6.1-sol`**, configured by server-only `OPENAI_MODEL`.

- Existing OpenAI SDK; **Responses API**, `responses.create`/structured parsing.
- Planning/assistant calls do not gain web tools.
- Research stage 1: required `web_search`, maximum 3 tool calls, `include: web_search_call.action.sources`, `max_output_tokens: 6000`, no automatic retries.
- Stage 2: tools disabled, strict JSON schema, maximum 6000 output tokens, same abort deadline.
- Missing/failed hosted search produces `WEB_SEARCH_NOT_EXECUTED`/`WEB_SEARCH_FAILED`; it cannot become a fake successful search. Completed search with no usable evidence returns an honest limited empty result.
- General If information uses an official `if.fi` domain filter and a backend domain check. General guidance never supplies personalized premiums; the existing authorized quote services remain separate.

Verified against official documentation on 2026-10-18:

- [Model support](https://developers.openai.com/api/docs/models/gpt-6.1-sol): Responses tools, structured outputs, hosted web search and low reasoning are supported. Model visibility, paid response/tool execution, project association and the dashboard control settings were verified during the bounded live test.
- [Web search behavior](https://developers.openai.com/api/docs/guides/tools-web-search): automatic tool selection is optional; required selection is appropriate for explicit research.
- [Pricing](https://developers.openai.com/api/docs/pricing): Standard short-context input/output USD 2/10 per million tokens; long-context USD 4/15. Hosted web search USD 0.01 per call, plus search-content tokens at model rates.

Prepared staging uses the conservative **4/15/0.01** estimates rather than the old mock staging's synthetic accounting rates. Cached-token discounts are not assumed. Pricing, context overhead, provider settlement and timeouts still make this an **estimated application safety budget, not a guaranteed monetary hard cap**. The official pricing was rechecked before deployment. The dashboard controls were verified before paid calls; its USD 5 alert-only limit is not enforced.

## 3. Validation and additive contracts (1.8.0)

New optional research request fields: `condition`, `limit`, `sort`, `localOnly`, `pricePeriod`, `purpose`. Existing requests remain valid.

Results optionally preserve their normalized `request` and numeric `diagnostics`. Offers optionally have `sourceType` (`listing`, `category`, `information`, `lead`) and `reportedRate` (`amountMinor`, `period`, supporting evidence). Existing projects require no destructive migration.

- Current explicit facts override prior search constraints. Confirmed project details supply missing context.
- Local-only searches exclude unsupported locality instead of silently becoming nationwide searches. Non-local discovery retains its existing uncertainty disclosures.
- Fewer supported matches than requested are returned with a warning; no padding with fictional products.
- Unsafe/non-public URL literals, unsupported identities, wrong-category results, conflicting duplicates and explicit constraint failures remain excluded.
- Known category URLs cannot supply an exact product price. Source type is reported/heuristic metadata, **not independent page verification**.
- Prices/images remain source-reported, not independently verified. No additional image search or arbitrary URL-fetch proxy was introduced.
- Remote page accessibility, listing freshness and merchant media rights are not independently established. The UI says so; it does not promise links are accessible.
- A monthly rental rate is never multiplied into a stay, added as a one-time purchase, or mixed into the furniture budget automatically.

## 4. Observability and usage protections

`research_diagnostic` logs contain a correlation UUID, operation/mode/model, stage/failure stage, tool execution/counts, source/passage/candidate/accepted/rejected counts, rejection categories, duration, available token totals and approximate research cost.

No keys, cookies, SSNs, identities, raw prompts, full webpage content, full provider payloads, seller messages or session IDs are placed in these diagnostic records. Correlation IDs are returned with authorized project research results. Failure logs retain the failing stage and a safe error code, not provider exception text.

Existing `paidProviderCall` and durable SQLite reservations remain authoritative. Both research SDK calls are separately metered; creation and assistant calls remain metered too. Search has no extra retry loop. Failed dispatched calls retain conservative reservations because a transport error does not prove no charge. Daily UTC quotas, concurrency limits, request deduplication, session ownership, CSRF, administrator authorization and the kill switch are unchanged.

**Five calls per visitor is five provider invocations, not five chat turns.** A normal research operation usually consumes two calls. A remaining allowance of one may permit search but reject extraction; that is reported as a quota error, never substituted with mock results.

## 5. Reproducible quality evidence

See [recorded mocked metrics](live-ai-staging/mock-evaluation.json). These are **synthetic SDK fixtures**, not actual web-search performance or merchant verification.

| Case | Candidates | Accepted | Rejected | Result |
| --- | ---: | ---: | ---: | --- |
| A: used/local sofas under EUR 200 | 6 | 2 | 4 | New, wrong-location, over-ceiling and duplicate reports do not pad a request for three. |
| B: Turku rental below EUR 750/month | 1 | 1 | 0 | Monthly rate exposed; one-time price remains unknown. |
| C: dated Helsinki–Tampere transport | 2 | 1 | 1 | Passenger option retained; freight excluded. |
| D: used Toyota below EUR 8,000 | 3 | 1 | 2 | Purchase constraints retained; rental/over-ceiling options excluded. |
| E: official If home guidance | 2 | 1 | 1 | Official information retained; broker excluded; no personalized premium. |

The fixture file records source counts, prices/rates, zero image URLs, duplicate rates, measured fixture latency, and synthetic-token cost estimates. Source-reported constraint matching is 100% for the asserted accepted fixtures; **this is not a live quality claim**. Actual paid cost and actual network searches are zero.

Additional regression cases cover free-form UI category normalization, single-line citation isolation, two-step HTTP follow-up context, model omission of explicit actions, timeout, no tool execution, invalid structured output, empty sources, strict staging configuration and honest health provenance. Existing imagery tests cover source-specific/broken/unsafe photos separately.

Browser coverage checks the actual React interface against controlled timeout, empty, rate and quota responses. It verifies loading resolves, retry works, source links render, a monthly rate cannot be added as a purchase, and saved budget access remains usable. The test name explicitly distinguishes controlled responses from live-provider verification.

### Commands

```sh
npm --prefix server test
npm --prefix server run typecheck
npm --prefix server run build
npm run typecheck
npm run build
npx playwright test --reporter=line
```

The existing public browser config uses ports occupied by the user's local preview. Its five tests were run through an untracked temporary wrapper using isolated 3096/5196 ports, without changing tracked configuration or server protection.

### Executed check results

- **261 backend tests passed, 0 failed** on the final full run, including local session/quota restart persistence, ownership, legacy isolation, admin authorization, CSRF, deduplication, concurrent reservations, global budgets, metered direct/confirmed research, insurance, shopping and scenarios.
- **38 Playwright UI tests passed** in the preceding full application suite; **5 public-access browser tests passed** on isolated ports. During this live verification, the focused research/moving/travel/car/reload suite reran: **5 passed**. All browser suites used local/demo/controlled providers; the separate deployed dashboard was also inspected. These are not live-provider quality tests.
- **8 research-quality evaluation tests passed** in the artifact-producing run. The new staging guard/provenance tests are also included in the 261-test backend total.
- Backend TypeScript check and build succeeded; frontend TypeScript check and production build succeeded. `git diff --check` passed. No lint command exists in the inspected package scripts, so no lint pass is claimed.
- The live evaluator's default dry run succeeded without networking or paid requests.
- An intermediate regression run caught a trailing comma in extracted locality; the parser was corrected rather than weakening the assertion. A successful-response JSON-body failure was also made a recoverable `INVALID_RESPONSE`, and the browser recovery test now covers it.
- Existing production and mock-staging deployment IDs remained unchanged; see [redacted deployment state](live-ai-staging/deployment-state.json). The new staging API and web are deployed. The bounded live test created one fictional workspace; restart persistence is recorded separately in the live test artifact.

**Live paid model/search validation executed:** see the current delivery results above. Local fixtures do not establish merchant facts; the live search returned no qualifying offers. Internal total cost estimate is USD 0.223775, not a settled invoice.

### Earlier remote preflight (before live activation; no paid calls)

- `/api/health`: ready, contract 1.8.0, OpenAI/live modes, both provider implementations `openai_sdk`.
- Two new anonymous sessions received different principals. Secure, HttpOnly, SameSite=Lax, host-only cookies were verified.
- Missing CSRF returned 403. Paused public project creation returned 503 `PUBLIC_AI_DISABLED` before provider dispatch. Owned workspace listing returned 200; unknown project returned 404.
- Independent administrator login, status and logout worked; status reported the public kill switch off, USD 3 public and USD 3 separate administrator estimated budgets, and no provider usage records.
- The actual deployed page loaded at desktop and 390 px mobile width with no horizontal document overflow, no access-token prompt, a visible paused-AI disclosure, and no captured browser console errors.
- No remote project was created. Actual remote cross-project access with populated projects, quota exhaustion, research quality and workspace persistence after restart are **not** claimed from this preflight; deterministic local tests cover those paths with mocks.

Regenerate the mocked metric artifact explicitly:

```sh
cd server
WRITE_RESEARCH_EVALUATION=true npx tsx --test tests/research-quality.test.ts
```

## 6. Railway deployment and remaining activation

Only `live-ai-staging` was changed. API and web are now deployed with the existing Dockerfiles and a source allowlist containing current public-access, shopping, insurance, protection-timeline and research code. No `.env`, persisted data, credentials, Git metadata or test fixtures were uploaded. The redacted SHA-256 manifest identifies the exact source snapshot.

- API Dockerfile `deploy/api.Dockerfile`; command `npx tsx src/live-ai-staging.ts`; one replica; new `/data` volume; private network only; health `/api/health`; `HOST=::`, port 8080.
- Web Dockerfile `deploy/web.Dockerfile`; `CADDY_CONFIG=Caddyfile.public`; `VITE_API_BASE=/api`; `API_UPSTREAM` uses verified references to this environment's API private domain and configured port.
- Separate staging API/admin credentials remain private. The OpenAI key was supplied by the user, checked only on the correct service, and never printed or copied from production.
- Public AI was activated only for the verified five-call workflow and then paused through the durable kill switch. Do not use administrator paid calls or fresh visitor sessions to bypass the exhausted test allowance.

`PUBLIC_AI_ENABLED` is now true only on this staging API. The persisted administrator kill switch must also allow public calls and is currently false. Keep all quotas and reservations; no new service or volume is required.

### Bounded four-test workflow (executed once; no paid retries)

Use one anonymous session and fictional user data, without administrator bypass:

1. Create the user's moving-to-Turku project with EUR 2,000 (normally one provider invocation).
2. Directly request up to three used sofas, Turku only, EUR 200 ceiling, direct sources and prices (normally two provider invocations: hosted search plus extraction).
3. Ask “Only show second-hand options, sorted by price.” (normally one assistant invocation). Inspect the proposed action's retained category/location/ceiling/condition/sort; do not automatically execute a second research operation.
4. Ask “Which option would be best for my budget, and why?” (normally one assistant invocation). Check against saved offers and deterministic budget totals.

This normally consumes the configured **five** visitor provider invocations. Do not raise the limit, create extra sessions to bypass it, or silently retry. A failure that consumes quota or exhausts the conservative global reservation may block later steps; report it. Search allows at most three hosted tool calls. Record actual tool completion, source counts, rejections, latency and billed/estimated usage; never substitute demo offers after a live failure.

Another anonymous session was denied access to the populated project, including actual insurer routes. Session/project/quota persistence across the fix deployment is recorded in `bounded-live-test.json`. Do not repeat paid requests merely to test persistence.

### Initial bootstrap API variables (private staging service only)

The example keeps the environment-level flag false for initial setup. The current environment flag is true; the durable administrator kill switch is false after testing.

```dotenv
LIVE_AI_STAGING_CONFIRMED=true
HOST=::
AI_MODE=openai
RESEARCH_MODE=live
OPENAI_MODEL=gpt-6.1-sol
STORAGE_MODE=local
DATA_DIR=/data
SECURITY_DB_PATH=/data/security.sqlite
PUBLIC_ACCESS_ENABLED=true
PUBLIC_AI_ENABLED=false
SESSION_COOKIE_SECURE=true
PUBLIC_AI_REQUESTS_PER_DAY=5
PUBLIC_MAX_CONCURRENT_AI_REQUESTS_PER_SESSION=1
GLOBAL_MAX_CONCURRENT_AI_REQUESTS=3
PUBLIC_MAX_WORKSPACES_PER_SESSION=5
GLOBAL_DAILY_AI_BUDGET_USD=3.00
ADMIN_DAILY_AI_BUDGET_USD=3.00
AI_INPUT_USD_PER_MILLION=4
AI_OUTPUT_USD_PER_MILLION=15
AI_WEB_SEARCH_USD_PER_CALL=0.01
AI_RESERVED_INPUT_TOKENS=200000
AI_TIMEOUT_MS=60000
RESEARCH_TIMEOUT_MS=90000
LOG_LEVEL=info
```

Also configure privately, **never in source or chat**:

- `OPENAI_API_KEY`: a new staging-only OpenAI project/key, with provider-side controls.
- `API_TOKEN`: fresh legacy credential for this environment only, not the production value.
- `ADMIN_ACCESS_KEY`: fresh independent strong staging administrator secret, distinct from that token.
- `ALLOWED_ORIGINS`: the exact new web HTTPS origin, containing `live-ai-staging` for the prepared guard.

`RAILWAY_ENVIRONMENT_NAME` is supplied by Railway. Do not set `STAGING_MOCK_PROVIDERS=true`. No If credentials are needed for general official information; existing live personalized insurance pricing still needs its authorized integration. Do not copy production insurer credentials.

Provider usage budgets/alerts must be reviewed in the separate OpenAI project; application reservations alone cannot guarantee a strict spending ceiling. A key's project ownership/control settings cannot be inferred from a successful model response.

### Bounded live evaluation after deployment and consent

```sh
cd server
# Dry run: no network, no paid calls
npx tsx scripts/evaluate-research.ts

# Set LIVE_AI_STAGING_ORIGIN to the actual NEW origin, then explicitly opt in:
npx tsx scripts/evaluate-research.ts --confirm-paid --case furniture
```

Supported cases: `furniture`, `housing`, `transport`, `car`, `insurance`, `followup`. `--all` explicitly selects all six; it is not the default. Each uses a new isolated anonymous session and a fixed number of HTTP requests, no retries, no admin bypass, and normal quota protections. The transport fixture uses 2027-02-20; update it deliberately once it is no longer future.

The evaluator refuses production/mock origins, non-public sessions, injected-provider provenance, wrong contract/mode, and unreviewed public limits. It writes `server/docs/live-ai-staging/live-evaluation.json` with actual observed results/errors. It never records credentials or cookies. Reported research costs exclude creation/assistant costs; the provider invoice remains authoritative for total billed spending. Live failures are recorded as failures, not replaced with demo outcomes.

### Before declaring live staging ready

- Real successful planning and research response; hosted tool completion confirmed from provider output, not health or HTTP 200 alone.
- Repeat isolation, CSRF, quotas, deduplication, global concurrency/budget, admin and legacy-project checks on the new HTTPS origin.
- Verify `Secure; HttpOnly; SameSite=Lax` host-only cookies and same-origin proxy; direct backend remains private.
- Complete a fictional workspace, restart only the new staging API, then confirm session/quota/project persistence on the new volume.
- Review actual quality metrics and sampled source pages manually, including blocked/outdated pages, prices, condition and location.
- Confirm production and mock-staging deployment IDs and volume attachments remain unchanged.

### Backup, stop and rollback

The new environment has test session/security records and one fictional moving workspace created by the bounded live test. Before storing meaningful data, back up JSON plus SQLite using a consistent snapshot (stop writes or SQLite backup/checkpoint with its WAL); encrypt backups and keep them private. Never restore production data into staging. To stop spending immediately, use the existing administrator public-AI kill switch; setting the public flag off and restarting must be targeted to this new environment only. Admin calls have a separate safety budget, so revoke/pause the dedicated provider key too if all paid use must stop. Roll back only this environment's deployments; preserve its volume and never point old code at another environment's data.

## 7. Focused file inventory

New: shared `research.ts`; backend `research-constraints.ts`, `live-ai-staging-config.ts`, `live-ai-staging.ts`; evaluation script; `research-quality.test.ts`, `live-ai-staging.test.ts`; browser `research-live.spec.ts`; this document and recorded mock metrics.

Updated: shared contracts index; backend `ai.ts`, `research.ts`, `research-intent.ts`, `service.ts`, `app.ts`; frontend `src/api/live.ts`, `src/hooks/useProject.ts`, research `ResearchCatalog.tsx`/`OfferCard.tsx`; existing AI/research tests and frontend handoff. Existing dirty shopping, timeline, public-access, insurance and deployment files were preserved. No branch switch, merge, push, worktree creation, secret rotation or production deployment was performed.

## 8. Remaining limitations and blocked acceptance criteria

- **Not fully passed:** no qualifying used-sofa offers were returned; source quality and actual prices cannot be endorsed. The broad-tab follow-up bug is fixed and mocked regressions pass, but the fix has not been retested with a paid request. Public AI is paused after the five-call allowance. Exact settled provider charges are not available from the application.
- No independent merchant page fetch, stock verification or URL availability guarantee. Source typing, prices and images remain reported evidence; browser image hosts still receive normal image requests.
- Initial explicit-constraint normalization supports common English phrasing; unrecognized preferences remain model context, not guaranteed hard filters. Complex contradictory or multilingual requests need additional evaluation.
- Three hosted calls and one extraction are bounded, so sparse/local/private-market listings can legitimately produce fewer results. The application never fills the gap with invented listings.
- Monthly/nightly/person rates are visible, but selecting a time horizon and booking a rental remain outside this research change. No policy, reservation, payment or purchase is performed.
- Existing local JSON persistence still assumes one API process/replica. Application accounting is approximate and anonymous users can create fresh sessions within layered throttles; the separate provider project is an essential additional safeguard.
