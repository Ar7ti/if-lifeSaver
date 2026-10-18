# Focused Moving Furniture Research — 2026-10-18

## Scope and integration

A small opt-in path in the existing hosted Web Research service, not a marketplace provider or scraper. It applies to moving projects in Finland when IKEA, JYSK or Tori are explicitly selected. Other scenarios and ordinary research retain their existing flow. There are no budget, insurance, scenario-calculation or authentication changes.

The existing assistant proposes the existing confirmed research action. The Research UI also has **Search IKEA, JYSK & Tori**, with explicit user submission. A multi-item request retains sofas, beds and desks instead of being reduced to the first word. Onboarding now recognizes “find affordable sofas” and creates the existing Shopping widget. Owned furniture exclusions remain unchanged.

## Access review and actual browser handoffs

Checked on 2026-10-18. Public browser search and indexed hosted discovery are the only implemented access methods. No authorized structured catalog API or scraping permission was established for these sites. A robots policy does not grant a content-reuse licence.

| Source | Evidence reviewed | Implemented access |
|---|---|---|
| IKEA Finland | [Finnish website terms](https://www.ikea.com/fi/en/customer-service/terms-conditions/terms-and-conditions-of-ikea-online-store-pub3326a480/) and [robots](https://www.ikea.com/robots.txt) | Hosted discovery of Finnish product pages; user handoff to `https://www.ikea.com/fi/fi/search/?q=sohva`. Browser showed Finnish sofa search results. Robots excludes automated query-search crawling; the application does not fetch those pages. |
| JYSK Finland | [Terms](https://jysk.fi/yleiset-ehdot), [robots](https://jysk.fi/robots.txt), public search UI | Hosted discovery; user handoff to `https://jysk.fi/search?query=sohva`. The public search UI generated this URL and showed sofa results. Robots excludes `/search`; no search scraping is implemented. |
| Tori.fi | [Terms](https://tuki.tori.fi/hc/fi/articles/22686757489938-Torin-k%C3%A4ytt%C3%B6ehdot), [robots](https://www.tori.fi/robots.txt), public search | Hosted discovery; user handoff to `https://www.tori.fi/recommerce/forsale/search?q=sohva`. The public search page rendered successfully. No logged-in/private APIs, contact endpoints, numeric location codes or sort parameters are used. |

Access restrictions, missing content or anti-bot responses are not bypassed. Search links are for voluntary browser visits. No raw merchant HTTP fetcher, script execution, image finder, authentication reverse engineering or extraction-specific paid pass was added.

## Source strategy and evidence

- Deterministic English/Finnish vocabulary: sofa/sohva, bed/sänky, desk/työpöytä, chair/tuoli, wardrobe/vaatekaappi, including relevant plural/compound variants.
- Selected source domains are applied through Responses `web_search.filters.allowed_domains`; [official documentation](https://developers.openai.com/api/docs/guides/tools-web-search) confirms this interface. An IKEA-only request stays IKEA-only.
- At most the existing three hosted tool calls, in one discovery response; the existing bounded extraction response follows. No automatic retries or source broadening.
- Three selected stores and three requested item types create nine deterministic **source_search** handoffs. These are not nine found products.
- Native search keywords do not guarantee geographic, condition, delivery or price filtering. Every card says to apply those constraints on the source. Tori receives a city keyword, not an invented geographic filter.
- Only cited same-source passages support listing identity and individual fields. Existing source-scoped price, image and condition evidence rules remain in force. Search and IKEA category pages cannot establish product prices.
- Specific source-backed listings stay in the existing supported/potential groups. Known wrong sources, foreign IKEA markets, unrelated recognized furniture types and hard constraint violations are rejected.
- Missing images use the existing category visual. No generic photograph is represented as a product photo.
- Search handoffs have no amount, image, offer ID or Add to plan action. They cannot enter a cart, budget or comparison.
- A completed search with zero exact listings still returns handoffs and honest source notes. If extraction fails after completed search, the partial result states the failure and makes no automatic retry. Initial search failure remains an understandable API error.

## Contract 1.10.2

`ResearchResult.furnitureSearchLinks?` is an optional array of at most 15 validated objects:

```
{source: "ikea" | "jysk" | "tori", sourceName, item, title, query,
 url: public HTTPS URL, kind: "source_search", notice}
```

Old records remain valid. Offers, cart financial fields, ownership and paid-call boundaries are unchanged. The frontend renders this new field separately from offers and sourceNotes. The assistant receives compact link summaries with explicit instructions that search pages do not prove prices or stock.

## Persistence and safety

The field is persisted inside the existing owner-authorized project research result. Reloads restore it through existing APIs. No new routes or authentication state are introduced. Both existing model calls still use `paidProviderCall`; quota rejection occurs before SDK dispatch. Source links are deterministic local operations, not extra model calls.

## Offline checks executed

- Backend suite: **327 passed**, no failures/skips (includes 16 focused tests plus existing public access, ownership, CSRF, quota, insurance, cart and scenario regressions).
- Backend typecheck and build: passed.
- Frontend typecheck/production build: passed.
- Playwright: **3 passed** — focused desktop, focused mobile/reduced-motion, and existing research-note persistence. These use explicitly synthetic local fixtures, not live shopping evidence.
- Desktop/mobile screenshots: `furniture-research/desktop.png`, `furniture-research/mobile.png`; visually inspected. They show synthetic demo results, not live provider claims.
- Initial browser tests exposed the missing Shopping widget for the exact “Find affordable sofas, beds and desks” creation prompt. Detection was fixed and both tests then passed.

## Live verification

One real research operation was executed on isolated Live AI Staging, reusing the saved fictional Turku moving workspace with its real persisted EUR 2,000 budget. No new workspace-planning or assistant call was made for this furniture test. The administrator allowance was used through the normal durable meter; visitor quotas were not reset or changed. Administrator sign-out was confirmed.

Observed result: **3 hosted web searches, 56 source URLs, 13 cited passages, 11 extracted candidates, 0 supported matches, 2 potential IKEA listings, 9 rejected candidates, 6 retained source notes and 9 separately labelled search-page handoffs**. Rejection categories overlap: 9 not-specific-listing and 3 category mismatches. JYSK supplied relevant category pages; Tori supplied a Turku search page, not an extracted individual listing. Category pages were not promoted into purchasable offers.

The two potential listing references are:

- [SALTMYRAN sofa](https://www.ikea.com/fi/fi/p/saltmyran-2-n-istuttava-sohva-oereryd-harmaanbeige-10596995/)
- [SÖDERHAMN chaise sofa](https://www.ikea.com/fi/fi/p/soederhamn-2-n-istuttava-divaanisohva-kelinge-tummansininen-s79621756/)

These were returned by hosted discovery, not independently inspected product/stock records. Both saved cards correctly retain unknown prices, condition, location, availability and images. The generated cited source notes separately reported Finnish amounts; those notes are not verified quotations. No photos or prices were fabricated to fill the cards.

Duration **67.4 seconds**. Usage **36,843 input tokens, 4,264 output tokens**, 2 metered SDK calls and 3 hosted tool calls. Application estimated cost **USD 0.241332**, including configured search charges. This is not a settled provider invoice or a guaranteed financial hard cap. No repeat live search was made.

The test exposed that Finnish `199,- EUR` notation was rejected by the existing monetary parser. A narrow normalization now parses that zero-cent notation while rejecting ranges; its unit replay passed and the final API patch was deployed. This final parser change was tested offline, not with another paid search. Historical saved unknown prices were not silently rewritten, and missing quote/title evidence can still leave a price unknown.

Project reload confirmed the saved research and all nine handoffs; the entire pre/post budget and cart were unchanged. The real anonymous browser displayed 3 cards, 9 links and 2 potential listings, with no alerts; its existing 5/5 allowance stayed exhausted, proving it was not reset for the test. See `furniture-research/live-desktop.png` (actual live data) versus `desktop.png`/`mobile.png` (labelled synthetic browser fixtures).

Additional zero-paid-call remote checks passed: another visitor receives 404 for this project, assistant and research; cannot access admin status; missing CSRF returns 403; My Projects is empty; rejected requests spend no allowance. The temporary test session was revoked. The full backend suite covers the unchanged budgets, insurance, concurrency and quota paths.

Production and mock-staging deployment IDs were compared before/after and remained unchanged. No production variables, provider credentials or production data were modified. Evidence is in `furniture-research/live-evaluation.json`, `security-checks.json` and `deployment-verification.json`.

**Limitations:** no independently verified live prices, product photos or stock; no qualifying JYSK/Tori individual listings in this single run; source search filters require user review; source access/indexing can change. Broad requests can still produce incomplete results. The fallback is useful browsing guidance, not a promise of purchasable products or insurance coverage.

## Demo steps

1. Open the isolated Live AI Staging app with a visitor session.
2. Create: “I'm moving to Turku with €2,000. Find affordable sofas, beds and desks using IKEA, JYSK and Tori.” Workspace creation itself uses the existing AI allowance.
3. Open Product research, enter “Affordable sofas, beds and desks”, and click **Search IKEA, JYSK & Tori** once. A research operation can use two allowance units (discovery and extraction).
4. Inspect any actual cited listings and missing evidence. Search-page cards stay separate, with no prices or Add to plan action.
5. Open a source link and apply location, condition and delivery filters there. Nothing has been purchased and the budget has not changed.
6. Reload the workspace to restore research and handoffs. Quota exhaustion does not prevent reading saved workspaces or manual editing. Do not clear sessions or reset quotas to repeat the demo.

## Deployed release and rollback

- Live app: https://web-live-ai-staging.up.railway.app/app
- Final API deployment: `66d06006-bdab-48ac-b103-5e0c2e0435c4` (SUCCESS).
- Web deployment: `362ee430-a135-415c-9626-5b549a4fe85a` (SUCCESS).
- Pre-feature rollback: API `74e7bc70-e2bb-4e12-a371-3d7052214904`, web `99dfc06d-4dc7-4927-90b5-e9e33a42b27d`. Roll back only Live AI Staging and preserve its volume. The optional JSON field is backward compatible; no migration/reset is required.
- After the final API restart the existing anonymous browser still had its same 5/5 daily usage, EUR 2,000 budget, saved research, two potential listings and nine handoffs. No paid retest was made.
- The saved demo workspace is private to its original browser session. Other visitors must create their own workspace; a 404 for its UUID from another browser is intentional.
