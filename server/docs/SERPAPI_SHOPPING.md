# SerpApi Google Shopping integration

## Scope and contracts

Contract 1.11.0 is additive. Google Shopping is the preferred configured structured provider for supported consumer goods in FI, DE, GB, US, FR, IT, ES, CA and AU. Existing eBay, explicit Web Research, services, housing, transport and insurance paths remain available. No scraper or second AI system was added.

Official contracts checked: [Google Shopping](https://serpapi.com/google-shopping-api), [shopping results](https://serpapi.com/shopping-results), [countries](https://serpapi.com/google-shopping-countries), [account status](https://serpapi.com/account-api).

`SerpApiShoppingProvider` performs one bounded GET to the fixed `https://serpapi.com/search` endpoint with `engine=google_shopping`, actual `q`, country-specific `gl` and `hl`. Optional city localization is context, not evidence of seller location or delivery. `max_price` is used only when requested currency matches the selected country's normal currency; all results are still validated locally. Explicit cheapest-first uses `sort_by=1`. No forced cache bypass, pagination, detail requests, retries, OpenAI extraction, generated images or automatic Web fallback.

`getProductDetails` is explicitly unsupported. Missing credentials are disclosed through capabilities and explicit SerpApi selection; legacy automatic requests may retain their existing Web path when no structured provider is configured. A failed configured provider never invokes another paid provider automatically.

## Fields and evidence

The existing pure Product Extractor maps `title`, `product_id`, `product_link`/`link`, `price`, `extracted_price`, `source`, `thumbnail`/`thumbnails`, `delivery` and `second_hand_condition` when present. It retains original currency, retrieval time, field paths and provider provenance. Finnish decimal notation is normalized to integer minor units. Displayed and extracted prices must agree when both exist. Unsupported/ambiguous currencies, installment/range amounts and conflicting prices remain unknown. Alternative converted prices are not used.

Condition is accepted only from explicit source text, never query/merchant name. Search country does not establish locality, availability or delivery. Known wrong category/price/condition is rejected; missing hard evidence produces potential matches. Merchant aggregations without a named merchant remain potential. The official `multiple_sources` flag means other sellers exist; it does not erase a named source/price pair. Repeated Google product/merchant/title identities are collapsed independently of changing headline-offer links; conflicting prices remain potential with explicit evidence warnings. Optional null fields remain unknown rather than erasing the whole product. Unknown shipping stays `null`, not zero; only unconditional source-reported free delivery becomes zero. Shipping, taxes and eligibility require source review. Google Shopping prices are source-reported, not independently verified merchant prices.

Safe source-associated images use existing lazy-loaded ProductVisual with failure/category fallbacks. Google product links are labelled “View on Google Shopping”; direct retailer links retain their actual host. The backend never fetches these product/image URLs. No browser credential is used.

## Access, quotas and errors

All operations run through existing project ownership, session, CSRF and idempotency protections. `/data/serpapi-usage.sqlite` uses transactional reservations, UTC days, hashed principal IDs, one concurrent request per principal and three globally. Default limits are 5 requests/principal/day and 30 requests/day globally. Dispatched failures count. Limits persist across API restarts. Per-project in-flight deduplication does not share private results between visitors. Saved research is reconciled deterministically when read or used; original cart prices are preserved. Invalid item categories and safe provider search IDs support future diagnostics without raw payloads.

The existing public-provider kill switch blocks anonymous SerpApi dispatch. Admin requests still respect SerpApi daily/concurrency limits. SerpApi usage is separate from OpenAI token/search accounting; zero OpenAI calls are made for structured searches. Provider credits/billing are not equal to application dispatch counts, particularly for provider cache hits. The admin-only `GET /api/admin/product-usage` reports durable counts and configured limits, never secrets.

Timeouts, redirects, invalid JSON, non-JSON, provider errors and payloads over 2 MB fail safely without exposing raw provider errors or credential-bearing URLs. UI retry and explicit “Try Web Research instead (uses AI allowance)” require user clicks. Existing saved data remains usable.

## Backend environment

```
# Backend only, set securely in Railway variables, never commit the value:
SERPAPI_API_KEY=<private value>
SERPAPI_ENABLED=true
SERPAPI_TIMEOUT_MS=15000
SERPAPI_REQUESTS_PER_USER_PER_DAY=5
SERPAPI_GLOBAL_REQUESTS_PER_DAY=30
```

Zero daily limits block dispatch. `SERPAPI_ENABLED=false` disables this adapter. Keep the persistent volume at `/data`; back up/restore `serpapi-usage.sqlite` consistently with sessions/security DB and project JSON. No existing data migration is needed. Do not place the key on web or in Vite variables.

## Cart and scenarios

Existing cart guards accept only eligible same-currency priced offers and prevent duplicate source identity. Source-reported amount/image/provenance are persisted. Explicit replacement preserves cart identity, respects confirmed choices, recalculates budget and supports existing undo. No purchase occurs. Unknown delivery fees are excluded with warnings, never silently assumed zero. No currency conversion is invented. Scenario selection continues to use the existing deterministic engine and actual eligible alternatives, preserving selected/fixed items.

The existing UI Add to plan creates a `selected` planning item, counted in `committedMinor` (not a purchase). Explicit API `status: proposed` counts in `proposedMinor`. Tests cover both conventions.

## Repeatable offline checks

```
npm test --prefix server
npm run typecheck --prefix server
npm run typecheck
npm run build --prefix server
npm run build
npx playwright test -c playwright.research-v2.config.ts tests/research-v2/serpapi.spec.ts
npx playwright test -c playwright.research-v2.config.ts tests/research-v2/furniture.spec.ts tests/research-v2/research.spec.ts
```

Browser groups run with fresh local fixture servers to stay below the actual 8/min research limit; no production limit is disabled. Synthetic provider responses and image bytes are clearly labelled demo. No fixture asserts live provider success. Existing automated tests cover budgets, insurance, scenarios and public security. Live evidence is recorded separately in `serpapi-shopping/`.

## Rollout and rollback

Deploy only to `live-ai-staging`, web before API for additive contracts. Preserve all existing volumes, sessions and OpenAI safeguards. Never deploy to production/mock staging for this task. `serpapi-shopping/before-deployments.json` records successful rollback deployments, and `release-manifest.json` hashes the runtime-only snapshot (no secrets, tests or data).

Before one live search, check backend key presence, absence on web, provider account active/remaining credit, application limits and public kill status. Account API is free per official documentation; print only allowlisted non-identifying account fields. Then execute exactly one application research request: product source `serpapi`, country `FI`, currency `EUR`, searchTerms `sohva`. Record candidates, accepted/potential counts, usable fields, application dispatch delta and provider-account usage before/after. Do not repeat searches to improve counts or invent success.

## Executed verification — 18 October 2026

- **346/346 backend tests passed**, including 19 new SerpApi tests and existing insurance, budget, research, scenario and security coverage.
- **10 browser tests passed:** 2 new SerpApi desktop/mobile tests; 7 existing research/furniture tests; 1 real anonymous CSRF/cart/scenario test. Tests use local synthetic providers, no paid calls. The shared research suite was split across fresh fixture servers to respect the unchanged 8/minute limit.
- Frontend/backend typechecks and production builds passed; `git diff --check` passed.
- Actual Live AI Staging provider test: exactly **one** `sohva`, `gl=fi`, `hl=fi` search. HTTP 200 in **2,009 ms**; provider work **1,567 ms**. SerpApi account usage increased from 0 to 1, leaving 249 of the Free Plan's 250 included searches. No OpenAI calls were made by these checks. No additional monetary charge was observed or independently invoiced.
- The provider returned **40 candidate rows**. Initial extraction accepted 17 before result limits, rejected 22 malformed rows and one category mismatch, and displayed 15. The live test exposed repeating Google product IDs with changing headline-offer links and contradictory prices. Saved results were subsequently reconciled deterministically: **10 unique displayed products — 6 supported matches and 4 potential leads**. There were no additional searches or provider charges for that reconciliation. Some accepted rows were outside the original result cap; counts are not a claim that all 40 rows became visible matches.
- Genuine source-reported examples: IKEA SALTMYRAN **EUR 249**, IKEA EKTORP **EUR 379**, IKEA VIMLE **EUR 1,249**. JYSK HELLERUP appeared with contradictory EUR 600/EUR 899 values and remains a **potential lead**. These are Google Shopping reports at the saved retrieval time, not independently checked live merchant offers. All 10 displayed photos loaded and all 10 Google destinations were labelled correctly. Desktop and mobile browser checks found no horizontal overflow.
- The test was a broad Finland sofa query, not proof of local used sofas under EUR 200. Used-only, currency mismatches and location restrictions were covered by deterministic mock tests.
- An eligible IKEA EUR 249 item was added as a proposed expense through the real API, reloaded, rejected as a duplicate (409), then removed. Shipping stayed unknown. Original EUR 2,000 budget totals and empty cart were restored. The first cleanup harness compared full budget objects and encountered an existing zero-allocation category added by cart logic; follow-up verified actual financial totals explicitly. This was a harness comparison issue, not a lost expense or failed search.
- A separate actual browser check exposed the non-JSON DELETE bug. The frontend fix was tested against a real anonymous CSRF boundary. Browser access to the shared staging demo used an existing authorized administrator session; anonymous cross-user denial was tested separately. Do not describe that particular live browser session as anonymous.
- **8 remote security checks passed**: another visitor cannot read/research/message/change cart/read protection for this project, cannot read admin provider counts, cannot omit CSRF, and receives an empty private project list. Rejected calls did not increment the durable SerpApi counter. The counter remained 1 across API restart. Existing OpenAI quotas, USD 3 daily application budgets and kill switch remain enabled.

### Remaining limits

The exact causes of the original 22 invalid provider rows could not be established from normalized stored fields alone. Nullable optional metadata is now handled safely and diagnostic rejection categories were added, but that adjustment was **not retested with a second live search**. The one-search bound was preserved. No current stock, used condition, Turku-local seller, delivery eligibility or final shipping cost was independently established for this broad query. Google links may require selecting a merchant. Prices and photos can become stale.

The demonstration workspace's existing allocations and unknown convenience evidence can legitimately produce identical scenario totals (EUR 2,049 while the EUR 249 proposed sofa was included). No artificial scenario differences were introduced. Existing mocked scenarios with genuine alternative evidence still pass. No insurance product, coverage or price is inferred from shopping results.

### Demo walkthrough

1. Open https://web-live-ai-staging.up.railway.app/app with your own session.
2. Open the existing moving workspace or create a fictional move with furniture needs (creation uses the ordinary AI allowance).
3. In Product research choose **Google Shopping · SerpApi**, **Finland**, **EUR**, type **sohva**, and click **Research** once. Each new research request consumes the separate provider allowance. Saved demo results need no new search.
4. Inspect source-reported photos, price, merchant and the **View on Google Shopping** link. Expand evidence/missing details; conflicting prices remain potential and cannot enter the budget.
5. Add an eligible product, inspect the plan/budget, reload and verify persistence. No purchase occurs. Unknown shipping is not a zero-cost promise.
6. Remove the test item. The fixed public client sends a JSON DELETE with the existing CSRF credential. Saved workspaces remain usable without more AI allowance.

See `serpapi-shopping/live-evaluation.json`, `live-ui-cart.json`, `browser-verification.json`, the screenshots, deployment snapshots and rollback notes. No production or mock-staging deployment/configuration/data was modified.

**Rollback:** new SerpApi records use an additive provider enum that pre-SerpApi releases cannot parse. Prefer disabling `SERPAPI_ENABLED` on current staging code, or use the contract-compatible rollback pair documented in `rollback.json`; preserve the SQLite files and all project data. Do not roll back to pre-SerpApi code and delete new research to make it load. No branch switch, merge, push or production deployment was performed.

Additional public browser regression:

```
npx playwright test -c playwright.serpapi-access.config.ts
```

## Final staging release

- App: **https://web-live-ai-staging.up.railway.app/app**
- API: `85580f46-758e-4cd1-8d1e-8d8dddbfc5a8` — SUCCESS.
- Web: `1955d554-dcdb-4de2-9f21-069a2a672aff` — SUCCESS.
- The actual staging browser successfully added the EUR 249 item, restored it after reload, and removed it after the JSON request fix. No alert remained; cart and committed/proposed totals returned to zero. No additional shopping search was run.
- Production and public-access/mock-staging deployment IDs match the pre-task snapshot. Environment secrets and production data were not changed by this implementation. The staging key was supplied by the user and remained backend-only.

## Files changed for this integration

| File | Change |
| --- | --- |
| `.env.example` | Private SerpApi configuration and separate daily limits |
| `shared/contracts/products.ts` | Additive SerpApi source/provider/diagnostic enum values and link destination |
| `shared/contracts/index.ts` | Contract version 1.11.0 |
| `server/src/config.ts` | Backend-only key, enable flag, timeout and quota configuration |
| `server/src/app.ts` | Register provider, persistent limiter, safe admin-only usage endpoint, close DB |
| `server/src/products/serpapi.ts` | Fixed-endpoint, bounded provider adapter, errors and safe diagnostics |
| `server/src/products/extractor.ts` | Pure source-field extraction, exact money, safe images and optional unknowns |
| `server/src/products/router.ts` | Prefer configured SerpApi for goods; preserve existing explicit sources and nonproduct research |
| `server/src/products/limits.ts` | Read-only usage status for durable existing SQLite reservation mechanism |
| `server/src/products/reconcile.ts` | Stable Google identity, duplicate suppression, conflicting price handling and saved-result compatibility |
| `server/src/service.ts` | Shared reconciliation on reads/selection; duplicate cart identity across Google URL changes |
| `src/features/widgets/research/ResearchCatalog.tsx` | Provider choice, explicit paid-Web fallback and accurate provider labels |
| `src/features/widgets/research/OfferCard.tsx` | Source-reported labels and honest Google link destination |
| `src/api/live.ts` | JSON request bodies for bodyless state-changing public operations |
| `server/scripts/research-v2-ui-fixture.ts` | Explicitly fictional local SerpApi browser data, no provider calls |
| `server/tests/serpapi.test.ts` | 19 adapter/extraction/financial/security/quota regression tests |
| `tests/research-v2/serpapi.spec.ts` | Desktop/mobile product image, link, selection and reload tests |
| `playwright.serpapi-access.config.ts` | Isolated anonymous-session fixture with real CSRF checks |
| `tests/serpapi-access/cart.spec.ts` | Public cart removal/scenario recalculation and unchanged rejection policy |
| `server/docs/FRONTEND_HANDOFF.md` | Contract and request behavior integration notes |
| `server/docs/SERPAPI_SHOPPING.md` | Setup, implementation, limits, verification and demo report |
| `server/docs/serpapi-shopping/*` | Safe live/test/deployment evidence, release hashes, rollback notes and screenshots |

Existing unrelated changes in the worktree were retained. Test runs also regenerate the existing research fixture screenshot artifacts. No new dependencies were introduced.
