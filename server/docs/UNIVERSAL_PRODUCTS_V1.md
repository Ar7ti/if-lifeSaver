# Universal Product Research Engine v1

## Delivery status

**Implemented and verified against official API contracts and synthetic network fixtures. Live eBay verification is BLOCKED:** neither the local environment nor the live-ai-staging API has eBay client credentials or access approval configured. No OAuth, Browse or paid OpenAI test call was sent to an external provider in this task. No Railway deployment, variable, volume or production data was changed.

This is a functional integration boundary and local end-to-end vertical slice, not evidence of improved live listing retrieval. The previous web-search sofa failure remains the real-world baseline; fixture products below are not internet discoveries.

## 1. Architecture and reused services

The existing `/api/projects/:projectId/research` and confirmed assistant research actions now pass through:

`Structured request → Source Router → eligible ProductProvider → deterministic Product Extractor → existing Offer → v2 evidence/eligibility presentation → existing cards/cart/scenarios`.

`SearchProvider`, `ProjectService`, repository revisions, private-session ownership, CSRF, action confirmation, cart replacement/undo, scenario calculations, image validation/lazy loading, and the existing web-search provider are reused. There is one persisted offer array and one cart, not a second shopping application or chatbot.

The router accepts injected provider adapters through a small typed interface. Provider registration declares country/category support and access state. V1's only implemented commerce adapter is eBay; registry entries for Tori, Etsy and authorized Shopify stores are nonoperational future/discovery metadata. No access or integrations are invented for them. Adding a provider requires a verified contract, adapter/normalizer, explicit source metadata and registration. The v1 concrete marketplace defaults and reporting focus on eBay; broader aggregation beyond the first eligible provider is future work.

## 2. Official contract verification

The official eBay Browse OpenAPI document was retrieved successfully from:

https://developer.ebay.com/api-docs/master/buy/browse/openapi/3/buy_browse_v1_oas3.json

It identifies Browse **v1.20.4** and verifies:

- `GET https://api.ebay.com/buy/browse/v1/item_summary/search`.
- `GET https://api.ebay.com/buy/browse/v1/item/{item_id}`.
- Application access token scope `https://api.ebay.com/oauth/api_scope`.
- Marketplace header `X-EBAY-C-MARKETPLACE-ID`, bounded `limit`, `q` (100 characters), optional category IDs and documented filters.
- Response fields including item ID/title, fixed-price amount/currency, condition ID, seller username, item location, images, shipping options and estimated availability.

The operation/parameter inventory, document version and SHA-256 are recorded in [products/verified-ebay-contract.json](products/verified-ebay-contract.json). The full external specification is not copied into application code.

Primary references:

- [Browse guide](https://developer.ebay.com/api-docs/buy/static/api-browse.html).
- [Client Credentials authorization](https://developer.ebay.com/develop/guides/sell/authorization).
- [Buy requirements and production approval](https://developer.ebay.com/api-docs/buy/buy-requirements.html).
- [Marketplace support](https://developer.ebay.com/api-docs/buy/static/ref-marketplace-supported.html).
- [Documented filters](https://developer.ebay.com/api-docs/buy/static/ref-buy-browse-filters.html).
- [Default API limits](https://developer.ebay.com/develop/api/buy/api_call_limits).

The public documentation states production Buy access requires relevant approval/agreements. A successful token is not proof of Browse permission. Default documented Browse allowance is 5,000 calls/day for this search/details group and Client Credentials token allowance is 1,000/day; actual account limits and commercial terms must be checked separately. V1's local limits are lower. Sorting/display requirements vary by approved business model: the adapter preserves eBay Best Match order and does not send a `sort` parameter or enable local price sorting of its catalog. This application performs no eBay guest checkout, purchase or affiliate-commission claim. The operator must review the actual approved display, attribution, retention and fee terms before activation; documentation review is not legal or partner approval.

## 3. eBay adapter and authentication

Server-side OAuth uses Basic client credentials and form-encoded `grant_type=client_credentials` plus the verified scope at:

- Production: `https://api.ebay.com/identity/v1/oauth2/token`.
- Sandbox: `https://api.sandbox.ebay.com/identity/v1/oauth2/token`.

The in-process token cache follows returned `expires_in`, renews before expiry, and shares an in-flight token acquisition. It does not fetch a token for every search. A 401 clears the token; the next explicit request can reacquire it. There are no automatic API retry loops. A 403 is a safe permission error and marks the provider as requiring approval until configuration/restart. A 429 installs a bounded cooldown from Retry-After. Raw provider errors, credentials and tokens are never returned or logged.

Search always requests documented `buyingOptions:{FIXED_PRICE}` and `deliveryCountry`. Price ceilings use `price` plus `priceCurrency`; new/used filters use documented `conditions:{NEW|USED}`. Refurbished condition IDs are validated from returned records; no category-specific refurbished filter is guessed. Category IDs are caller-supplied numeric IDs, not invented taxonomy values. Postal context, if explicitly provided, uses the documented encoded end-user context header. Product detail IDs are constrained and URL-encoded; returned detail identity must match the requested ID. Details retrieval is an internal interface, not an arbitrary public URL proxy or an automatic extra request for each result.

## 4. Countries, categories and currency

Configured marketplaces: **DE, GB, US, FR, IT, ES, CA, AU**. Finland has no eBay FI marketplace in the verified support table, so a Finland structured search is unavailable, never implicitly US-only. Other official eBay marketplaces can be added after explicit configuration/validation; this release does not claim every country. Vehicle purchases and insurance are excluded from this first eBay adapter; their existing web/If flows remain available.

Explicit `country` overrides provider routing; otherwise the router recognizes country names from saved/request location. It does not geocode a city or infer shipping from seller country. For accepted eBay search records, delivery-country evidence is specifically the documented API filter, not an independent delivery guarantee. Local-only searches still check actual seller locality. Missing shipping is null, not free; calculated shipping is accepted only with matching country/postal context. Known subtotal is item price plus a reported matching-currency shipping option, never an all-inclusive total. VAT wording is conditional, and unreported taxes/import/other charges remain unknown.

Offers preserve **EUR, GBP, USD, CAD, AUD, CHF, PLN or JPY**, or null when currency is unknown. Money parsing uses decimal strings and integer arithmetic; JPY has zero fractional digits. When eBay supplies `convertedFromCurrency`/`convertedFromValue`, the original listing currency and amount remain authoritative. Its display conversion is retained separately for reference and is not used in planning without a sourced FX rate/date. Incomplete original conversion fields leave the amount unknown. The supported current marketplace defaults use EUR/GBP/USD/CAD/AUD. **Workspace/cart budgets remain EUR.** Foreign-currency offers render their original amount but are excluded from cart, replacement and scenario finances without a sourced FX conversion. No FX provider or fictional rate was introduced. A same-currency ceiling can support an offer without making it comparable to the EUR workspace budget.

## 5. Product extraction and provenance

`ProductRecord` is a transient normalized extraction interface. Persisted results remain existing Offers with optional `product` metadata for provider ID, source product ID, requested marketplace, retrieval method/mode, additional source images, attributes, original price where returned, shipping class, tax disclosure, known subtotal and field provenance.

Implemented pure extractors:

1. eBay JSON responses, validated against selected fields of the official contract.
2. Supplied Schema.org Product/Offer JSON and JSON-LD, including graph containers and product-associated images.
3. Supplied product-specific Open Graph metadata requiring `og:type=product`, a retailer item ID and matching page URL. Ordinary website banners/logos are not treated as product images.

The metadata functions require explicit caller permission and have byte/depth/item bounds. They accept already-authorized content; they do not fetch webpages, run scripts, follow redirects, read browser cookies or expose a frontend-supplied fetch URL. AggregateOffer lowPrice, subscription-like price specifications, missing currencies and unsupported decimal representations do not become exact purchase amounts.

External HTTP is restricted to hard-coded eBay production/sandbox hosts. Redirects are rejected, responses require JSON and are streamed under a 1 MiB bound, and each request has a finite timeout. Product/source/image URLs are validated separately. There is **no arbitrary fetch/SSRF surface**, DNS-rebinding-prone user-selected fetch host, stealth scraper, CAPTCHA bypass or source HTML parser. DNS pinning for arbitrary webpages is not implemented because arbitrary page fetching is not supported.

Source images stay associated with their item. Unsafe/broken images fall back through the existing labeled category illustration; lazy loading and no-referrer behavior remain. API field evidence means provider-reported, not independently verified seller truth/current inventory. Search results do not imply actual stock; explicit ended/out-of-stock or for-parts records are rejected.

## 6. Supported, potential and rejected results

Existing v2 groupings are reused:

- Supported: explicit applicable category, condition, price/currency ceiling and delivery-country evidence.
- Potential: a source-backed product has unknown required condition, price, currency or delivery eligibility.
- Rejected: unsafe/invalid identity, wrong category, known condition/price/locality violation, auction-only price, for-parts/unavailable item, duplicate or dismissed source.

Electronic-device relevance excludes accessories when the requested category is a main phone/laptop. Main product-family aliases are deterministic; no LLM invents relevance. Deduplication uses provider product ID and canonical source URL, not fuzzy merging of similar separate products. Source order is preserved. Malformed provider records are counted but not padded with generated products.

Missing credentials, missing approval, unsupported region, provider failure, timeout, empty result and incomplete evidence are distinct states. Existing requests continue on the old web path when no active applicable structured provider exists. An explicit eBay/API request returns an honest blocked result/error. **An API failure never automatically launches paid web research.** The user can choose “Try Web research instead”; non-EUR web research is unavailable because the old web extractor remains EUR-specific.

## 7. Shopping, budgets, scenarios and AI

Existing product cards show provider mode/source, original price/currency, separate shipping, incomplete subtotal, images, evidence and missing details. No new dashboard or unrelated styling was introduced. eBay catalog sorting is disabled pending partner permission; side-by-side comparisons do not identify a cheapest option across different currencies. Existing cards without new metadata continue to work.

Selecting a supported EUR result uses the existing confirmed cart action. Cart metadata retains provider provenance. Repeated research of the same provider product cannot create duplicate expenses. A new source price does not overwrite the saved cart price; explicit replacement/undo is available. Unknown-price/potential/foreign offers are blocked server-side, not merely by disabled buttons. Multi-unit API items require a separate shipping review rather than multiplying a one-item shipping quote silently.

The existing scenario engine receives only eligible, same-currency candidates and keeps confirmed/fixed expenses. Economy/Comfort differences depend on actual known prices and delivery evidence; the adapter invents no assembly, quality or effort scores. Identical viable strategies remain honestly explained. Scenario application and replacement continue using existing revisions and confirmations.

The same structured assistant research commands reach the router. Country, source and currency constraints are retained in contextual follow-ups. Explicit phone/laptop requests take precedence over a broad furniture tab; electronics spend maps into an existing appropriate envelope where present. A country-wide seller-location requirement matches the provider country code without inventing a city. Cheaper-price ceilings use only same-currency records, never EUR cart amounts mixed with GBP offers. Compact AI context includes provider/retrieval method, currency, result state and missing evidence. The model cannot supply an API price or bypass server-owned workspace authorization, provider access gates or quotas. Web research still passes through the existing paid-provider boundary.

## 8. Security, quota and cost boundaries

Default is disabled. Activation requires credentials plus explicit permissions and **no-per-call-fee** attestations. V1 does not support paid product-provider tariffs: if the account has per-call fees, do not enable it until monetary reservation accounting for that tariff is implemented. A configuration attestation is not automatic proof of account permissions or license compliance.

Actual OAuth/search/details dispatches use a separate durable SQLite allowance at `<DATA_DIR>/product-usage.sqlite`: default **20 requests/principal/UTC day**, **100 requests/application/UTC day**, one pending request per principal and three globally. Failed dispatched requests count. Limits survive restart; completed product response caches are not shared across visitors. OAuth token caching is server-wide but contains no user search context. Identical in-flight searches are deduplicated per project; a different project never receives its private cached results. No completed search cache is enabled before provider retention terms are reviewed.

Free structured API operations consume **zero OpenAI quota and zero OpenAI tokens**. The existing shared external/AI kill switch blocks anonymous eBay dispatch even with a cached token. Administrator access stays separate. Request ownership, CSRF, existing route throttles and idempotency run before provider work. AI daily budgets, reservations, concurrency and legacy isolation were not weakened. Unknown/future paid provider adapters must add cost metering rather than reuse the free adapter's assumption.

Safe network logs record provider, operation, duration, HTTP status and sanitized error category; aggregate research logs include candidate/accepted/rejected counts. OAuth and search are separate network events. `productDiagnostics.apiRequests=1` describes the search operation, not an assertion that no OAuth acquisition occurred. No keys, tokens, cookies, full user prompts or provider payloads are logged.

## 9. Files changed in this task

New:

- `shared/contracts/products.ts`.
- `server/src/products/{types,extractor,ebay,router,limits}.ts`.
- `server/tests/products.test.ts` (31 new backend cases).
- `server/scripts/product-ui-fixture.ts` (explicit local-only synthetic fixture; refuses Railway).
- `playwright.products.config.ts`, `tests/products/products.spec.ts`.
- This report and `server/docs/products/` evidence.

Targeted integration changes:

- `shared/contracts/index.ts`, `shared/contracts/research.ts` (contract **1.10.0**; optional metadata, original/unknown offer currency, request routing fields and explicit provider provenance).
- `server/src/{app,config,service,finance,shopping,ai,research-constraints}.ts`; existing `server/tests/ai.test.ts` fixtures now explicitly specify their required EUR currency (asserted expected prices are unchanged).
- `src/lib/format.ts` and existing research `{ResearchCatalog,OfferCard,CompareDialog,ReplaceItemDialog,tiers}` components/helpers.
- `.env.example`, frontend handoff, and isolated test output configuration in `playwright.research-v2.config.ts`.

Unrelated dirty work and previous deployments were preserved. No branch switch, merge, worktree creation, destructive Git operation or push was performed.

## 10. Old versus new pipeline

| Aspect | Existing web research | Structured provider path |
| --- | --- | --- |
| Discovery | OpenAI hosted search | Authorized eBay Browse search |
| Extraction | Separate paid structured model call | Deterministic validated JSON mapping |
| Price evidence | Cited generated summary | Provider amount and currency fields |
| Images | Only when citation-scoped source evidence exists | Item-associated API image fields |
| Missing fields | v2 supported/potential classification | Same grouping, with direct API provenance |
| AI cost | Search/model/extraction calls, existing metering | Zero OpenAI calls for direct API research |
| Coverage | Search-index accessibility and summary limitations | Configured marketplace, account access and API inventory limitations |
| Locality | Must be stated in cited evidence | Provider seller location plus documented destination filter |
| FX | EUR-only extractor | Original supported currencies; no unsourced conversion |
| Failure | Honest error/limited results | Honest provider state/error; web fallback needs user action |
| Live evidence | Previous sofa run: 63 URLs, one candidate, zero offers | **Blocked**; no credential-backed eBay result yet |

This table describes architectural differences, not a measured live retrieval improvement.

## 11. Configuration and authorized live validation

Backend API service only:

```dotenv
EBAY_ENABLED=false
EBAY_ACCESS_APPROVED=false
EBAY_FREE_API_CONFIRMED=false
EBAY_ENVIRONMENT=sandbox
# EBAY_CLIENT_ID=<enter privately>
# EBAY_CLIENT_SECRET=<enter privately>
EBAY_TIMEOUT_MS=8000
PRODUCT_REQUESTS_PER_DAY=20
GLOBAL_PRODUCT_REQUESTS_PER_DAY=100
```

Do not use VITE variables for credentials. No credentials belong in frontend/browser storage. Keep API secrets and the existing security databases on server/persistent storage. Back up project JSON, `security.sqlite` with its WAL-consistent backup, and `product-usage.sqlite` together. Preserve the one-process deployment assumption.

To unblock **live-ai-staging only**:

1. Obtain a dedicated eBay developer application and check actual Browse permissions, applicable agreements, display/sorting/attribution/retention obligations, fees and account rate limits. Sandbox access alone is not production approval.
2. Enter its matching-environment client ID/secret privately on the staging **api** service. Do not copy production application secrets or put credentials on **web**.
3. Verify no per-call API fee applies; only then set the three enable/approval/free-API flags. If fees apply, leave disabled.
4. Deploy the reviewed **1.10.0** frontend/backend together to isolated staging. This task did not deploy them. Retain the volume, anonymous ownership, CSRF, quotas, rate limits and kill switch.
5. For real listings select `EBAY_ENVIRONMENT=production` only after authorized approval. Sandbox is test inventory and must stay labeled as such.
6. Temporarily allow public external research through the existing admin switch if using an anonymous tester. Do not raise quotas or budgets.
7. In one owned workspace, request a used smartphone, laptop and, if available, furniture in configured marketplaces. Cap each query at three results. Verify actual title, original price/currency, condition, photo URL, source link and country/delivery evidence. Unknown shipping stays unknown. Do not run repeated searches to chase a target result count.
8. Record real network diagnostics and separate provider/OpenAI cost observations. Pause again afterward if desired. No actual eBay success is claimed until this is executed with authorized credentials.

For rollback after future activation, restore the matching project/security/provider-usage backup with the older code: an older EUR-only contract cannot parse new foreign-currency offers. Do not roll back code alone over newly written 1.10 records.

Production and mock staging must remain unchanged. Existing live-ai-staging still runs the prior release until an approved deployment of this code.

## 12. Exact local demo — explicitly synthetic, no credentials

```sh
PRODUCT_UI_FIXTURE=true ./server/node_modules/.bin/tsx server/scripts/product-ui-fixture.ts
LIFE_SIM_API=http://127.0.0.1:3098 npm run dev -- --host 127.0.0.1 --port 5198 --strictPort
```

1. Open http://127.0.0.1:5198/app and create a moving/furnishing workspace with EUR 2,000 and a sofa requirement.
2. In Product research choose **eBay structured API**, **Germany**, **EUR**, and search `sofa` with a EUR 200 ceiling.
3. The real adapter processes **mocked network JSON**, displaying two supported fixture sofas and one potential fixture with missing condition. “Demo data”/“eBay Sandbox” labels remain; these are fictional local test responses, not a real sandbox or live query. Broken fixture photos use the safe category fallback.
4. Select a supported EUR sofa, inspect the budget/cart, compare available scenario choices, replace with a cheaper fixture, undo, and reload. Nothing is purchased.
5. Repeat with **United Kingdom / GBP**: original pound prices display, but adding them to the EUR plan is disabled and rejected server-side.
6. Select **Finland** for a structured query: the coverage limitation is explicit. Only clicking **Try Web research instead** launches the existing fallback (fictional demo provider in this local fixture).

Screenshots in `products/desktop.png` and `products/mobile.png` are actual UI captures of this **synthetic** fixture. They do not prove current real listings.

## 13. Remaining limitations

- No configured eBay credentials/approval; real provider verification and measured listing quality are blocked.
- Eight configured countries, a selected currency set and conservative category support; no universal worldwide coverage promise.
- No permitted Tori/Etsy/Shopify integration, vehicle adapter or FX feed yet. Finland-local second-hand furniture remains a known data-source gap.
- Pure JSON-LD/Open Graph extraction is implemented, but no public webpage-fetching provider exists; permission/retention must be verified for each future source.
- Only the first eligible structured provider is used in v1; cross-provider aggregation/verified cross-list identities are future work.
- Best Match ordering is deliberately retained pending business-model-specific sorting permissions. Model inference is never used to fill missing shipping, taxes, seller type or condition.
- A provider response is not independent seller/availability verification. Prices have a retrieval timestamp and can change; requesting new research does not mutate confirmed amounts. There is no checkout, purchase, payment or automatic commitment.
- API fee confirmation is an operator attestation. Unknown or paid per-call tariffs must remain disabled; no guaranteed provider monetary cap is claimed.

Executed test totals, browser infrastructure notes and current live-access status are recorded in `products/verification.json`. The initial shared Playwright output-directory collision was corrected using isolated temporary output directories; a stable full rerun is required after source edits finish, and no failing checks were disabled.


## 14. Executed checks and actual outcomes

- **302 backend tests passed; zero failures, skips or cancellations.** Includes 31 new product cases and existing AI, public-session, ownership, CSRF, provider-budget, insurance, cart, scenarios and persistence regressions.
- **49 unique browser tests passed:** 38 existing UI + five public-access + three v2 research + three product-provider flows. Product fixtures use mocked eBay-shaped network JSON and explicit demo/sandbox labels. No live listing success is implied.
- Backend/frontend typechecks and builds passed. `git diff --check` passed. Neither package defines a lint command.
- OAuth/token reuse, expiration, access denial, rate limit, bad JSON/content type/size, fixed-host redirect rejection, safe image handling, country/currency constraints, unknown buying format, original-vs-display conversions, deduplication, actual HTTP cart replacement/undo, canonical price preservation and restart persistence were exercised offline.
- Public HTTP checks enforce cross-user 404s and CSRF before product operations; separate durable product quotas, free-vs-OpenAI accounting and the external kill switch are tested.
- Initial browser attempts collided on a shared Playwright artifact directory; output paths were isolated. Source-watch restarts also interrupted early full-suite attempts; the final stable complete suite passed. No existing assertion was disabled. Two historical price-only AI unit stubs now explicitly specify EUR, which is required by their domain contract; the original expected price assertions are unchanged.
- Real eBay OAuth/Browse requests: **0**. Paid OpenAI calls for this task: **0**. Application paid testing spend: **USD 0**. Provider account billing/permissions remain unverified because credentials are absent.
- No Railway deployment/configuration/data changes occurred. The new 1.10.0 feature is local code, not a newly deployed public staging feature.

Evidence: [verification.json](products/verification.json), [access-status.json](products/access-status.json), [verified contract](products/verified-ebay-contract.json), [desktop synthetic UI](products/desktop.png), [mobile synthetic UI](products/mobile.png).

Commands executed:

```sh
npm --prefix server test
npm --prefix server run typecheck
npm --prefix server run build
npm run typecheck
npm run build
npx playwright test --reporter=line --output /tmp/lifesim-products-all-ui-approved
npx playwright test --config playwright.products.config.ts --reporter=line
npx playwright test --config playwright.research-v2.config.ts --reporter=line
# Public browser config remapped to unused 3096/5196 ports to preserve an existing preview:
npx playwright test --config /tmp/if-shopping-public.config.ts --reporter=line
git diff --check
```
