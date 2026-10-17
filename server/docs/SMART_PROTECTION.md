# If Smart Protection Engine

## Repository audit and integration

The existing stack is React 19 / TypeScript / React Router / Zustand / TanStack Query / Tailwind on the frontend and Fastify / Zod / OpenAI Responses on the backend. Projects use an atomic local JSON repository (or memory for tests). Monetary amounts are integer EUR cents. Onboarding uses the existing scenario profile and AI planner; the assistant has a validated, confirmable action registry. There is no frontend translation framework: existing UI copy is English; project locale remains en/fi. No new app, database or library was introduced.

The earlier Home integration is preserved: same form, provider, canonical `project.homeInsurance`, routes and budget expense. It is projected into recommendations and My Protection without duplicating quotes. The independently developed Finnish Car provider in the main checkout was reused as `if-car-insurance.ts`; Smart Protection's `car-insurance.ts` is an adapter, not a second HTTP implementation. Its exact public OpenAPI is archived in `if/car-fi.openapi.json`.

Active, uncommitted Car/Travel/research changes were found in the main checkout during implementation. They were not overwritten. This feature's files and interfaces are committed in its own checkout for integration. When merging, use `ProtectionSection` as the car workspace UI instead of rendering the older, transient-only `CarInsuranceSection` alongside it. Preserve the main checkout's unrelated research/image work and its Travel feature. The Smart Protection travel module itself is metadata/review only.

## Architecture / file map

```
existing project creation / updates / assistant
  → ProjectService.derive()
  → deterministic protection registry + fingerprints
  → project.protection (one canonical state)
  → workspace ProtectionSection / My Protection / assistant summary

explicit request button
  → validated ProjectService.carQuote()
  → shared car gateway
  → IfCarProvider OR explicit fictional Demo provider
  → validated, normalized, persisted options
  → explicit budget-link action
  → existing finance engine / scenarios
```

- `shared/contracts/protection.ts`: recommendation, draft, quote, source, price, option and budget link schemas.
- `server/src/protection.ts`: product registry, relevance rules, dismissal/progress, fingerprints, invalidation, quote summaries and budget link calculations.
- `server/src/car-insurance.ts`: gateway adapter and fixed fictional demo options.
- `server/src/if-car-insurance.ts`: reused real Finnish provider; no purchase operation.
- `server/src/service.ts`: orchestration, persistence, Home projection, explicit quote/budget writes and assistant actions.
- `server/src/finance.ts`: proposals, available funds, recurring costs and scenario provenance.
- `src/features/workspace/ProtectionSection.tsx`: compact contextual cards, Car form and result/expense flow; hosts the existing Home form.
- `src/features/pages/MyProtection.tsx`: shared project query cache and records across known workspaces.
- `src/features/assistant/ActionCard.tsx`: validated actions navigate to the shared workflow/overview after confirmation.
- `server/tests/protection.test.ts`, `server/tests/if-car-insurance.test.ts`, `tests/ui/protection.spec.ts`: deterministic unit, HTTP, persistence, provider and browser verification.

## Deterministic relevance and state

Moving → Home FI, car purchase → Car FI, travel → Travel FI review metadata. No other products are invented. IDs are stable per workspace/product. States distinguish suggested, dismissed, in progress, available/unavailable/expired quote, reviewed and self-reported insurance. Dismissal survives reload and unrelated edits. Material changes reopen a review. Completed checklist tasks are never treated as proof of a policy. Existing insurance is never assumed absent.

`project.protection.car` contains the safe draft, last ten normalized prices and one budget link. Fingerprints include the vehicle planning context and rating inputs, with stable key ordering; they contain no identity number. Edits mark historical prices stale and retain linked expenses with `needsReview`. No typing triggers a provider call. Replacement of an existing expense requires explicit confirmation. Car API responses supply no expiry/reference: these are not invented.

The existing Home quote gains an optional fingerprint. Older stored quotes remain readable. Changing insured-home inputs or relevant project location/move date requires review. Existing Home quote/budget links are retained; unknown policy status remains unknown.

## Verified Finnish API contract

Official sources:

- [Car product](https://developer.if-insurance.com/apis/mobility/car-insurance-apis-finland)
- [Car documentation](https://developer.if-insurance.com/apis/mobility/car-insurance-apis-finland/documentation)
- [Home documentation](https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland/documentation)
- [Travel documentation](https://developer.if-insurance.com/apis/person/travel-insurance-apis-finland/documentation)

Car v1's own exported OpenAPI verifies:

- `POST https://api.if-insurance.com/request-price-car-insurance-fi/v1/prices/` (sandbox adds `/test/`).
- OAuth client credentials, scope **`car.price`**, token endpoints `https://auth.if.eu/oauth/v2/oauth-token` and `https://authtest.if.eu/oauth/v2/oauth-token`.
- Envelope `priceCarInsuranceFI.request` with `registrationNumberFI`, transient `socialSecurityNumberFI`, `driverBelow24YearsOfAge`, and exact documented mileage tiers 5000/10000/15000/20000/25000/30000/40000/50000/50001 (strings).
- Address/postcode may be needed when the customer cannot be found. HTTP **206** explicitly requests these details; it is not success pricing. Optional vehicle price is EUR major units. No make/model/year or purchase date is sent as an undocumented rating field.
- The exported schema omits formal required arrays. The app defensively requires registration, age-group confirmation and mileage, plus explicit consent and the dedicated identity field for live calls. It never guesses these factors.
- `Authorization` is required; optional documented client/partner headers are supported by the reused provider. No undocumented header value is invented.
- HTTP 200 still requires business `returnCode: 000`; error text is not relayed. Returned MTPL/casco amounts, periods and deductibles are normalized. For a casco choice, matching-period returned MTPL-with-casco and casco components are summed. Optional add-ons are not silently included. Coverage IDs, options and deductibles are not invented or submitted: this endpoint has no request fields for changing them. UI options come from returned values.
- Only explicit `Monthly` / `Yearly` periods support budget conversion. Unknown periods remain visible but cannot be budgeted.

Home retains scopes `householder.quote.fi` and `householder.listcoverage.fi` and its verified existing endpoints. Public Travel metadata lists Request Quote Travel Insurance FI v1 and List Coverage Items Travel Insurance FI v1. This module does not implement a separate Travel price flow or claim live Travel access.

## API / frontend handoff (contract 1.4.0)

All project endpoints inherit the existing access-token, origin, validation and rate-limit policy.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/protection/capabilities` | configured Car access, source environment, demo availability |
| PATCH | `/api/projects/:id/protection` | `{product, status}`: dismiss, reopen, mark reviewed or self-report cover |
| PATCH | `/api/projects/:id/protection/car/draft` | merge safe rating input fields; invalidate old prices |
| POST | `/api/projects/:id/protection/car/quote` | `{mode, draft, ...}`; returns `{project}` |
| POST | `/api/projects/:id/protection/car/expense` | `{quoteId, optionId, priceIndex, planningMonths, replaceExisting}` |
| DELETE | `/api/projects/:id/protection/car/expense` | remove proposal only |

Demo quote input: `mode: demo`, valid draft, optional `demoOutcome: success | error`. It rejects an identity field. Live requires `mode: live`, `consent: true` and transient `personalIdentityNumber`. Source modes are explicit; If errors never fall back to Demo. Existing Home endpoints are unchanged.

Assistant action: `protection_action` with validated `{operation: review | open_quote | saved_quote | budget_impact | overview, product}`. This uses the same project/recommendation services as the UI. It cannot request a provider price or transmit personal information. Prices in assistant replies come exclusively from saved normalized records; fictional prices carry the demo warning. The assistant can explain known monthly impact and open the form for missing data. It does not declare overall affordability when other expenses are unknown.

My Protection uses the existing browser-known project IDs and shared `projectKey` cache. It adds no unrestricted cross-user project listing. The same records are shown in the workspace and overview. Reopening returns to `#protection`.

## Financial semantics

The vehicle purchase envelope and a stated monthly budget are separate canonical fields. The BMW example retains €8,000 as the purchase plan and €1,500 as the monthly budget. Monthly budget answers in chat do not overwrite the one-time project budget.

A Car insurance expense is always **proposed**, with original price, period, quote/option references and provenance. Monthly premiums multiply by the selected month horizon; annual premiums count full installments, `ceil(months / 12)`. Monthly equivalents are rounded to the nearest cent for display and comparison, never treated as an invented monthly bill. The exact original premium is preserved. Future renewals outside the horizon are excluded.

The finance engine includes insurance once in proposed spending and available funds. It preserves unrelated categories, allocations, cart selections and committed spending. Demo scenario costs remain estimated; live returned costs can be quoted costs. Stale linked costs remain estimates requiring review. `budget.recurringProposedMinor` is a subset of `proposedMinor`, not another amount to add.

## Demo / environment / access

No If or OpenAI credentials are needed for the local demonstration:

```sh
# Terminal 1, repository root
AI_MODE=local RESEARCH_MODE=unavailable npm --prefix server run dev
# Terminal 2
npm run dev -- --host 127.0.0.1
```

Frontend Settings → API data (the real local backend); inside the car panel choose **Demo — fictional sample prices**. The old frontend-only mock adapter remains a separate labelled moving demonstration; it does not implement another insurance engine.

Fixed fictional examples: Demo Basic €45/month or €540/year; Demo Extended €75/month or €900/year. Every quote/overview/assistant/budget path labels them fictional. These are demo values, not If pricing formulas. Select “Simulated provider error” to show recovery. No demo fixture contains a personal identity number.

For real/sandbox access, server `.env` only: `IF_CLIENT_ID`, `IF_CLIENT_SECRET`, `IF_ENVIRONMENT=sandbox|live`, optional `IF_SUBSCRIPTION_KEY`, optional `IF_PARTNER_ID`, and `IF_TIMEOUT_MS` (8000 default). The partner client must be granted **car.price**; listing an API publicly does not grant access. Home scopes remain separate. Existing `API_TOKEN` is required when binding beyond loopback. No `VITE_*` secret configuration is used.

No approved credentials were available, so no genuine If Car price was obtained. The live adapter is specification-backed and tested with mocked responses; it still needs If sandbox verification with If-supplied identities and partner onboarding before production. No purchases, payments, policy activation or official partnership claims are implemented.

## Privacy / limitations

Identity inputs are uncontrolled, cleared on submission, absent from mutation variables, project persistence and browser storage, and rejected from general AI/project inputs. Provider error bodies are discarded. Auth headers and request bodies are redacted. Normalized responses are checked for echoed identity. Fixed provider hosts, no redirects, bounded timeouts and response sizes, validation and rate limits apply. Live failure does not mutate prior quotes/budgets or fabricate a successful result; safe entered answers are retained.

The inherited authorization model is a single-user/local or shared-token demo, not per-user production workspace ACLs. My Protection shows projects known to this browser, not a verified If account or all projects on the server. Unknown policy status is never proof of absence. The UI is English, consistent with the existing app. Travel is metadata-only in this engine. Parent checkout's active additional work requires a careful merge after it is saved; this checkout does not overwrite it.

## Verification and demo walkthrough

```sh
npm --prefix server test
npm --prefix server run build
npm run typecheck
npm run build
npm run test:ui
```

There is no configured lint command. Tests mock the insurer; API workflows also use real local TCP and a fresh file repository. Browser flows cover recommendation dismissal/reopening via chat, missing fields, fictional source labels, successful/error demo, alternatives, budget, reload, overview and invalidation. Existing moving/travel/car onboarding, assistant input, Edit Details, Home insurance and research/cart workflows remain covered.

1. Create: “I'm planning to buy a 2018 BMW 320d for €8,000. My monthly budget is €1,500.”
2. Show Car workspace → “Check insurance for your new car”. Click “Get an If insurance price”.
3. Keep Demo selected. Enter fictional `DEMO-001`, explicitly answer the under-24 driver question and select annual mileage.
4. Click “Request demo price”. Show the prominent fictional label, returned alternatives and billing periods.
5. Choose a sample option and horizon. Add it to the ownership budget. Show proposed cost, monthly equivalent and remaining monthly funds before other expenses.
6. Open **My Protection** in navigation. The same quote and expense appear; reload to demonstrate persistence.
7. Return to the workspace, change registration and save. Old prices become stale; the old expense stays flagged for review. Request a new demo and confirm replacement explicitly.
8. Optionally ask “How much would insurance cost for this car?” or “Can I afford insurance?” in chat; it reads the same saved records and offers a validated action to the same form.
