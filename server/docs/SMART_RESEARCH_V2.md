# Smart Research Engine v2

## Implementation and diagnosis

The earlier live sofa test executed three hosted tool calls and discovered 40 source URLs, but produced only two cited candidate paragraphs. Both candidates were removed because used condition was unknown. Forty discovered URLs are not forty extracted listing descriptions: the extraction call receives only citation-scoped generated summaries. The old all-or-nothing filter also removed relevant candidates with unknown required prices or locality. These facts are visible in `live-ai-staging/bounded-live-test.json` and the prior `research.ts` flow. The previous live trace does not retain the underlying paragraphs, so it cannot establish whether a particular Finnish phrase or actual absence of matching listings caused the missing condition.

V2 separates discovery, evidence, eligibility and ranking. It improves query targeting and summary structure while preserving hard safety checks. It does not turn missing evidence into confirmation or promise more real listings.

## Strategy and provider boundary

`server/src/research-strategy.ts` provides deterministic, configurable source hints and three prioritized query stages. Finnish-market searches include relevant terminology such as `sohva`, `käytetty` and `myydään`. Strategies cover used furniture, new goods, rentals, vehicles, transportation, moving services and official information. All existing structured constraints remain in `research-intent.ts` and final validation, including the price period, origin/destination, dates and party size. A broader discovery query never authorizes a broader accepted match.

Marketplace/provider names are discovery hints, not authorized API integrations or permission to scrape. **No direct page fetch, source-specific HTML parser, browser automation or CAPTCHA bypass was added.** The existing hosted tool supplies references; accessibility, current inventory, seller truth and media rights are not independently checked. A source image remains source-reported; absent or broken images use the existing labeled category illustration.

The existing OpenAI Responses pipeline remains two separately metered SDK calls: one required hosted-search response (maximum three tool calls), then one strict structured extraction response without tools. No added paid ranking, retry, image search or automatic refinement. Model, timeouts and provider abstraction are preserved. New extraction instructions retain incomplete relevant candidates, explicit field labels and original Finnish condition wording. English/Finnish explicit condition evidence is recognized; marketplace names and “good condition” alone do not establish used condition.

## Evidence and two result groups

There is still **one `ResearchResult.offers` array**. Optional offer metadata adds:

- `eligibilityStatus`: `supported` or `potential`.
- `evidenceByField`: status, short snippet and provenance for meaningful fields.
- `missingEvidence`: field, reason and whether it is required for the current request.
- `confidenceExplanation`: plain-language limitations, without confidence percentages.

`source_supported` means supported by an assistant-generated cited search summary, **not raw-page, independent or current-stock verification**. A source-reported amount retains the existing estimated price status; monthly rates retain their period and never become a one-time purchase price.

Supported matches have evidence for applicable hard criteria. Potential leads have genuine cited identity/relevance but unknown required fields. Known wrong category, wrong locality/condition, excessive price, explicitly unavailable stock, unsafe URL, conflicting duplicate reports and category pages masquerading as listings are still rejected. Unknown price is null, never zero. Explicit Finnish `myyty` is treated as unavailable rather than silently ignored.

Ranking is deterministic: supported before potential, then the requested price/relevance ordering; unknown prices follow known prices. Positive workspace feedback can improve ordering within a group. No invented distance, convenience or effort scores.

Results optionally include summary counts, refinements and bounded rejection diagnostics. “No supported matches,” “no useful listing evidence,” and provider failure remain distinct. Refinement buttons only compose an assistant message; the user must approve constraint changes and any new paid research.

## Feedback and persistence

`POST /api/projects/:projectId/research/:resultId/feedback`

```json
{"offerId":"<UUID>","type":"useful","expectedRevision":7}
```

Types: `useful`, `not_relevant`, `outdated`, `incorrect_details`; `null` clears feedback. Response: `{ "project": LifeProject }`.

Feedback is saved in optional `LifeProject.researchFeedback`, through the existing repository update/revision queue. Ownership and CSRF apply before the handler. URLs are normalized only for project-local identity; no cross-visitor cache or new authentication is introduced. Negative feedback hides the source and excludes it from future results in the same project. Users can reveal or clear hidden feedback. Positive feedback can affect local ordering. No automatic searches, retraining claims or provider calls occur. Clearing feedback remains possible after the original research record has been pruned.

Potential or negatively reviewed offers cannot be added/replaced through cart or confirmed AI actions, and cannot enter scenario alternatives. Existing fixed/confirmed cart items remain intact. The source link can be reviewed or used for a seller inquiry; an unconfirmed amount is never silently entered into a budget.

## Compatibility and UI

Shared contract **1.9.0** adds optional fields; old saved projects parse without a destructive migration. Prior live results use “Earlier results — review details”; fictional demos remain labeled as demo data. Actual source photos continue through the existing HTTPS image validation/lazy loading/fallback system.

The existing catalog now shows “Matches your criteria,” “Potential matches — check details,” missing facts, source links, feedback, and small search-refinement actions. It preserves cards, typography, responsive layout, reduced-motion support and error/retry patterns. The AI receives compact result summaries, missing fields and feedback, not raw webpage contents or additional personal data.

## Files in this focused change

- Shared: `shared/contracts/research.ts`, `shared/contracts/index.ts`.
- Backend: new `server/src/research-strategy.ts`, `server/src/research-evidence.ts`; integration in `research-intent.ts`, `research.ts`, `service.ts`, `app.ts`, `finance.ts`, `ai.ts`.
- Frontend: `src/api/{types,live,mock}.ts`, `src/features/widgets/research/{ResearchCatalog,OfferCard}.tsx`.
- Tests/fixtures: `server/tests/research-v2.test.ts`, adjusted v2 expectations in `server/tests/research.test.ts`, local-only `server/scripts/research-v2-ui-fixture.ts`, `playwright.research-v2.config.ts`, `tests/research-v2/research.spec.ts`.
- Evaluation/docs: `server/scripts/evaluate-research.ts`, this document, frontend handoff and `server/docs/research-v2/` evidence.

Other dirty files predate this task and were preserved. No branch/history operations or production configuration changes were performed.

## Verification and demo

Offline tests use fictional fixtures, not internet results or paid calls:

```sh
npm --prefix server test
npm --prefix server run typecheck
npm --prefix server run build
npm run typecheck
npm run build
npx playwright test --reporter=line
npx playwright test --config playwright.research-v2.config.ts --reporter=line
```

The isolated public-access browser suite also runs through `playwright.public.config.ts`; use free ports if a user preview already occupies its defaults.

Local reproducible demo, with no OpenAI credentials:

1. Run `RESEARCH_V2_UI_FIXTURE=true ./server/node_modules/.bin/tsx server/scripts/research-v2-ui-fixture.ts` (binds localhost:3097 only; refuses Railway).
2. Run `LIFE_SIM_API=http://127.0.0.1:3097 npm run dev -- --host 127.0.0.1 --port 5197 --strictPort`.
3. Open http://127.0.0.1:5197/app, create a moving project with EUR 2,000 and a sofa/bed/desk requirement.
4. Research sofas. The explicit synthetic fixture displays one supported example and two potential examples, including an unknown price. These are not real listings.
5. Expand evidence, open a source link, try adding a potential lead (disabled), submit feedback, reload, reveal/clear feedback, and open a refinement without submitting a new search.
6. The real-provider demo uses the same UI on isolated live-ai-staging only; its real observed results may contain fewer or no matches. Never substitute the local fixtures for a failed live result.

Final test counts, live observations, costs and deployment identifiers are recorded separately in `research-v2/verification.json` and `research-v2/live-evaluation.json` once executed. The prior 40/2/0 baseline remains unchanged in its original evidence file.

## Limitations

Search summaries are lossy evidence. Some marketplaces block indexing or omit condition, location, price, dates or stock. V2 preserves useful incomplete leads but cannot fill unavailable facts. No direct accessibility/freshness checks or independent merchant verification are claimed. Date evidence is conservative: exact dates must appear in the cited context, so some valid but incompletely described fares remain potential. Source-type inference combines structured extraction and known category URL patterns; it is not a full page classifier. Feedback is project-local, not a learning model or cross-project history. All product groups need real-provider evaluations before claiming broad live quality improvements.

Five daily AI requests mean five SDK invocations, not five research operations; creation normally uses one and research two. A remaining allowance of one can finish discovery but block extraction. Provider timeouts may retain conservative estimated charges. The application budget and the provider's alert-only limit are not guaranteed hard monetary caps.

## Executed results — 2026-10-18

### Offline and browser verification

- **271 backend tests passed, zero failures.** This includes ten new v2 cases plus existing AI, insurance, shopping, financial, session, quota, concurrency, CSRF, administrator and legacy isolation regressions. External SDK responses are mocked; automated tests spent no OpenAI credits.
- **46 unique browser tests passed:** 38 existing UI, five public-access and three new v2 desktop/mobile/evidence/feedback tests. The new browser fixture uses an actual local Fastify API and shared contracts with clearly fictional data. It checks feedback reload, keyboard focus, reduced motion, image failure, disabled potential purchases, empty/legacy result compatibility, no automatic research and mobile overflow.
- Backend and frontend typechecks and builds passed. `git diff --check` passed. Neither package defines a lint command.
- Safe evaluator dry-run passed with zero paid calls.
- Local synthetic screenshots: `research-v2/desktop.png`, `research-v2/mobile.png`. These show implemented UI, **not live listing success**.

### Single bounded LIVE evaluation

Application: https://web-live-ai-staging.up.railway.app/app

Only the existing isolated **live-ai-staging** was deployed:

- API: `5c23279d-fa8d-4b78-8d40-f7e26735b2a2`.
- Web: `b881b207-f11f-47ab-8a27-1b9c15a5aae3`.
- Contract 1.9.0; health confirms `openai_sdk` for both providers. Production and public-access-staging deployment IDs stayed unchanged. No environment variables, credentials, deployment topology or volume settings were changed in this task.

Before testing, the signed-in OpenAI dashboard again showed project **life simulator** and its exact project ID; the staging credential authorized a nonbillable model lookup using that project header. Its USD 5 monthly limit still says **Limit not enforced**, with a 100% alert. `gpt-6.1-sol` retains 5,000 RPM / 1,000,000 TPM. Those limits are capacity controls, not a meaningful spend ceiling. The application's strict staging entrypoint, real provider provenance, Secure/HttpOnly/host-only/SameSite=Lax cookie, fresh UTC allowance, SQLite persistence, USD 3 public budget, separate administrator budget, one/three concurrency limits and conservative configured rates were checked. No production key was copied or exposed.

One anonymous session performed exactly one real project creation and one real sofa research operation, consuming **three model invocations** total. No paid follow-up, retry, quota bypass or broader search occurred. Public AI was paused immediately afterward through the durable administrator kill switch, and the administrator logged out.

| Metric | Previous live baseline | V2 single live test |
| --- | ---: | ---: |
| Hosted tool invocations | 3 | 3 |
| Discovered source URLs | 40 | 63 |
| Cited candidate passages | 2 | 1 |
| Extracted candidates | 2 | 1 |
| Supported offers returned | 0 | 0 |
| Potential leads returned | 0 | 0 |
| Rejected extracted candidates | 2 | 1 |
| Research latency | 25.3 seconds | 19.2 seconds |
| Research application cost estimate | USD 0.182281 | USD 0.173656 |

**The real sofa outcome did not improve.** More discovery URLs did not translate into useful listing evidence. The sole extracted title was “Harmaa shova, Turku,” linked to a source-reported auction reference. Its title did not establish the requested sofa identity under the lexical validator. The reference could not be retrieved through a single research-browser inspection, so this report does not claim it was a wrong product, current listing, accessible offer or usable price. No fuzzy synonym was invented to force acceptance. The generated source paragraphs were not retained as raw webpages. Potential classification is demonstrated by deterministic synthetic tests, not this live test.

Accepted direct links, usable prices, condition/location evidence and product photos were all **zero**. Constraint-match percentage is not applicable, rather than an invented 100%. The zero-result UI showed its actual summary and optional refinements; it did not substitute demo products.

Research used 33,304 input and 696 output tokens. The complete test's conservative application accounting was **USD 0.184417** including creation; research alone was USD 0.173656, including three USD 0.01 hosted-tool estimates. These use configured long-context-safe rates, not settled billing. The project-filtered provider Usage view still showed the earlier baseline of USD 0.13/five requests; it did not yet separately reflect this new three-request test. **Actual settled incremental provider cost is unknown.** Official model/pricing documentation was rechecked; no hard monetary cap is claimed.

Remote checks confirmed owner reload, EUR 2,000 budget preservation and saved research; another anonymous principal received 404 for read/update/research/assistant/protection and an empty own-workspace list. Paused research returned **503 PUBLIC_AI_DISABLED**, without another paid call. Final UTC usage: three public invocations, USD 0.184417 estimated, zero pending. The actual staging browser rendered the saved no-result summary without demo labeling and had no horizontal overflow at 390px. Its initial screenshots preceded result hydration and are not used as visual proof. Live feedback could not be exercised because no retained offer existed; owned feedback, restart persistence and CSRF were exercised through the local real HTTP/browser fixtures instead.

### Remaining work before claiming reliable second-hand search

The bottleneck remains discovery-to-cited-listing conversion and source accessibility, not just binary validation. A permitted structured listing API/feed or reliably accessible source evidence may be needed. Additional category-specific live evaluations require a separately approved bounded allowance. Do not claim that synthetic tests or more discovered URLs prove improved real-world shopping quality. Public AI remains paused; users can inspect saved workspaces and use non-AI functions.
