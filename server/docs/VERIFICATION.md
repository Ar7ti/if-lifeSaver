# Contextual planning verification — 2026-10-17

This refinement preserves the existing app and frontend design. Backend workstreams were coordinated through Superset terminals with disjoint file ownership; the coordinator integrated the changes and ran the checks below.

## Changes and root causes

- Keyboard handlers did not exclude editable event origins, and Enter submission did not guard IME composition. Global/menu handlers now ignore native inputs, textareas, selects, contenteditable and ARIA editing controls. Composer/chat guard composition and keyCode 229; ordinary editing and browser shortcuts keep their native behavior. No blanket event suppression was added. Ordinary letter typing did not reproduce a separate workspace hotkey bug during the audit; the observed unguarded handlers and composition submission paths were corrected.
- Details used the default narrow dialog and lacked a clearly bounded scrolling body. Dialogs now portal to the document body; header/footer stay accessible and the form scrolls within viewport bounds. Details is 768px wide on suitable desktops and uses the mobile viewport height. Visual screenshots were inspected at 1440×900 and 390×360; automated bounds/actions checks also cover 768×600 and 390×640.
- Moving defaults forced irrelevant widgets/categories/questions. A scenario profile now separates intent, relevant categories with reasons, essential questions, tasks, recommendations, budget weights and supported widget selection. OpenAI Structured Outputs enrich grounded plans; local mode uses the same deterministic profiles. Owned furniture/items do not require repurchase. User allocations and selected cart lines remain intact.
- Scope is gated on the server before model calls. Practical planning and contextual follow-ups pass; unrelated tutorials redirect; ambiguity prompts clarification. Education/course logistics and safety remain allowed. Model instructions reinforce scope and treat retrieved content as untrusted.
- Research preserves specific categories, builds diverse contextual queries and validates citation-scoped evidence. Relevance, locality, explicit constraints, duplicates, known total costs, budget fit and supported attributes guide filtering/ranking. Finnish moving terms, country-wide versus city searches, and street/landmark uncertainty were corrected after live failures. Grouped EUR prices are parsed deterministically; malformed/mixed grouping and unit rates stay unknown.
- Question answers persist on the server and enter compact AI context. Travel dates/party, vehicle use, owned inventory and other edited constraints affect planning/research. Detailed category slugs share their financial envelope without duplicate scenario purchases. Hotels/services get fee/quote checks instead of shipping warnings.

## Automated results

- Backend: **163 tests passed, zero failed**. Tests cover mocked OpenAI/search, all three contextual API workflows, scope, financial arithmetic/overflow, selected cart preservation, descriptive category aliases, scenarios, risks, question persistence/restart, strict schemas, errors, auth/origins/rate limits, timeouts and actual TCP handling beyond ten seconds.
- Browser: **10 Playwright tests passed, zero failed**. Native typing, spaces/numbers/arrows/backspace, Shift+Enter, selection/undo, IME Enter handling, Escape, editable controls and uncancelled editing shortcuts; Details at four viewports; moving, travel and car workflows through actual local API creation, details, fictional research, cart, assistant proposals and refresh; structured travel answers across reload.
- Backend TypeScript/build and frontend production build passed. `git diff --check` passed.
- Browser workflows use local planning and explicitly fictional demo research. IME is synthetic composition coverage; a physical mobile virtual keyboard and native IME session were not tested.

## Live integration observations

The configured `gpt-6.1-sol` Responses API created all three goals correctly: moving to Turku with €2,000 and owned bed/desk; Helsinki–Rome for five days with €900; a used car in Finland under €4,000. Categories, questions and widgets were contextual; general Python tutorials were redirected and follow-ups produced reviewable actions. Initial live search runs exposed false category/locality exclusions, which were fixed and regression-tested.

The final provider retest returned **2 moving-service sources, 1 Rome accommodation source, and 4 car candidates**. Moving/accommodation prices remained unknown. Reported car item prices were estimated, not independently verified, and delivery/availability/seller details remained unknown where unsupported. Some source links are marketplace result pages rather than a stable individual listing. All results remained `limited`; no purchase, booking or message was made.

One earlier car search hit the 90-second deadline; empty or limited searches also occurred. Live results and response times are variable. The final provider retest used the updated provider against saved project context; complete HTTP/browser workflows were separately covered by deterministic tests. Reports are retained locally under `server/data/context-live-test-report.json`, `context-research-retest.json`, and `car-research-retest.json` and are ignored by Git. The full HTTP report retains the earlier timeout rather than rewriting it as success.

## Repeat verification

```sh
npm --prefix server test
npm --prefix server run build
npm run build
npx playwright install chromium
npm run test:ui
```

Playwright starts/reuses isolated API 3002 and Vite 5174 test servers. Keep the frontend API data source selected for contextual planning; its separate frontend-only mock adapter remains a fixed, labelled moving fixture. Credential-free contextual mode is `AI_MODE=local` with optional `RESEARCH_MODE=demo` on the backend.

For credit-consuming live HTTP verification, start the configured live server and run `cd server && npm run check:context-live`. `check:api-live` exercises priced moving research, cart and assistant confirmation; it reports an empty market search as inconclusive. See [frontend handoff](FRONTEND_HANDOFF.md) for contract 1.1.0 fields and integration details.

## Remaining limits

English scope/parser rules are bounded; unusual or multilingual phrasing may need clarification. Profiles cover six scenario families, with a minimal generic plan for other supported life goals. Search summaries are not raw verified source APIs; prices, availability, delivery and seller identity require source confirmation. Local storage remains a single-process, single-user demo repository; no transaction execution is implemented. Existing saved layouts are preserved rather than silently rewritten into new templates.
