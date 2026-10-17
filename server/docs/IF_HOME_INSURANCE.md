# If home insurance in the Moving Workspace

Implemented on 2026-10-17. Contract **1.3.0**, additive and backward compatible with existing project files. No insurance purchase, policy activation, travel/car insurance, or automatic quote requests.

## Verified official documentation

- Product: https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland
- Documentation: https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland/documentation
- Public OpenAPI downloads are archived verbatim in `if/quote-fi.openapi.json` and `if/coverage-fi.openapi.json` beside this file. These are source specifications, not example responses used by the application.
- Quote: `POST https://api.if-insurance.com/request-quote-householder-insurance-fi/v1/quotes`, OAuth scope `householder.quote.fi`.
- Coverage descriptions: `GET https://api.if-insurance.com/list-coverage-items-householder-insurance-fi/v1/coverage-items`, scope `householder.listcoverage.fi`.
- Sandbox: insert `/test/` immediately after the API hostname. Sandbox responses are always labelled test data and cannot be added as real proposed expenses.
- OAuth client credentials: production token endpoint `https://auth.if.eu/oauth/v2/oauth-token`; sandbox `https://authtest.if.eu/oauth/v2/oauth-token`. Form fields: `grant_type=client_credentials`, `client_id`, `client_secret`, `scope`. Send the resulting bearer token to the APIs.

The public portal's initial HTML shows a specification validation error. Its actual public export operation works: POST `/api/products/VIEW-bee4210d-53d6-4e6e-b75e-4563514c7667/apis/{apiName}/export` with `apiId`, `format: openapi+json-link`, `authenticationMethod: ClientCredentials`, `isEventApi: false`, `environmentSuffix: consumertest`. API names are recorded in the portal metadata. This download performs no quote or purchase.

## Access still required from If

Obtain an approved partner application, test credentials and test identities, and authorization for the two scopes above. Obtain production credentials/approval before switching to live. The portal declares subscription approval; configure `IF_SUBSCRIPTION_KEY` only if If provides/requires it for your subscription. The exported operations themselves specify the bearer header, not a mandatory subscription header.

Put configuration in **server/.env**, never `VITE_*` variables:

```dotenv
IF_CLIENT_ID=provided-by-if
IF_CLIENT_SECRET=provided-by-if
IF_ENVIRONMENT=sandbox
IF_TIMEOUT_MS=8000
# IF_SUBSCRIPTION_KEY=only-if-required-by-your-if-subscription
```

Missing/partial credentials produce an explicit unavailable state. The UI still lets a person save home details and reuse the project city and move date. It does not collect an identity number while unavailable. `available` means server credentials are configured, not that If has independently approved them: failed authentication/scope requests return a recoverable access error.

## Exact quote mapping

The user confirms street address, city, insured home's postal code, current policyholder postal code, integer living area (m²), home type (`Apartment`, `RowHouse`, `PairHouse`) and requested start date. `policyHolder.socialSecurityNumber` is transient. Names, contact details, purchase fields and arbitrary coverage choices are not guessed or submitted.

```json
{
  "policyHolder": {"socialSecurityNumber": "TRANSIENT", "postalCode": "00100"},
  "address": {"streetAddress": "USER INPUT", "city": "Turku", "postalCode": "20100"},
  "livingSpace": 45,
  "householderType": "Apartment",
  "startDate": "2027-06-10"
}
```

Normalize If's `amountNet`, `amountGross`, `amountDiscount` EUR decimal values to integer cents. Display net premium, gross amount, discount and original `type` billing label. Only explicit `Monthly`, `Annual`, `Annually`, `Yearly` labels map to a budget interval; unknown labels remain visible but cannot be budgeted. No inference about coverage, taxes, or undocumented fees. Top-level quote prices represent If's selected quote; other coverages are informational and cannot be silently substituted. Coverage descriptions come only from the verified Finnish householder endpoint, matched by identifier. Coverage fetch failure retains the quote with a missing-data warning. Never follow response-provided API links (the official examples themselves contain inconsistent links).

## Additive API / frontend handoff

Only available for projects with `scenarioType: moving`; others return 422.

| Method | `/api/projects/:id` suffix | Request | Response |
|---|---|---|---|
| GET | `/home-insurance` | — | `{status, state}` |
| PATCH | `/home-insurance/details` | partial `HomeInsuranceDetails` | `{project}` |
| POST | `/home-insurance/quote` | `{details, personalIdentityNumber, consent: true}` | `{project}`; `Cache-Control: no-store` |
| POST | `/home-insurance/expense` | `{quoteId, premiumIndex, planningMonths}` | `{project}` |
| DELETE | `/home-insurance/expense` | — | `{project}` |

Shared Zod schemas/types: `shared/contracts/home-insurance.ts`, re-exported by `shared/contracts/index.ts`. Optional `project.homeInsurance` contains safe draft details, normalized quote and proposed expense. `budget.recurringProposedMinor` is the subset of `proposedMinor` from insurance; **do not add it again**. Existing assistant, workspace widget types, cart and project PATCH formats are unchanged. The React section appears only on moving projects, uses the existing design tokens/components, and uses normal API adapters/cache writes. Demo mode cannot manufacture an If quote.

## Recurring budget treatment

Users choose a planning horizon from 1–36 months (UI presets 1/3/6/12/24/36). Monthly: premium × months. Annual: premium × ceil(months/12); a one-month plan includes a full annual installment, never an invented one-twelfth bill. Annual equivalent is separately labelled. Later renewals outside the horizon are excluded explicitly.

The expense is always `proposed`. It adds to the `home_insurance` category and overall proposed total, reduces available funds, preserves allocations/confirmed spending and participates once in scenario calculations. No cart entry or purchase is created. Duplicate insertion, expired quotes, sandbox quotes, unknown periods, stale concurrent writes and replacing details while an expense is proposed are blocked. Remove the expense before replacing its quote/home details. User allocations remain under user control; a zero allocation produces an over-allocation warning until reviewed.

## Privacy / reliability

The identity input is uncontrolled, cleared at submission, never passed as React Query mutation variables, never persisted in project/browser state, never sent to the AI. Safe project details and normalized quote data persist; raw insurer responses and upstream quote IDs do not. General project/chat/research inputs containing a Finnish identity-number pattern are rejected before persistence or model calls. Provider error bodies are discarded without relay/logging. Request bodies and auth headers are redacted from server logs. Quotes with an echoed submitted identity number are rejected before persistence. Fixed allowlisted URLs, redirects disabled, response size limits, bounded timeouts and per-route rate limits apply. Rendering uses text, never insurer-provided HTML. The quote API is isolated from assistant actions.

## Verification

```sh
npm --prefix server test
npm --prefix server run build
npm run build
npm run test:ui
```

The integration has deterministic mocked insurer tests, including real TCP API workflow + local file reload. Browser checks cover the real unavailable backend, safe detail persistence, moving-only visibility, desktop/mobile sizing, explicit quote requests and displaying a proposed recurring expense. Mocked prices exist only in test fixtures, never app/demo code. A live personal quote has **not** been obtained: approved If credentials were not available. Test against If's sandbox with its supplied identities before enabling production.

Integration regressions also verify that Enter while editing a home field does not implicitly request a quote, and that a saved annual billing choice remains selected after reload. Long proposal buttons wrap on small screens.
