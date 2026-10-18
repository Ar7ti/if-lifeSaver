# Smart Visual Shopping and Scenario Comparison — contract 1.7.0

## Existing implementation and root causes

The application already had source links, optional offer images, a deterministic scenario engine, and a compact three-way selector. This change extends them.

Previously, research extraction always set `imageUrl` to null; the cart reconstructed imagery from retained research instead of preserving a selected listing snapshot. Fallbacks mapped desks/chairs to sofas and cars to generic packages. The scenario engine deliberately excluded all demo offers, considered every cart line a covered category regardless of confirmation, and defaulted unknown delivery/effort to Medium. Balanced preferred the research score; Comfort preferred delivery/availability then that same score, often selecting the same candidate. Finally, “Plan with” saved only a browser-local selector; a separate sequential add operation could partly succeed.

Identical outcomes are sometimes correct. This implementation explains them instead of manufacturing different totals.

## Images and shopping needs

- `shared/contracts/visuals.ts` maps structured categories and aliases to relevant category icons. A title can narrow a broad category, but descriptions never choose the icon. Unknown categories use a neutral package/service visual.
- Explicit shopping needs such as sofa, bed and desk are stored in optional `preferences.requiredItems`, extracted deterministically from affirmative purchase/need clauses and filtered against owned resources. This is not a separate task list or a priced purchase.
- Research and cart use the shared `ProductVisual`. Stable dimensions, lazy loading, asynchronous decoding, no-referrer requests, broken-photo fallbacks, and image-state reset on replacement keep the workspace usable without photos.
- A category illustration is explicitly labeled as such. A provider photo is labeled as provider-supplied. Cited-summary imagery is labeled source-reported and not independently verified.
- Only validated public HTTPS image URLs are accepted; credentials, private literal hosts, unsafe schemes, SVG/HTML documents and arbitrary embedded markup are rejected. The server does not proxy-fetch arbitrary image URLs. Remote hosts still receive an ordinary image request, including the viewer's IP; no claim of anonymous third-party image delivery is made.
- No image generation or separate decorative image search was introduced.

### Research image extraction

The existing bounded two-call research pipeline remains: hosted search, then tool-free structured extraction. An optional image URL needs a verbatim image quote containing both the exact product title and that URL in the same cited passage. Unsupported, cross-product and unsafe URLs become null. Assembly details also require title-specific verbatim evidence.

These are **generated cited search summaries**, not independently fetched merchant pages. Prices remain estimated/source-reported, and imagery remains source-reported. An authorized structured provider can supply provider imagery through the same `Offer` contract. Merchant media-display terms must be respected by each provider; this feature does not bypass access restrictions or establish blanket media rights. When imagery cannot be supported, the category icon is the intended result.

## Additive contracts and persistence

Existing fields (`category`, `sourceUrl`, `priceMinor`, currency, condition, seller, `lastCheckedAt`) retain their meanings. Optional additions:

- Offer imagery: `imageType` (`listing`, `category`, `demo`), `imageSource` (`provider`, `cited_summary`, `demo`). `imageUrl` uses the stricter shared product image validator.
- `priceOrigin`: `user`, `ai_estimate`, `source_reported`, `source_confirmed`, `demo`. A user-edited price is never upgraded to verified by supplying a URL.
- Offer `fulfillment`: assembly status and evidence.
- Cart preserves imagery, merchant, kind, condition, price provenance and check timestamp as a selection snapshot, plus at most five previous choices for undo.
- Scenarios have optional structured `changes`, input `fingerprint`, `sourceMode`, `feasibility`, `explanation`, and `convenienceEvidence`. Convenience/effort accept `unknown`.
- Project `scenarioSelection` stores selected strategy, application timestamp, input fingerprint and whether changed shopping inputs need review.

Old projects and items without the new optional fields still parse. Older image URLs that no longer meet the rendering policy (for example SVG documents) normalize to null, preserving the project and showing a category fallback. Legacy scenarios are recalculated on read if their fingerprints are absent or current inputs differ, without AI calls or a storage migration. Fingerprints include the provider's demo policy and sort object keys, so serialization order cannot invalidate an unchanged plan. New project writes continue through the existing validated, serialized repository and atomic JSON replacement.

## Replacement and real scenario application

### Routes

All routes are nested under `/api/projects/:projectId` and inherit the existing authentication, ownership and public-mode CSRF boundary.

- `POST /cart/items/:itemId/replace`: `{offerId, approved:true, allowSelected?:boolean, expectedRevision}` → `{project}`.
- `POST /cart/items/:itemId/undo-replacement`: `{approved:true, allowSelected?:boolean, expectedRevision}` → `{project}`.
- `POST /scenarios/:scenarioId/apply`: `{approved:true, expectedRevision, expectedFingerprint}` → `{project}`.

Replacement is one atomic project update. The line ID, quantity and planning status stay intact; the actual alternative's saved amount, source and metadata replace the old choice. Known delivery is once per line, not once per unit. Unknown delivery remains excluded with a warning. Unavailable, stale, wrong-category, duplicate and preference-incompatible candidates are rejected.

`selected` means chosen for planning, not purchased. It remains fixed in every automatic comparison. Replacing it requires an explicit checkbox and `allowSelected:true`. `proposed` lines can be replaced by a scenario after its changes are reviewed. Multiple lines in the same purchase group and ambiguous bundles remain fixed for automatic selection; they can be reviewed individually.

Undo restores the previous server-saved selection. A revision conflict prevents an old undo from overwriting newer work. Previous prices retain their original provenance/timestamp; undo does not reverify them.

Applying a scenario recomputes it against the saved fingerprint, validates budget/reserve and applies all add/replace operations in one repository transaction. An error cannot leave half a plan saved. New scenario choices remain proposals. Repeated application cannot duplicate expenses. Unresolved allocation estimates are not converted into fake cart items.

The former browser-local chosen-scenario setting is no longer the source of truth. The selected strategy and actual cart survive reload. Budget, cart, comparison and assistant views all use the same saved project.

## Deterministic scenario rules

Money uses integer EUR cents. Every approach includes fixed/chosen spending, retained applicable proposals and the already-normalized insurance planning horizon exactly once. Quantity multiplies the item amount; recorded line fees are added once. Unknown taxes, delivery charges or running costs are excluded and disclosed. Unsupported currencies are rejected by existing EUR contracts.

One affordable candidate is selected per uncovered purchase group or replaceable single proposal. Owned items and irrelevant groups remain excluded. The algorithm reserves the lowest eligible known cost (or disclosed remaining allocation estimate) for later groups before selecting the current group's option. Existing user allocations and emergency reserve are not silently rewritten.

- **Economy:** lowest recorded total cost, including known line fees; deterministic ID tie-break.
- **Balanced:** validated existing research ranking × 70%, relative known-cost value × 20%, documented logistics × 10%. Relative value is cheapest eligible group cost / candidate group cost (free options receive full cost value). This is an explainable ordering heuristic, not quality certification or statistical confidence.
- **Comfort:** documented logistics first, then lower recorded total cost and stable ID. It does not infer convenience from stock status alone.

Logistics ordering: pickup = 0; known delivery with assembly required or unspecified = 1; known delivery and explicitly included assembly = 3. Missing assembly information earns no advantage over known self-assembly. Unknown delivery/charges or unsupported service logistics have no convenience rating.

Displayed convenience: Low when any included physical choice needs pickup; High only when every considered delivery state reports delivery with a known charge; otherwise Unknown. Displayed effort: High for pickup; Low when delivery is established and all physical assembly is explicitly included; Medium when delivery is established and all assembly states are known but some assembly is required; otherwise Unknown. These labels describe recorded logistics only, not product quality, travel duration, distance or guaranteed effort. Evidence and uncertainties are shown beside them.

Missing candidate data uses the prior disclosed allocation-based planning estimates, not arbitrary Economy/Balanced/Comfort price multipliers. All totals may legitimately coincide; the UI explains why and offers explicit research. Budget feasibility does not mean all prices or practical arrangements have been confirmed.

## Demo and AI

`RESEARCH_MODE=demo` explicitly enables the same engine to consider fictional demo candidates. Other modes do not silently substitute demo listings after a live failure. Demo source labels, prices and fulfillment assumptions are prominent. Its three fixtures differ in pickup/delivery/assembly and have no real seller or source links. Photos default to honest category illustrations.

The existing AI research and comparison actions are reused, not duplicated. Visual-shopping requests propose the same paid research workflow; a confirmed research/comparison action opens its relevant workspace section. AI receives compact computed comparison summaries and existing offers. It cannot directly invoke replacement or application without the UI's review. Free-form model verification claims are rejected; structured price verification still requires the existing checked-source contract. No image URL or product price is invented by the visual resolver.

All actual model/search calls remain behind `paidProviderCall`; new deterministic cart/scenario operations make no model calls. Tests exercise anonymous isolation, CSRF, daily research allowance exhaustion and the existing independent administrator behavior. This feature does not merge, enable or deploy public-access functionality.

## Files for this task

New: `shared/contracts/shopping.ts`, `shared/contracts/visuals.ts`, `server/src/shopping.ts`, `server/tests/shopping.test.ts`, `src/components/ui/ProductVisual.tsx`, `src/features/widgets/research/ReplaceItemDialog.tsx`, `tests/ui/shopping.spec.ts`, this document, screenshots under `server/docs/shopping/`.

Updated: `shared/contracts/index.ts`; backend `finance.ts`, `service.ts`, `app.ts`, `research.ts`, `scenario-profile.ts`, `ai.ts`; API adapters `types.ts`, `live.ts`, `mock.ts`; `ShoppingCart.tsx`, `ScenarioSimulator.tsx`, research `OfferImage.tsx`, `OfferCard.tsx`, `ResearchCatalog.tsx`, `labels.ts`; assistant `ActionCard.tsx`; existing AI/finance/research tests; frontend handoff. A narrow `min-w-0` fix to existing ProjectOverview summary cards prevents a mobile overflow exposed by longer shopping warnings. No global redesign or dependency addition.

Earlier uncommitted public-access, deployment, timeline and video-production work was preserved.

## Reproduce the complete demo without paid calls

1. Run the normal local backend with `AI_MODE=local`, `RESEARCH_MODE=demo`, `STORAGE_MODE=local` and a development-only data directory. Run Vite against that backend. Use API data, not the separate browser-only Demo data adapter.
2. Create: **“I'm moving to Turku with EUR 2000 and need a sofa, bed, and desk.”** The explicitly requested items appear as visual needs. Owned resources are not requested again.
3. Optionally set a transparent provisional allocation: EUR 1000 moving, EUR 800 furniture, EUR 200 reserve. The moving amount is a user planning estimate, not a mover's quote.
4. Click Sofa, Bed and Desk to research each explicitly. The demo shows fictional prices and category illustrations. Real provider-reported photos appear only if supported; missing photos are expected and usable.
5. Open Compare your options. Inspect item differences, incomplete costs and logistics evidence. Under the demo allocation the strategies can produce genuinely different choices.
6. Choose Comfort, review **What would change**, and confirm. Inspect the real proposed cart and budget. Unpriced moving allocation is still an estimate, not a new fake cart charge.
7. In the cart, Replace a more expensive sofa/bed with a cheaper saved alternative. Approve modifying a chosen line if applicable. Verify the saving, preserved quantity, and no second expense. Try Undo.
8. Reload: the cart, budget, imagery/provenance snapshot and selected strategy remain saved; relevant changes flag the saved selection for review.
9. Ask “Find a cheaper sofa” or “Compare economy and comfort.” Review actions before research runs or the comparison opens. No transaction is performed.

## Commands

```sh
npm --prefix server test
npm --prefix server run typecheck
npm --prefix server run build
npm run typecheck
npm run build
npx playwright test --reporter=line
```

Known limitations: EUR only; simple deterministic logistics rules, not delivery guarantees or route optimization; live photos depend on cited source metadata and are not independently verified; remote image hosts see normal image requests; a shared broad category can remain an ambiguous fixed bundle; missing costs remain provisional. Browser-only mock mode asks for a backend for replacements/scenario application, matching other server-backed features. No production deployment or live paid-provider validation was performed.

## Executed verification

- Backend: **247 passed, 0 failed**, including HTTP endpoints, disk restart, replacement/undo, atomic application, mode-change invalidation, canonical fingerprints, recurring insurance horizons, anonymous ownership/CSRF and quota exhaustion. External providers are mocked; no OpenAI credits were spent.
- Full Playwright UI regression: **37 passed**. Separate public-access browser suite: **5 passed** using isolated local ports and unchanged security limits. Focused shopping browser reruns: **3 passed**, including cached/broken/deferred images, actual research → apply → replace → undo → reload, chosen-item approval, mobile overflow and reduced motion.
- Frontend and backend production builds succeeded; both TypeScript checks succeeded. `git diff --check` passed.
- An initial combined UI run reached the real shared request limiter. Fixture setup now waits for the advertised rate-limit window instead of weakening server protection. A later backend run caught object-order-dependent fingerprints; canonical serialization fixed it, and the full backend suite passed again.
- Screenshots: [desktop](shopping/desktop.png), [mobile](shopping/mobile.png). These show actual controlled fictional fixtures, not real merchant quotes.

### Ready local demonstration

With the isolated development preview running, open:

`http://127.0.0.1:5186/app/p/cd47e204-54c6-435a-b7ca-58b4152dc9fe`

The saved fictional Turku move includes three researched categories. Recorded comparison totals are Economy **EUR 1,360**, Balanced **EUR 1,600**, Comfort **EUR 1,780**. These include the explicitly provisional EUR 1,000 moving allocation and exclude unknown costs. Applying Comfort created three proposed lines totaling EUR 780. Explicitly replacing one line with a cheaper saved option reduced proposed spending to EUR 570 (**EUR 210 saving**), kept three lines, and flagged the saved Comfort strategy for review. State survived backend restart. Nothing was purchased, booked, or submitted to an insurer.

Changes remain local and uncommitted. No branch merge, push, production deployment, Railway change, credential change, or paid live-research validation was performed for this task.
